import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Generates clean 16:9 lecture-slide PDFs. Used by the seed script and by mock
 * Google Classroom sync so the app is fully demo-able without Google credentials.
 */
export interface DemoSlide {
  title: string;
  bullets?: string[];
  code?: string[];
  footer?: string;
}

const W = 960, H = 540;
const CRIMSON = rgb(0.6, 0, 0);
const SLATE900 = rgb(0.06, 0.09, 0.16);
const SLATE600 = rgb(0.28, 0.33, 0.41);
const SLATE200 = rgb(0.89, 0.91, 0.94);

function wrap(text: string, font: PDFFont, size: number, max: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(t, size) > max && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function buildDemoDeck(courseLabel: string, slides: DemoSlide[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  slides.forEach((s, i) => {
    const page: PDFPage = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: CRIMSON });
    page.drawText(courseLabel, { x: 48, y: H - 44, size: 12, font: bold, color: CRIMSON });
    page.drawText(`${i + 1} / ${slides.length}`, { x: W - 90, y: H - 44, size: 12, font: sans, color: SLATE600 });
    let y = H - 100;
    for (const line of wrap(s.title, bold, 34, W - 96)) {
      page.drawText(line, { x: 48, y, size: 34, font: bold, color: SLATE900 });
      y -= 42;
    }
    y -= 10;
    const hasCode = !!s.code?.length;
    const bulletW = hasCode ? W / 2 - 60 : W - 120;
    let by = y;
    for (const b of s.bullets ?? []) {
      page.drawCircle({ x: 58, y: by + 6, size: 3.5, color: CRIMSON });
      for (const [li, line] of wrap(b, sans, 19, bulletW).entries()) {
        page.drawText(line, { x: 72, y: by - li * 25, size: 19, font: sans, color: SLATE900 });
      }
      by -= wrap(b, sans, 19, bulletW).length * 25 + 14;
    }
    if (hasCode) {
      const cx = W / 2 + 10, cw = W / 2 - 58, lh = 20;
      const ch = s.code!.length * lh + 30;
      page.drawRectangle({ x: cx, y: y - ch + 20, width: cw, height: ch, color: SLATE900 });
      s.code!.forEach((ln, k) => page.drawText(ln, { x: cx + 18, y: y - 6 - k * lh, size: 14, font: mono, color: rgb(0.88, 0.93, 1) }));
    }
    page.drawLine({ start: { x: 48, y: 44 }, end: { x: W - 48, y: 44 }, thickness: 1, color: SLATE200 });
    page.drawText(s.footer ?? "Mae Fah Luang University  ·  iLecture MFU", { x: 48, y: 24, size: 10, font: sans, color: SLATE600 });
  });
  return pdf.save();
}

export const C_POINTERS_DECK: DemoSlide[] = [
  {
    title: "What is a Pointer?",
    bullets: [
      "A pointer is a variable that stores the memory address of another variable.",
      "The & (address-of) operator gives the address of a variable.",
      "The * (dereference) operator accesses the value stored at that address.",
      "Pointer size depends on the architecture (8 bytes on 64-bit systems).",
    ],
    code: ["int x = 42;", "int *p = &x;", "", "printf(\"%p\\n\", (void*)p);", "printf(\"%d\\n\", *p); // 42", "*p = 7;  // x is now 7"],
  },
  {
    title: "Dynamic Memory: malloc() and free()",
    bullets: [
      "malloc(n) allocates n bytes on the heap and returns a void pointer.",
      "Always check for NULL — allocation can fail.",
      "Every malloc() must be paired with exactly one free().",
      "Heap memory lives until you free it; stack memory dies with the function.",
    ],
    code: ["int *arr = malloc(5 * sizeof(int));", "if (arr == NULL) {", "    return 1;", "}", "for (int i = 0; i < 5; i++)", "    arr[i] = i * i;", "free(arr);", "arr = NULL;"],
  },
  {
    title: "Common Pitfalls: Dangling Pointers & Memory Leaks",
    bullets: [
      "Dangling pointer: using a pointer after the memory it points to was freed.",
      "Memory leak: losing the last pointer to heap memory without calling free().",
      "Double free: calling free() twice on the same address — undefined behaviour.",
      "Fix: set pointers to NULL after free and use tools like Valgrind.",
    ],
    code: ["int *p = malloc(sizeof(int));", "*p = 10;", "free(p);", "*p = 20;   // dangling! UB", "", "p = malloc(100);", "p = malloc(200); // leak!"],
  },
];

export const MOCK_DECKS: { fileId: string; title: string; slides: DemoSlide[] }[] = [
  { fileId: "mock-drive-c-pointers", title: "Week 7 - C Pointers & Memory.pdf", slides: C_POINTERS_DECK },
  {
    fileId: "mock-drive-recursion",
    title: "Week 8 - Recursion.pdf",
    slides: [
      { title: "Recursion: A Function That Calls Itself", bullets: ["Every recursive function needs a base case.", "Each call works on a smaller sub-problem.", "The call stack stores each pending call."], code: ["int fact(int n) {", "  if (n <= 1) return 1;", "  return n * fact(n - 1);", "}"] },
      { title: "Tracing the Call Stack", bullets: ["fact(4) → 4 × fact(3) → 4 × 3 × fact(2) …", "Calls return in reverse order (LIFO).", "Too deep recursion causes a stack overflow."] },
      { title: "Recursion vs Iteration — Summary", bullets: ["Recursion is elegant for trees and divide-and-conquer.", "Iteration usually uses less memory.", "Key takeaways and Q&A."] },
    ],
  },
];
