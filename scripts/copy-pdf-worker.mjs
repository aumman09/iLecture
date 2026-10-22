// Copies the pdf.js worker into /public so the browser can load it (works on iPad Safari too).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
try {
  const pkgDir = dirname(require.resolve("pdfjs-dist/package.json"));
  const src = join(pkgDir, "legacy", "build", "pdf.worker.min.mjs");
  const outDir = join(process.cwd(), "public", "pdfjs");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  copyFileSync(src, join(outDir, "pdf.worker.min.mjs"));
  console.log("[ilecture] pdf.js worker copied to public/pdfjs");
} catch (e) {
  console.warn("[ilecture] could not copy pdf.js worker:", e.message);
}
