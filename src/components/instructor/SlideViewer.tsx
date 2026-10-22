"use client";
import { PdfSlide } from "@/components/shared/PdfSlide";
import type { SlideMetadataDTO } from "@/types";

/** Full-stage Google Classroom slide presenter (PDF rendered client-side). */
export function SlideViewer({ url, page, metadata, showMeta }: { url: string | null; page: number; metadata: SlideMetadataDTO | null; showMeta?: boolean }) {
  return (
    <div className="relative h-full w-full">
      <PdfSlide url={url} page={page} priority className="h-full" />
      {showMeta && metadata && (
        <div className="absolute bottom-2 left-2 max-w-sm rounded-lg bg-white/90 px-3 py-2 text-xs text-slate-600 shadow-sm ring-1 ring-slate-200 backdrop-blur">
          <span className="font-semibold text-slate-800">{metadata.category}</span> · difficulty {metadata.difficultyLevel ?? "–"}/5
          <div className="line-clamp-2">{metadata.summary}</div>
        </div>
      )}
    </div>
  );
}
