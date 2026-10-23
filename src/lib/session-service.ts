import { prisma } from "./db";
import { generatePseudonym } from "./pseudonym";
import { env } from "./env";
import type { AppUser } from "./auth";
import { IDEA_BOARD_PAGE, type BoardMode } from "@/types";
import type { BoardItemsDTO, PaceStats, QuestionDTO, SessionStateDTO, SlideMetadataDTO, StickyColor, Stroke } from "@/types";

export const STAFF_BOARD_ID = "STAFF";

/** Board "page" the class is currently writing on: the live slide, or 0 for the blank Idea Board. */
export function boardPage(s: { boardMode: string; currentSlidePage: number }) {
  return s.boardMode === "IDEAS" ? IDEA_BOARD_PAGE : s.currentSlidePage;
}

export async function getSessionByCode(code: string) {
  return prisma.classSession.findUnique({
    where: { sessionCode: code },
    include: {
      slideDeck: { include: { metadata: { orderBy: { pageNumber: "asc" } } } },
      section: { include: { course: true } },
    },
  });
}
export type FullSession = NonNullable<Awaited<ReturnType<typeof getSessionByCode>>>;

export function canControl(session: { section: { instructorId: string | null; course: { instructorId: string | null } } }, user: AppUser) {
  return user.role === "ADMIN" || session.section.instructorId === user.id || session.section.course.instructorId === user.id;
}

export function toMetadata(m?: { pageNumber: number; category: string; summary: string; difficultyLevel: number | null; keyTerms: string[] } | null): SlideMetadataDTO | null {
  return m ? { pageNumber: m.pageNumber, category: m.category, summary: m.summary, difficultyLevel: m.difficultyLevel, keyTerms: m.keyTerms } : null;
}

export function metadataFor(s: FullSession, page: number) {
  return toMetadata(s.slideDeck?.metadata.find((m) => m.pageNumber === page));
}

export async function buildSessionState(s: FullSession, user: AppUser, activeCount = 0): Promise<SessionStateDTO> {
  const base: SessionStateDTO = {
    sessionId: s.id,
    sessionCode: s.sessionCode,
    sessionTitle: s.sessionTitle,
    status: s.status,
    currentSlidePage: s.currentSlidePage,
    totalPages: s.slideDeck?.totalPages ?? 1,
    slideDeckId: s.slideDeckId,
    slideDeckTitle: s.slideDeck?.title ?? null,
    isBoardActive: s.isBoardActive,
    isBoardFrozen: s.isBoardFrozen,
    isSilentMode: s.isSilentMode,
    boardMode: (s.boardMode === "IDEAS" ? "IDEAS" : "SLIDE") as BoardMode,
    boardPrompt: s.boardPrompt,
    courseCode: s.section.course.courseCode,
    courseName: s.section.course.courseNameEn,
    activeCount,
    metadata: metadataFor(s, s.currentSlidePage),
  };
  if (user.role === "STUDENT" && user.studentId) {
    const [pace, ticket] = await Promise.all([
      prisma.paceSignal.findUnique({ where: { sessionId_slidePage_studentId: { sessionId: s.id, slidePage: s.currentSlidePage, studentId: user.studentId } } }),
      prisma.muddiestFeedback.findUnique({ where: { sessionId_studentId: { sessionId: s.id, studentId: user.studentId } } }),
    ]);
    base.myPseudonym = generatePseudonym(s.id, user.studentId);
    base.myPace = pace?.signalType ?? null;
    base.exitTicketSubmitted = !!ticket;
  }
  return base;
}

/** Record attendance + auto-enrol (so a QR scan is all a student ever needs to do). */
export async function markAttendance(s: FullSession, user: AppUser) {
  if (user.role !== "STUDENT" || !user.studentId) return;
  await prisma.sessionAttendance.upsert({
    where: { sessionId_studentId: { sessionId: s.id, studentId: user.studentId } },
    create: { sessionId: s.id, studentId: user.studentId },
    update: {},
  });
  const enrolled = await prisma.enrollment.findUnique({ where: { sectionId_studentId: { sectionId: s.sectionId, studentId: user.studentId } } });
  if (!enrolled && env.autoEnroll) {
    await prisma.enrollment.create({ data: { sectionId: s.sectionId, studentId: user.studentId, studentUserId: user.id } }).catch(() => undefined);
  } else if (enrolled && !enrolled.studentUserId) {
    await prisma.enrollment.update({ where: { id: enrolled.id }, data: { studentUserId: user.id } });
  }
}

