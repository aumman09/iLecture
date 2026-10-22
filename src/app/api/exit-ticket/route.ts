import { z } from "zod";
import { handle, json } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { extractTopicLabel } from "@/lib/ai-service";
import { promote } from "@/lib/queue";
import { emitTo, roomInstructor } from "@/server/realtime";

export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  muddiestText: z.string().trim().max(500).optional().default(""),
});

/** POST → submit post-class exit ticket (1–5 stars + muddiest point). */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(["STUDENT"]);
  if (!user.studentId) throw new HttpError(403, "Student account required");
  const body = Body.parse(await req.json());
  const s = await prisma.classSession.findUnique({ where: { id: body.sessionId } });
  if (!s) throw new HttpError(404, "Session not found");
  if (s.status === "ENDED") throw new HttpError(409, "The exit ticket for this class is closed");
  const text = body.muddiestText || "Nothing — all clear";
  await prisma.muddiestFeedback.upsert({
    where: { sessionId_studentId: { sessionId: s.id, studentId: user.studentId } },
    create: { sessionId: s.id, studentId: user.studentId, comprehensionRating: body.rating, muddiestText: text, extractedTopic: extractTopicLabel(text) },
    update: { comprehensionRating: body.rating, muddiestText: text, extractedTopic: extractTopicLabel(text) },
  });
  await prisma.sessionAttendance.upsert({
    where: { sessionId_studentId: { sessionId: s.id, studentId: user.studentId } },
    create: { sessionId: s.id, studentId: user.studentId },
    update: {},
  });
  const [submitted, attended] = await Promise.all([
    prisma.muddiestFeedback.count({ where: { sessionId: s.id } }),
    prisma.sessionAttendance.count({ where: { sessionId: s.id } }),
  ]);
  await emitTo(roomInstructor(s.sessionCode), "exit_ticket:progress", { submitted, attended });
  // Everyone answered → analyse immediately instead of waiting for the window to close.
  if (s.status === "EXIT_TICKET" && submitted >= attended) await promote("close-session", `close-${s.id}`, { sessionId: s.id });
  return json({ ok: true });
});
