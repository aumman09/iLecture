import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sectionsForUser } from "@/lib/access";
import { isMockMode } from "@/lib/google-classroom";
import { Dashboard } from "@/components/instructor/Dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: { tab?: string; session?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/dashboard");
  if (user.role === "STUDENT") redirect("/join");
  const sections = await sectionsForUser(user);
  const courseIds = [...new Set(sections.map((s) => s.courseId))];
  const [decks, sessions, riskCounts, mock] = await Promise.all([
    prisma.slideDeck.findMany({ where: { courseId: { in: courseIds } }, orderBy: { syncedAt: "desc" } }),
    prisma.classSession.findMany({
      where: { sectionId: { in: sections.map((s) => s.id) } },
      orderBy: { startedAt: "desc" },
      take: 40,
      include: { aiSummary: true, _count: { select: { attendances: true, feedbacks: true, questions: true } } },
    }),
    prisma.studentRiskMetric.groupBy({ by: ["sectionId", "riskLevel"], where: { sectionId: { in: sections.map((s) => s.id) } }, _count: true }),
    user.role === "INSTRUCTOR" ? isMockMode(user.id) : Promise.resolve(false),
  ]);

  return (
    <Dashboard
      user={{ name: user.name, email: user.email, role: user.role }}
      mockClassroom={mock}
      initialTab={searchParams.tab}
      initialSession={searchParams.session}
      sections={sections.map((s) => ({
        id: s.id,
        courseId: s.courseId,
        courseCode: s.course.courseCode,
        courseName: s.course.courseNameEn,
        semester: s.course.semester,
        sectionNumber: s.sectionNumber,
        googleClassroomId: s.course.googleClassroomId,
        students: s._count.enrollments,
        sessionsHeld: s._count.sessions,
        critical: riskCounts.find((r) => r.sectionId === s.id && r.riskLevel === "CRITICAL")?._count ?? 0,
        moderate: riskCounts.find((r) => r.sectionId === s.id && r.riskLevel === "MODERATE")?._count ?? 0,
      }))}
      decks={decks.map((d) => ({ id: d.id, courseId: d.courseId, title: d.title, totalPages: d.totalPages, isProcessed: d.isProcessed, syncedAt: d.syncedAt.toISOString() }))}
      sessions={sessions.map((s) => ({
        id: s.id,
        sectionId: s.sectionId,
        code: s.sessionCode,
        title: s.sessionTitle,
        status: s.status,
        startedAt: s.startedAt.toISOString(),
        attended: s._count.attendances,
        feedbacks: s._count.feedbacks,
        questions: s._count.questions,
        avgComprehension: s.aiSummary?.avgComprehension ? Number(s.aiSummary.avgComprehension) : null,
        topTopic: (s.aiSummary?.topMuddiestTopics as { topic: string }[] | undefined)?.[0]?.topic ?? null,
      }))}
    />
  );
}
