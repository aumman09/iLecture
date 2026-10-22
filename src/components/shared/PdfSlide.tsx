"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";


type PdfDoc = { numPages: number; getPage: (n: number) => Promise<any> };
const docs = new Map<string, Promise<PdfDoc>>();

async function loadPdfjs() {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  return pdfjs;
}

export function loadPdf(url: string): Promise<PdfDoc> {
  if (!docs.has(url)) {
    docs.set(
      url,
      loadPdfjs().then((pdfjs) => pdfjs.getDocument({ url, withCredentials: true, isEvalSupported: false }).promise).catch((e: unknown) => {
        docs.delete(url);
        throw e;
      })
    );
  }
  return docs.get(url)!;
}

/**
 * Renders one PDF page, fitted inside its parent (letter-boxed), crisp on Retina / iPad.
 * `onAspect` reports the page aspect ratio so overlays (board) can match it exactly.
 */
export function PdfSlide({
  url, page, className, onAspect, fit = "contain", priority = false,
}: { url: string | null; page: number; className?: string; onAspect?: (ratio: number) => void; fit?: "contain" | "width"; priority?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!url || size.w === 0) return;
    let cancelled = false;
    let task: any = null;
    setError(null);
    (async () => {
      try {
        const doc = await loadPdf(url);
        const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
        if (cancelled) return;
        const base = p.getViewport({ scale: 1 });
        onAspect?.(base.width / base.height);
        const scale = fit === "width" || size.h === 0 ? size.w / base.width : Math.min(size.w / base.width, size.h / base.height);
        const dpr = Math.min(window.devicePixelRatio || 1, priority ? 3 : 2);
        const vp = p.getViewport({ scale: scale * dpr });
        const c = canvas.current!;
        // render to an offscreen canvas first to avoid flashing a blank slide
        const off = document.createElement("canvas");
        off.width = Math.floor(vp.width);
        off.height = Math.floor(vp.height);
        task = p.render({ canvasContext: off.getContext("2d")!, viewport: vp });
        await task.promise;
        if (cancelled) return;
        c.width = off.width;
        c.height = off.height;
        c.style.width = `${Math.floor(vp.width / dpr)}px`;
        c.style.height = `${Math.floor(vp.height / dpr)}px`;
        c.getContext("2d")!.drawImage(off, 0, 0);
        setLoading(false);
      } catch (e: any) {
        if (!cancelled && e?.name !== "RenderingCancelledException") setError("Could not load slides");
      }
    })();
    return () => {
      cancelled = true;
      try { task?.cancel(); } catch { /* noop */ }
    };
  }, [url, page, size.w, size.h, fit, priority, onAspect]);

  return (
    <div ref={wrap} className={cn("relative flex h-full w-full items-center justify-center overflow-hidden", className)}>
      {!url ? (
        <div className="text-sm text-slate-400">No slides for this session</div>
      ) : (
        <>
          <canvas ref={canvas} className="rounded-md bg-white shadow-sm" />
          {loading && !error && <div className="absolute inset-0 m-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-mfu" />}
          {error && <div className="absolute text-sm text-rose-600">{error}</div>}
        </>
      )}
    </div>
  );
}

/** Small thumbnail (used in exit ticket "which slide was confusing?" picker). */
export function PdfThumb({ url, page, className }: { url: string; page: number; className?: string }) {
  return (
    <div className={cn("aspect-video w-full overflow-hidden rounded-lg bg-slate-100", className)}>
      <PdfSlide url={url} page={page} />
    </div>
  );
}
