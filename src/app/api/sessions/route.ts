import { z } from "zod";
import { handle, json } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateSessionCode } from "@/lib/session-code";

export const dynamic = "force-dynamic";

const Body = z.object({ sectionId: z.string().uuid(), slideDeckId: z.string().uuid().nullable().optional(), title: z.string().max(200).optional() });

/** POST → start a live session. Ends any other LIVE session of the same section first. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(["INSTRUCTOR"]);
  const body = Body.parse(await req.json());
  const section = await prisma.courseSection.findUnique({ where: { id: body.sectionId }, include: { course: true } });
  if (!section) throw new HttpError(404, "Section not found");
  if (user.role !== "ADMIN" && section.instructorId !== user.id && section.course.instructorId !== user.id) throw new HttpError(403, "Not your section");
  let deck = null;
  if (body.slideDeckId) {
    deck = await prisma.slideDeck.findFirst({ where: { id: body.slideDeckId, courseId: section.courseId } });
    if (!deck) throw new HttpError(404, "Slide deck not found for this course");
  }
  // Resume an existing live session for the same section + deck instead of creating duplicates.
  const live = await prisma.classSession.findFirst({ where: { sectionId: section.id, status: "LIVE" }, orderBy: { startedAt: "desc" } });
  if (live && live.slideDeckId === (deck?.id ?? null)) return json({ sessionId: live.id, sessionCode: live.sessionCode, resumed: true });
  if (live) await prisma.classSession.update({ where: { id: live.id }, data: { status: "ENDED", endedAt: new Date() } });

  const sessionCode = await generateSessionCode();
  const title = body.title?.trim() || deck?.title || `${section.course.courseCode} Lecture`;
  const s = await prisma.classSession.create({
    data: { sectionId: section.id, slideDeckId: deck?.id ?? null, sessionTitle: title, sessionCode },
  });
  return json({ sessionId: s.id, sessionCode: s.sessionCode });
});

/** GET → instructor's recent sessions */
export const GET = handle(async () => {
  const user = await requireUser(["INSTRUCTOR", "ADVISOR"]);
  const sessions = await prisma.classSession.findMany({
    where: user.role === "ADMIN" ? {} : { section: { OR: [{ instructorId: user.id }, { course: { instructorId: user.id } }] } },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { section: { include: { course: true } }, aiSummary: true, _count: { select: { attendances: true, questions: true, feedbacks: true } } },
  });
  return json({ sessions });
});
