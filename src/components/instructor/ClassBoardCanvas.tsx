"use client";
import { useState } from "react";
import { Eraser, Eye, EyeOff, ImageOff, Image as ImageIcon, Lock, LockOpen, Undo2 } from "lucide-react";
import { BoardSurface, type BoardStroke } from "@/components/shared/BoardSurface";
import { PdfSlide } from "@/components/shared/PdfSlide";
import { cn } from "@/lib/cn";
import type { StickyNote, Stroke } from "@/types";

const PENS = ["#0F172A", "#990000", "#2563EB", "#16A34A", "#D97706"];

/** Collaborative board on the projector: instructor + students draw; student sticky notes pop in live. */
export function ClassBoardCanvas({ slideUrl, page, strokes, stickies, frozen, onStroke, onFreeze, onClear, onUndo }: {
  slideUrl: string | null; page: number; strokes: BoardStroke[]; stickies: StickyNote[]; frozen: boolean;
  onStroke: (s: Stroke) => void; onFreeze: (f: boolean) => void; onClear: () => void; onUndo: () => void;
}) {
  const [pen, setPen] = useState(PENS[1]);
  const [showSlide, setShowSlide] = useState(true);
  const [showNames, setShowNames] = useState(true);
  const tool = "flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100";
  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto mb-2 flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-sm">
        {PENS.map((c) => (
          <button key={c} onClick={() => setPen(c)} className={cn("h-6 w-6 rounded-full border-2", pen === c ? "border-slate-900 scale-110" : "border-white")} style={{ background: c }} aria-label={`Pen ${c}`} />
        ))}
        <span className="mx-1 h-6 w-px bg-slate-200" />
        <button className={tool} onClick={onUndo}><Undo2 className="h-4 w-4" />Undo</button>
        <button className={tool} onClick={() => setShowSlide((v) => !v)}>{showSlide ? <ImageOff className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}{showSlide ? "Blank" : "Slide"}</button>
        <button className={tool} onClick={() => setShowNames((v) => !v)}>{showNames ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}Names</button>
        <button className={cn(tool, frozen && "bg-slate-900 text-white hover:bg-slate-800")} onClick={() => onFreeze(!frozen)}>{frozen ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}{frozen ? "Frozen" : "Freeze Board"}</button>
        <button className={cn(tool, "text-rose-600 hover:bg-rose-50")} onClick={() => { if (confirm("Clear all drawings and notes on this slide?")) onClear(); }}><Eraser className="h-4 w-4" />Clear Board</button>
        <span className="ml-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-500">{stickies.length} notes · {strokes.length} strokes</span>
      </div>
      <div className="min-h-0 flex-1">
        <BoardSurface
          strokes={strokes}
          stickies={stickies}
          enabled
          color={pen}
          width={0.004}
          onStroke={onStroke}
          showNames={showNames}
          background={showSlide && slideUrl ? <div className="h-full w-full opacity-70"><PdfSlide url={slideUrl} page={page} /></div> : undefined}
        />
      </div>
    </div>
  );
}
