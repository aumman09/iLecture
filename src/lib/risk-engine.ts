import { prisma } from "./db";
import type { RiskLevel } from "@/types";

/**
 * Module E — Early Warning & Retention Risk Engine.
 *
 * RiskScore = 0.25·A_deficit + 0.20·E_deficit + 0.30·C_deficit + 0.25·M_penalty   (each 0–100)
 *   A_deficit = min(100, max(0, 100 − AttendanceRate) × 2.5)
 *   E_deficit = 100 − EngagementRate
 *   C_deficit = ((5 − AvgComprehension) / 4) × 100
 *   M_penalty = min(100, ConsecutiveLowRatings × 35 + ConfusionSignalCount × 10)
 */
export interface RiskInputs {
  attendanceRate: number; // 0–100
  engagementRate: number; // 0–100
  avgComprehensionRating: number; // 1–5
  consecutiveLowRatings: number;
  confusionSignalCount: number;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

export function computeRiskScore(i: RiskInputs) {
  const A = clamp(Math.max(0, 100 - i.attendanceRate) * 2.5);
  const E = clamp(100 - i.engagementRate);
  const C = clamp(((5 - clamp(i.avgComprehensionRating, 1, 5)) / 4) * 100);
  const M = clamp(i.consecutiveLowRatings * 35 + i.confusionSignalCount * 10);
  const score = Math.round((0.25 * A + 0.2 * E + 0.3 * C + 0.25 * M) * 100) / 100;
  return { score, level: classifyRisk(score), components: { A, E, C, M } };
}

export function classifyRisk(score: number): RiskLevel {
  if (score >= 70) return "CRITICAL";
  if (score >= 40) return "MODERATE";
  return "LOW";
}

/** A rating of 1–2 stars counts as "low". */
export const LOW_RATING_MAX = 2;
/** Confusion signals are counted over the most recent N sessions so old struggles fade out. */
export const CONFUSION_WINDOW_SESSIONS = 3;
/** Sessions starting up to 12 h before enrolment still count (enrolled on the day of class). */
const ENROLL_GRACE_MS = 12 * 3600 * 1000;

/**
 * Recalculate risk metrics for every enrolled student of a section.
 * Uses all sessions that have finished (status ENDED or EXIT_TICKET).
 */
export async function recalculateSectionRisk(sectionId: string) {
  const [sessions, enrollments] = await Promise.all([
    prisma.classSession.findMany({
      where: { sectionId, status: { in: ["ENDED", "EXIT_TICKET"] } },
      orderBy: { startedAt: "asc" },
      select: { id: true, startedAt: true },
    }),
    prisma.enrollment.findMany({ where: { sectionId }, select: { studentId: true, createdAt: true } }),
  ]);
  const held = sessions.length;
  if (held === 0 || enrollments.length === 0) return { updated: 0 };
  const sessionIds = sessions.map((s) => s.id);
  const recentIds = new Set(sessionIds.slice(-CONFUSION_WINDOW_SESSIONS));

  const [att, tickets, qs, votes, paces] = await Promise.all([
    prisma.sessionAttendance.findMany({ where: { sessionId: { in: sessionIds } }, select: { sessionId: true, studentId: true } }),
    prisma.muddiestFeedback.findMany({ where: { sessionId: { in: sessionIds } }, select: { sessionId: true, studentId: true, comprehensionRating: true } }),
    prisma.question.findMany({ where: { sessionId: { in: sessionIds } }, select: { sessionId: true, studentId: true } }),
    prisma.questionUpvote.findMany({ where: { question: { sessionId: { in: sessionIds } } }, select: { studentId: true, question: { select: { sessionId: true } } } }),
    prisma.paceSignal.findMany({ where: { sessionId: { in: sessionIds } }, select: { sessionId: true, studentId: true, signalType: true } }),
  ]);

  const key = (s: string, st: string) => `${s}|${st}`;
  const attended = new Set(att.map((a) => key(a.sessionId, a.studentId)));
  const engaged = new Set<string>();
  tickets.forEach((t) => engaged.add(key(t.sessionId, t.studentId)));
  qs.forEach((q) => engaged.add(key(q.sessionId, q.studentId)));
  votes.forEach((v) => engaged.add(key(v.question.sessionId, v.studentId)));
  paces.forEach((p) => engaged.add(key(p.sessionId, p.studentId)));
  const ratingBy = new Map(tickets.map((t) => [key(t.sessionId, t.studentId), t.comprehensionRating]));

  let updated = 0;
  for (const { studentId, createdAt } of enrollments) {
    // Only sessions held after the student enrolled count (late / auto-enrolled students aren't penalised).
    const since = createdAt.getTime() - ENROLL_GRACE_MS;
    const mine = sessions.filter((s) => s.startedAt.getTime() >= since || attended.has(key(s.id, studentId))).map((s) => s.id);
    const heldForStudent = mine.length;
    if (heldForStudent === 0) continue;
    let present = 0, active = 0, ratingSum = 0, ratingN = 0;
    for (const sid of mine) {
      const k = key(sid, studentId);
      if (attended.has(k)) present++;
      if (attended.has(k) && engaged.has(k)) active++;
      const r = ratingBy.get(k);
      if (r !== undefined) { ratingSum += r; ratingN++; }
    }
    // consecutive low ratings counted backwards from the latest session the student rated
    let consecutiveLow = 0;
    for (let i = mine.length - 1; i >= 0; i--) {
      const r = ratingBy.get(key(mine[i], studentId));
      if (r === undefined) continue;
      if (r <= LOW_RATING_MAX) consecutiveLow++;
      else break;
    }
    const confusion = paces.filter((p) => p.studentId === studentId && p.signalType === "CONFUSED" && recentIds.has(p.sessionId)).length;

    const inputs: RiskInputs = {
      attendanceRate: (present / heldForStudent) * 100,
      engagementRate: (active / heldForStudent) * 100,
      avgComprehensionRating: ratingN ? ratingSum / ratingN : present > 0 ? 3 : 5,
      consecutiveLowRatings: consecutiveLow,
      confusionSignalCount: confusion,
    };
    const { score, level } = computeRiskScore(inputs);
    await prisma.studentRiskMetric.upsert({
      where: { sectionId_studentId: { sectionId, studentId } },
      create: {
        sectionId, studentId,
        attendanceRate: round2(inputs.attendanceRate), engagementRate: round2(inputs.engagementRate),
        avgComprehensionRating: round2(inputs.avgComprehensionRating), consecutiveLowRatings: consecutiveLow,
        confusionSignalCount: confusion, riskScore: score, riskLevel: level,
      },
      update: {
        attendanceRate: round2(inputs.attendanceRate), engagementRate: round2(inputs.engagementRate),
        avgComprehensionRating: round2(inputs.avgComprehensionRating), consecutiveLowRatings: consecutiveLow,
        confusionSignalCount: confusion, riskScore: score, riskLevel: level, lastEvaluatedAt: new Date(),
      },
    });
    updated++;
  }
  return { updated };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
