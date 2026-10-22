import { prisma } from "@/lib/db";
import { analyzeSlidePage } from "@/lib/ai-service";
import { readStoredFile } from "@/lib/storage";

/** Extract text page-by-page from a PDF buffer (pdf-parse with a per-page render hook). */
export async function extractPdfPages(buf: Buffer): Promise<string[]> {
  // Import the library entry directly — the package index runs a debug self-test.
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (b: Buffer, o: unknown) => Promise<{ numpages: number }>;
  const pages: string[] = [];
  await pdfParse(buf, {
    pagerender: async (pageData: { pageIndex: number; getTextContent: () => Promise<{ items: { str: string; hasEOL?: boolean }[] }> }) => {
      const tc = await pageData.getTextContent();
      const text = tc.items.map((i) => i.str + (i.hasEOL ? "\n" : " ")).join("").replace(/[ \t]+/g, " ").trim();
      pages[pageData.pageIndex] = text;
      return text;
    },
  });
  return pages.map((p) => p ?? "");
}

/** BullMQ job "scan-slide-deck": AI-tag every page and upsert slide_metadata. */
export async function processSlideScan({ slideDeckId }: { slideDeckId: string }) {
  const deck = await prisma.slideDeck.findUnique({ where: { id: slideDeckId } });
  if (!deck || !deck.fileUrl.startsWith("storage:")) return { skipped: true };
  const buf = await readStoredFile(deck.fileUrl.slice("storage:".length));
  const pages = await extractPdfPages(buf);
  for (let i = 0; i < pages.length; i++) {
    const meta = await analyzeSlidePage(pages[i], i + 1);
    await prisma.slideMetadata.upsert({
      where: { slideDeckId_pageNumber: { slideDeckId, pageNumber: i + 1 } },
      create: { slideDeckId, pageNumber: i + 1, category: meta.category, summary: meta.summary, difficultyLevel: meta.difficultyLevel, keyTerms: meta.keyTerms },
      update: { category: meta.category, summary: meta.summary, difficultyLevel: meta.difficultyLevel, keyTerms: meta.keyTerms },
    });
  }
  await prisma.slideDeck.update({ where: { id: slideDeckId }, data: { isProcessed: true, totalPages: Math.max(pages.length, 1) } });
  console.log(`[slide-scanner] ${deck.title}: ${pages.length} pages analysed`);
  return { pages: pages.length };
}
