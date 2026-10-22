"use client";
import { BellOff, BellRing, ChevronLeft, ChevronRight, MessagesSquare, PenLine, Presentation, Power } from "lucide-react";
import { cn } from "@/lib/cn";

/** Bottom Zero-Click control bar (dark pill). Everything the instructor needs during a lecture. */
export function FloatingDock({
  page, total, onPrev, onNext, boardActive, onToggleBoard, silent, onToggleSilent, qaCount, onOpenQA, onEnd, ending, disabled,
}: {
  page: number; total: number; onPrev: () => void; onNext: () => void;
  boardActive: boolean; onToggleBoard: () => void; silent: boolean; onToggleSilent: () => void;
  qaCount: number; onOpenQA: () => void; onEnd: () => void; ending?: boolean; disabled?: boolean;
}) {
  const btn = "flex h-12 items-center gap-2 rounded-xl px-3.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 active:bg-slate-700 disabled:opacity-40";
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-20 items-center justify-center pb-3">
      <nav className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-slate-700 bg-slate-900/95 px-2 py-1.5 shadow-2xl backdrop-blur" aria-label="Lecture controls">
        <button className={cn(btn, "px-2.5")} onClick={onPrev} disabled={disabled || page <= 1} title="Previous slide (←)"><ChevronLeft className="h-5 w-5" /></button>
        <span className="min-w-[88px] select-none text-center font-mono text-sm text-white">Slide {page} / {total}</span>
        <button className={cn(btn, "px-2.5")} onClick={onNext} disabled={disabled || page >= total} title="Next slide (→ / Space)"><ChevronRight className="h-5 w-5" /></button>
        <span className="mx-1 h-8 w-px bg-slate-700" />
        <button className={cn(btn, boardActive && "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30")} onClick={onToggleBoard} disabled={disabled} title="Toggle class board (B)">
          {boardActive ? <Presentation className="h-5 w-5" /> : <PenLine className="h-5 w-5" />}
          <span className="hidden lg:inline">{boardActive ? "Back to Slides" : "Open Class Board"}</span>
        </button>
        <button className={cn(btn, !silent && "text-emerald-300")} onClick={onToggleSilent} title="Silent focus mode (S)">
          {silent ? <BellOff className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
          <span className="hidden lg:inline">Silent {silent ? "ON" : "OFF"}</span>
        </button>
        <button className={cn(btn, "relative")} onClick={onOpenQA} title="View Q&A (Q)">
          <MessagesSquare className="h-5 w-5" />
          <span className="hidden lg:inline">View Q&amp;A</span>
          {qaCount > 0 && (
            <span id="qa-badge" className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white ring-2 ring-slate-900">{qaCount > 99 ? "99+" : qaCount}</span>
          )}
        </button>
        <span className="mx-1 h-8 w-px bg-slate-700" />
        <button className={cn(btn, "bg-mfu text-white hover:bg-mfu-hover")} onClick={onEnd} disabled={ending || disabled} title="End class & send exit ticket">
          <Power className="h-5 w-5" />
          <span className="hidden md:inline">End Class</span>
        </button>
      </nav>
    </div>
  );
}
