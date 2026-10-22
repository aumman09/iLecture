import { z } from "zod";
import { handle, json } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { submitQuestion } from "@/lib/question-service";
import { canControl, getSessionByCode, listQuestions } from "@/lib/session-service";

export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string().uuid(),
  slidePage: z.number().int().min(1).optional(),
  rawContent: z.string().trim().min(2).max(600),
  polishedContent: z.string().trim().max(600).optional(),
});

/** POST → submit a question (moderation + embedding + pgvector clustering). */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(["STUDENT"]);
  if (!user.studentId) throw new HttpError(403, "Student account required");
  const body = Body.parse(await req.json());
  const s = await prisma.classSession.findUnique({ where: { id: body.sessionId } });
  if (!s) throw new HttpError(404, "Session not found");
  if (s.status !== "LIVE") throw new HttpError(409, "This class has ended");
  const attended = await prisma.sessionAttendance.findUnique({ where: { sessionId_studentId: { sessionId: s.id, studentId: user.studentId } } });
  if (!attended) throw new HttpError(403, "Join the class first");
  // simple anti-spam: max 6 questions per minute per student
  const recent = await prisma.question.count({ where: { sessionId: s.id, studentId: user.studentId, createdAt: { gt: new Date(Date.now() - 60_000) } } });
  if (recent >= 6) throw new HttpError(429, "You're asking very fast — please wait a moment.");

  const result = await submitQuestion({
    sessionId: s.id,
    sessionCode: s.sessionCode,
    slideDeckId: s.slideDeckId,
    slidePage: body.slidePage ?? s.currentSlidePage,
    studentId: user.studentId,
    rawContent: body.rawContent,
    polishedContent: body.polishedContent?.trim() || body.rawContent,
  });
  if (result.status === "rejected") return json({ ok: false, ...result }, 422);
  return json({ ok: true, ...result });
});

/** GET ?sessionCode= | ?sessionId= → root questions for the caller's view */
export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const code = url.searchParams.get("sessionCode");
  const id = url.searchParams.get("sessionId");
  const s = code ? await getSessionByCode(code.toUpperCase()) : id ? await prisma.classSession.findUnique({ where: { id }, include: { section: { include: { course: true } } } }) : null;
  if (!s) throw new HttpError(404, "Session not found");
  if (user.role !== "STUDENT" && !canControl(s, user)) throw new HttpError(403, "Forbidden");
  return json({ questions: await listQuestions(s.id, { role: user.role, studentId: user.studentId }) });
});
