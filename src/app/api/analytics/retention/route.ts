import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { anonLabel, assertSectionAccess } from "@/lib/access";
import type { RiskRow } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET ?sectionId= → Early-warning list. Privacy guard: identity is only unlocked for CRITICAL
 * students (instructors) — advisors always see their own advisees.
 */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(["INSTRUCTOR", "ADVISOR"]);
  const sectionId = new URL(req.url).searchParams.get("sectionId") ?? "";
  await assertSectionAccess(user, sectionId);

  const [metrics, enrollments] = await Promise.all([
    prisma.studentRiskMetric.findMany({ where: { sectionId }, orderBy: { riskScore: "desc" } }),
    prisma.enrollment.findMany({ where: { sectionId }, include: { studentUser: true } }),
  ]);
  const enr = new Map(enrollments.map((e) => [e.studentId, e]));
  const rows: RiskRow[] = metrics
    .filter((m) => user.role !== "ADVISOR" || enr.get(m.studentId)?.advisorEmail === user.email)
    .map((m) => {
      const e = enr.get(m.studentId);
      const unlocked = m.riskLevel === "CRITICAL" || user.role === "ADVISOR" || user.role === "ADMIN";
      return {
        studentId: unlocked ? m.studentId : anonLabel(sectionId, m.studentId),
        displayName: unlocked ? e?.studentUser?.fullName ?? m.studentId : anonLabel(sectionId, m.studentId),
        isUnlocked: unlocked,
        email: unlocked ? e?.studentUser?.email : undefined,
        advisorEmail: unlocked ? e?.advisorEmail ?? null : undefined,
        attendanceRate: Number(m.attendanceRate),
        engagementRate: Number(m.engagementRate),
        avgComprehensionRating: Number(m.avgComprehensionRating),
        consecutiveLowRatings: m.consecutiveLowRatings,
        confusionSignalCount: m.confusionSignalCount,
        riskScore: Number(m.riskScore),
        riskLevel: m.riskLevel,
        interventionSentAt: m.interventionSentAt?.toISOString() ?? null,
      };
    });
  const summary = {
    total: rows.length,
    critical: rows.filter((r) => r.riskLevel === "CRITICAL").length,
    moderate: rows.filter((r) => r.riskLevel === "MODERATE").length,
    low: rows.filter((r) => r.riskLevel === "LOW").length,
    lastEvaluatedAt: metrics.reduce<Date | null>((a, m) => (!a || m.lastEvaluatedAt > a ? m.lastEvaluatedAt : a), null),
  };
  return json({ summary, rows });
});
