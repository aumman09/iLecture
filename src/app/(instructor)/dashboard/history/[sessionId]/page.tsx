import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SessionArchive } from "@/components/instructor/SessionArchive";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ params }: { params: { sessionId: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=/dashboard/history/${params.sessionId}`);
  if (user.role === "STUDENT") redirect("/join");
  if (!/^[0-9a-f-]{36}$/i.test(params.sessionId)) notFound();
  return <SessionArchive sessionId={params.sessionId} canExport={user.role !== "ADVISOR"} />;
}
