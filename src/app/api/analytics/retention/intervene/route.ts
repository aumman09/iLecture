import { z } from "zod";
import { handle, json } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSectionAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

/**
 * POST { sectionId, studentId } → logs an intervention for a CRITICAL student and returns a
 * ready-to-send notice (to student, cc advisor + instructor). The client opens it in the mail app.
 */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(["INSTRUCTOR", "ADVISOR"]);
  const { sectionId, studentId } = z.object({ sectionId: z.string().uuid(), studentId: z.string().min(1) }).parse(await req.json());
  const section = await assertSectionAccess(user, sectionId);
  const m = await prisma.studentRiskMetric.findUnique({ where: { sectionId_studentId: { sectionId, studentId } } });
  if (!m) throw new HttpError(404, "Student not found");
  if (m.riskLevel !== "CRITICAL" && user.role === "INSTRUCTOR") throw new HttpError(403, "Identity is only unlocked for CRITICAL risk students");
  const e = await prisma.enrollment.findUnique({ where: { sectionId_studentId: { sectionId, studentId } }, include: { studentUser: true } });
  await prisma.studentRiskMetric.update({ where: { id: m.id }, data: { interventionSentAt: new Date() } });

  const name = e?.studentUser?.fullName ?? studentId;
  const to = e?.studentUser?.email ?? `${studentId}@${process.env.STUDENT_EMAIL_DOMAIN ?? "lamduan.mfu.ac.th"}`;
  const cc = [e?.advisorEmail, user.email].filter(Boolean) as string[];
  const subject = `[${section.course.courseCode}] Academic support check-in`;
  const body = [
    `Dear ${name},`,
    "",
    `I noticed you may be finding ${section.course.courseCode} ${section.course.courseNameEn} challenging recently`,
    `(attendance ${Number(m.attendanceRate).toFixed(0)}%, average understanding ${Number(m.avgComprehensionRating).toFixed(1)}/5).`,
    "I would like to help. Could you come to my office hours this week, or reply with a time that suits you?",
    "",
    "Your advisor is copied on this message so we can support you together.",
    "",
    "Best regards,",
    user.name,
  ].join("\n");
  return json({ ok: true, to, cc, subject, body, mailto: `mailto:${to}?cc=${encodeURIComponent(cc.join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` });
});
