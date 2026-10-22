import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma client singleton. Shared via globalThis so the custom Socket.io server
// and Next.js route handlers (bundled separately) reuse one connection pool.
const g = globalThis as unknown as { __ilecturePrisma?: PrismaClient };

function create() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter, log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
}

export const prisma: PrismaClient = g.__ilecturePrisma ?? (g.__ilecturePrisma = create());
export default prisma;
