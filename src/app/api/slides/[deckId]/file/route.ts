import { handle } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readStoredFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Streams a synced slide PDF to signed-in users (instructor console + student devices). */
export const GET = handle(async (_req: Request, { params }: { params: { deckId: string } }) => {
  const user = await requireUser();
  const deck = await prisma.slideDeck.findUnique({ where: { id: params.deckId } });
  if (!deck || !deck.fileUrl.startsWith("storage:")) throw new HttpError(404, "Slides not found");
  if (user.role === "STUDENT") {
    // students may only fetch decks that are in a live / recent session they attend
    const ok = await prisma.classSession.findFirst({ where: { slideDeckId: deck.id, attendances: { some: { studentId: user.studentId ?? "" } } }, select: { id: true } });
    if (!ok) throw new HttpError(403, "Join the class first");
  }
  const buf = await readStoredFile(deck.fileUrl.slice("storage:".length));
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Cache-Control": "private, max-age=3600", "Content-Length": String(buf.length) },
  });
});
