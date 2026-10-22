import { prisma } from "@/lib/db";
import { summarizeMuddiestPoints } from "@/lib/ai-service";
import { recalculateSectionRisk } from "@/lib/risk-engine";
import { recalculateTeachingEvaluation } from "@/lib/evaluation";
import { emitTo, roomAll, roomInstructor } from "../realtime";

/**
 * BullMQ job "close-session": runs after the exit-ticket window (or as soon as everyone submitted).
 * Idempotent — the status transition EXIT_TICKET → ENDED acts as a lock.
 */
export async function processSessionClose({ sessionId }: { sessionId: string }) {
  const locked = await prisma.classSession.updateMany({
    where: { id: sessionId, status: { in: ["LIVE", "EXIT_TICKET"] } },
    data: { status: "ENDED", endedAt: new Date() },
  });
  if (locked.count === 0) return { skipped: true };
  const session = await prisma.classSession.findUniqueOrThrow({ where: { id: sessionId } });

  const feedbacks = await prisma.muddiestFeedback.findMany({ where: { sessionId } });
  const topics = await summarizeMuddiestPoints(feedbacks.map((f) => f.muddiestText));
  const avg = feedbacks.length ? feedbacks.reduce((a, f) => a + f.comprehensionRating, 0) / feedbacks.length : null;

  // Most confusing slide = most CONFUSED signals, ties broken by number of questions on that page.
  const [conf, qByPage] = await Promise.all([
    prisma.paceSignal.groupBy({ by: ["slidePage"], where: { sessionId, signalType: "CONFUSED" }, _count: true }),
    prisma.question.groupBy({ by: ["slidePage"], where: { sessionId, isFlaggedInappropriate: false }, _count: true }),
  ]);
  const score = new Map<number, number>();
  conf.forEach((c) => score.set(c.slidePage, (score.get(c.slidePage) || 0) + c._count * 2));
  qByPage.forEach((q) => score.set(q.slidePage, (score.get(q.slidePage) || 0) + q._count));
  const mostConfusing = [...score.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  await prisma.sessionAiSummary.upsert({
    where: { sessionId },
    create: { sessionId, topMuddiestTopics: topics as object[], mostConfusingSlidePage: mostConfusing, avgComprehension: avg === null ? null : Math.round(avg * 100) / 100 },
    update: { topMuddiestTopics: topics as object[], mostConfusingSlidePage: mostConfusing, avgComprehension: avg === null ? null : Math.round(avg * 100) / 100 },
  });

  await recalculateSectionRisk(session.sectionId);
  await recalculateTeachingEvaluation(session.sectionId);

  await emitTo(roomInstructor(session.sessionCode), "session:summary_ready", { sessionId });
  await emitTo(roomAll(session.sessionCode), "session:ended", { sessionId });
  console.log(`[session-close] ${session.sessionCode}: ${feedbacks.length} exit tickets, ${topics.length} topics`);
  return { feedbacks: feedbacks.length };
}
