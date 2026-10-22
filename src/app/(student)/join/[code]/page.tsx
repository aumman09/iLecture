import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeCode } from "@/lib/session-code";
import { StudentApp } from "@/components/student/StudentApp";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: { code: string } }) {
  const code = normalizeCode(params.code);
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=/join/${code}`);
  if (user.role !== "STUDENT") {
    const s = await prisma.classSession.findUnique({ where: { sessionCode: code }, select: { id: true } });
    redirect(s ? `/live/${s.id}` : "/dashboard");
  }
  const session = await prisma.classSession.findUnique({
    where: { sessionCode: code },
    select: { id: true, slideDeck: { select: { metadata: { orderBy: { pageNumber: "asc" } } } } },
  });
  if (!session) redirect("/join?notfound=1");
  const slides = (session.slideDeck?.metadata ?? []).map((m) => ({ pageNumber: m.pageNumber, category: m.category, summary: m.summary, difficultyLevel: m.difficultyLevel, keyTerms: m.keyTerms }));
  return <StudentApp sessionCode={code} studentName={user.name} slides={slides} />;
}
