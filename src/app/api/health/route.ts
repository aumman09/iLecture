import { prisma } from "@/lib/db";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 503);
  }
}
