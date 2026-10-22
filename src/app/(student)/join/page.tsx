import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { JoinByPin } from "./JoinByPin";

export const dynamic = "force-dynamic";

/** Student home: shows the live class of your enrolled sections as one big button — no typing. */
export default async function JoinHome() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/join");
  if (user.role !== "STUDENT") redirect("/dashboard");
  const live = await prisma.classSession.findMany({
    where: { status: { in: ["LIVE", "EXIT_TICKET"] }, section: { enrollments: { some: { studentId: user.studentId ?? "" } } } },
    include: { section: { include: { course: true } } },
    orderBy: { startedAt: "desc" },
    take: 3,
  });
  return (
    <JoinByPin
      name={user.name}
      liveClasses={live.map((s) => ({ code: s.sessionCode, title: s.sessionTitle, course: `${s.section.course.courseCode} ${s.section.course.courseNameEn}`, status: s.status }))}
    />
  );
}
