import { copyFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

/**
 * Make sure /public/pdfjs/pdf.worker.min.mjs exists (normally copied by `npm install`'s postinstall).
 * Without it, slides cannot render in the browser — so we self-heal at server start.
 */
export function ensurePdfWorker() {
  const out = join(process.cwd(), "public", "pdfjs", "pdf.worker.min.mjs");
  if (existsSync(out)) return;
  try {
    const pkg = require.resolve("pdfjs-dist/package.json");
    mkdirSync(dirname(out), { recursive: true });
    copyFileSync(join(dirname(pkg), "legacy", "build", "pdf.worker.min.mjs"), out);
    console.log("[assets] pdf.js worker copied to public/pdfjs");
  } catch (e) {
    console.warn("[assets] could not copy pdf.js worker — slides may not render:", (e as Error).message);
  }
}
