import { handle, json } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, { params }: { params: { sessionId: string } }) => {
  const user = await requireUser();
  const s = await prisma.classSession.findUnique({
    where: { id: params.sessionId },
    include: { section: { include: { course: true } }, slideDeck: { include: { metadata: { orderBy: { pageNumber: "asc" } } } } },
  });
  if (!s) throw new HttpError(404, "Session not found");
  if (user.role === "STUDENT") return json({ sessionCode: s.sessionCode, status: s.status });
  return json({ session: s });
});
