import { prisma } from "@/lib/db";

/**
 * Startup check: is PostgreSQL reachable, and are all migrations applied?
 * Prints a plain-language fix instead of the empty "Invalid prisma.xxx() invocation" error.
 */
export async function checkDatabase(): Promise<boolean> {
  const url = process.env.DATABASE_URL ?? "";
  const where = url.replace(/\/\/[^@]*@/, "//***@").replace(/\?.*$/, "");
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
  } catch (e) {
    const msg = String((e as Error)?.message || (e as { cause?: unknown })?.cause || e);
    console.error(`\n  ✖ Cannot connect to PostgreSQL at ${where}`);
    if (/denied|password|role|authentication/i.test(msg)) {
      console.error("    The user/password was rejected — another PostgreSQL may be answering on that port.");
      console.error("    Docker's database listens on port 5433: check DATABASE_URL in .env uses localhost:5433.");
    } else {
      console.error("    PostgreSQL is not running. Open Docker Desktop, then run:  docker compose up -d");
    }
    console.error(`    (${msg.split("\n").filter(Boolean).pop() ?? "no details"})\n`);
    return false;
  }
  try {
    const rows = await prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'session_attendances' AND column_name = 'is_anonymous') AS ok`
    );
    if (!rows[0]?.ok) {
      console.error("\n  ✖ The database schema is out of date (new migrations not applied).");
      console.error("    Stop the server and run:  npx prisma migrate deploy && npx prisma generate\n");
      return false;
    }
  } catch {
    console.error("\n  ✖ Database has no iLecture tables yet. Run:  npx prisma migrate deploy && npm run db:seed\n");
    return false;
  }
  return true;
}
