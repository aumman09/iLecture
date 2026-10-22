import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { canControl } from "@/lib/session-service";
import { LiveConsole } from "@/components/instructor/LiveConsole";

export const dynamic = "force-dynamic";

export default async function LivePage({ params }: { params: { sessionId: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=/live/${params.sessionId}`);
  if (!/^[0-9a-f-]{36}$/i.test(params.sessionId)) notFound();
  const s = await prisma.classSession.findUnique({ where: { id: params.sessionId }, include: { section: { include: { course: true } } } });
  if (!s) notFound();
  if (!canControl(s, user)) redirect("/dashboard");
  return <LiveConsole sessionCode={s.sessionCode} sessionId={s.id} joinUrl={`${publicBaseUrl()}/join/${s.sessionCode}`} />;
}

/** Prefer NEXTAUTH_URL; if it is localhost, use the host the instructor opened (e.g. LAN IP) so phones can scan the QR. */
function publicBaseUrl() {
  if (!/localhost|127\.0\.0\.1/.test(env.appUrl)) return env.appUrl;
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : env.appUrl;
}
