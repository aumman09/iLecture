import { handle, json } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSectionAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

/** GET ?sessionId= → post-class report: muddiest topics, comprehension, pace per slide, top questions. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(["INSTRUCTOR", "ADVISOR"]);
  const sessionId = new URL(req.url).searchParams.get("sessionId") ?? "";
  const s = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: { aiSummary: true, section: { include: { course: true } }, slideDeck: { include: { metadata: { orderBy: { pageNumber: "asc" } } } } },
  });
  if (!s) throw new HttpError(404, "Session not found");
  await assertSectionAccess(user, s.sectionId);
  const [attended, feedbacks, pace, questions, ratingDist] = await Promise.all([
    prisma.sessionAttendance.count({ where: { sessionId } }),
    prisma.muddiestFeedback.count({ where: { sessionId } }),
    prisma.paceSignal.groupBy({ by: ["slidePage", "signalType"], where: { sessionId }, _count: true }),
    prisma.question.findMany({
      where: { sessionId, parentClusterId: null, isFlaggedInappropriate: false },
      orderBy: { upvoteCount: "desc" },
      take: 10,
      select: { polishedContent: true, upvoteCount: true, clusterSize: true, isAnswered: true, slidePage: true },
    }),
    prisma.muddiestFeedback.groupBy({ by: ["comprehensionRating"], where: { sessionId }, _count: true }),
  ]);
  const perSlide: Record<number, { TOO_FAST: number; CLEAR: number; CONFUSED: number }> = {};
  pace.forEach((p) => {
    perSlide[p.slidePage] ??= { TOO_FAST: 0, CLEAR: 0, CONFUSED: 0 };
    perSlide[p.slidePage][p.signalType] = p._count;
  });
  return json({
    session: { id: s.id, title: s.sessionTitle, code: s.sessionCode, status: s.status, startedAt: s.startedAt, endedAt: s.endedAt, course: `${s.section.course.courseCode} ${s.section.course.courseNameEn}` },
    summary: s.aiSummary,
    attended,
    feedbacks,
    ratingDistribution: Object.fromEntries(ratingDist.map((r) => [r.comprehensionRating, r._count])),
    paceBySlide: perSlide,
    slides: s.slideDeck?.metadata.map((m) => ({ page: m.pageNumber, summary: m.summary, category: m.category })) ?? [],
    topQuestions: questions,
  });
});
