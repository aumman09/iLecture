import { handle, json } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSectionAccess } from "@/lib/access";
import { boardItems, listQuestions } from "@/lib/session-service";

export const dynamic = "force-dynamic";

/**
 * GET → everything recorded in one class session (read-only archive for the instructor):
 * questions (with merged variants), Idea Board pages, drawings on slides, exit-ticket summary.
 */
export const GET = handle(async (_req: Request, { params }: { params: { sessionId: string } }) => {
  const user = await requireUser(["INSTRUCTOR", "ADVISOR"]);
  const s = await prisma.classSession.findUnique({
    where: { id: params.sessionId },
    include: {
      section: { include: { course: true } },
      slideDeck: { include: { metadata: { orderBy: { pageNumber: "asc" } } } },
      aiSummary: true,
      _count: { select: { attendances: true, feedbacks: true, questions: true, boardItems: true } },
    },
  });
  if (!s) throw new HttpError(404, "Session not found");
  await assertSectionAccess(user, s.sectionId);

  const pages = await prisma.classBoardItem.groupBy({ by: ["slidePage"], where: { sessionId: s.id }, _count: true, orderBy: { slidePage: "desc" } });
  const viewer = { studentId: null, isController: true };
  const prompts = (s.ideaPrompts as Record<string, string | null>) ?? {};
  const ideaPages = [];
  const slideBoards = [];
  for (const p of pages) {
    const items = await boardItems(s.id, p.slidePage, viewer);
    if (p.slidePage <= 0) {
      const n = 1 - p.slidePage;
      ideaPages.push({ page: n, prompt: prompts[String(n)] ?? (n === 1 ? s.boardPrompt : null), ...items });
    } else slideBoards.push({ slide: p.slidePage, ...items });
  }
  ideaPages.sort((a, b) => a.page - b.page);
  slideBoards.sort((a, b) => a.slide - b.slide);

  const [questions, ratingDist] = await Promise.all([
    listQuestions(s.id, { role: "INSTRUCTOR" }),
    prisma.muddiestFeedback.groupBy({ by: ["comprehensionRating"], where: { sessionId: s.id }, _count: true }),
  ]);

  return json({
    session: {
      id: s.id, title: s.sessionTitle, code: s.sessionCode, status: s.status, startedAt: s.startedAt, endedAt: s.endedAt,
      course: { code: s.section.course.courseCode, name: s.section.course.courseNameEn, section: s.section.sectionNumber, semester: s.section.course.semester },
      sectionId: s.sectionId,
      slideDeckId: s.slideDeckId, slideDeckTitle: s.slideDeck?.title ?? null, totalPages: s.slideDeck?.totalPages ?? 0,
      counts: s._count,
    },
    summary: s.aiSummary,
    ratingDistribution: Object.fromEntries(ratingDist.map((r) => [r.comprehensionRating, r._count])),
    questions,
    ideaPages,
    slideBoards,
  });
});
