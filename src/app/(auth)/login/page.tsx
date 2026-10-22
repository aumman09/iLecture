import { redirect } from "next/navigation";
import { env, googleConfigured } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LoginPanel } from "./LoginPanel";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: { callbackUrl?: string; error?: string } }) {
  const user = await getCurrentUser();
  const cb = searchParams.callbackUrl && searchParams.callbackUrl.startsWith("/") ? searchParams.callbackUrl : undefined;
  if (user && !searchParams.error) redirect(cb ?? (user.role === "STUDENT" ? "/join" : "/dashboard"));
  const studentFlow = !!cb?.startsWith("/join");
  const demoStudents = env.demoMode
    ? await prisma.user.findMany({ where: { role: "STUDENT" }, orderBy: { studentId: "asc" }, take: 8, select: { email: true, fullName: true, studentId: true } })
    : [];
  return (
    <LoginPanel
      callbackUrl={cb}
      error={searchParams.error}
      googleEnabled={googleConfigured()}
      demoMode={env.demoMode}
      studentFlow={studentFlow}
      studentDomain={env.studentDomain}
      staffDomain={env.staffDomain}
      demoStudents={demoStudents.map((s) => ({ email: s.email, name: s.fullName, studentId: s.studentId ?? "" }))}
    />
  );
}