export async function paceStats(sessionId: string, slidePage: number): Promise<PaceStats> {
  const rows = await prisma.paceSignal.groupBy({ by: ["signalType"], where: { sessionId, slidePage }, _count: true });
  const c = Object.fromEntries(rows.map((r) => [r.signalType, r._count])) as Record<string, number>;
  const total = (c.TOO_FAST || 0) + (c.CLEAR || 0) + (c.CONFUSED || 0);
  const pct = (n = 0) => (total ? Math.round((n / total) * 100) : 0);
  return { slidePage, tooFastPct: pct(c.TOO_FAST), clearPct: pct(c.CLEAR), confusedPct: pct(c.CONFUSED), slideConfusionCount: c.CONFUSED || 0, total };
}

export async function boardItems(sessionId: string, slidePage: number, viewer?: { studentId: string | null; isController: boolean }): Promise<BoardItemsDTO> {
  const items = await prisma.classBoardItem.findMany({ where: { sessionId, slidePage }, orderBy: { createdAt: "asc" } });
  const out: BoardItemsDTO = { slidePage, strokes: [], stickies: [] };
  for (const it of items) {
    const p = it.payloadJson as Record<string, unknown>;
    if (it.itemType === "DRAWING_PATH") {
      out.strokes.push({ id: it.id, displayPseudonym: it.displayPseudonym, points: p.points as Stroke["points"], color: String(p.strokeColor ?? p.color), width: Number(p.strokeWidth ?? p.width) });
    } else {
      const likedBy = Array.isArray(p.likedBy) ? (p.likedBy as string[]) : [];
      out.stickies.push({
        id: it.id, slidePage, displayPseudonym: it.displayPseudonym, text: String(p.text), color: p.color as StickyColor, x: Number(p.x), y: Number(p.y),
        likeCount: likedBy.length,
        likedByMe: !!viewer?.studentId && likedBy.includes(viewer.studentId),
        mine: viewer ? (viewer.isController ? it.studentId === STAFF_BOARD_ID : !!viewer.studentId && it.studentId === viewer.studentId) : false,
        createdAt: it.createdAt.toISOString(),
      });
    }
  }
  return out;
}

/** Root questions for a session, shaped for students (anonymous) or the instructor (with merged variants). */
export async function listQuestions(sessionId: string, viewer: { role: string; studentId?: string | null }): Promise<QuestionDTO[]> {
  const isStaff = viewer.role !== "STUDENT";
  const roots = await prisma.question.findMany({
    where: { sessionId, parentClusterId: null, isFlaggedInappropriate: false },
    orderBy: [{ isPinned: "desc" }, { upvoteCount: "desc" }, { createdAt: "asc" }],
    include: isStaff ? { children: { select: { polishedContent: true } } } : undefined,
  });
  let voted = new Set<string>();
  if (!isStaff && viewer.studentId) {
    const v = await prisma.questionUpvote.findMany({ where: { studentId: viewer.studentId, question: { sessionId } }, select: { questionId: true } });
    voted = new Set(v.map((x) => x.questionId));
  }
  return roots.map((q) => {
    const dto: QuestionDTO = {
      id: q.id,
      slidePage: q.slidePage,
      displayPseudonym: q.displayPseudonym,
      polishedContent: q.polishedContent,
      upvoteCount: q.upvoteCount,
      clusterSize: q.clusterSize,
      isPinned: q.isPinned,
      isAnswered: q.isAnswered,
      createdAt: q.createdAt.toISOString(),
    };
    if (isStaff) {
      dto.rawContent = q.rawContent;
      dto.variants = ((q as unknown as { children?: { polishedContent: string }[] }).children ?? []).map((c) => c.polishedContent);
    } else {
      dto.votedByMe = voted.has(q.id);
      dto.mine = q.studentId === viewer.studentId;
    }
    return dto;
  });
}

/** Pick a free spot for a sticky note (x,y in %) avoiding overlap with existing notes. */
export function placeSticky(existing: { x: number; y: number }[]): { x: number; y: number } {
  const W = 0.16, H = 0.16;
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = 0.04 + Math.random() * (0.92 - W);
    const y = 0.06 + Math.random() * (0.88 - H);
    if (existing.every((e) => Math.abs(e.x - x) > W || Math.abs(e.y - y) > H)) return { x, y };
  }
  return { x: 0.04 + Math.random() * 0.76, y: 0.06 + Math.random() * 0.72 };
}
