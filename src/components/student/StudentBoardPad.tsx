"use client";
import { useState } from "react";
import { Lock, StickyNote as StickyIcon, Undo2 } from "lucide-react";
import { BoardSurface, STICKY_STYLES, type BoardStroke } from "@/components/shared/BoardSurface";
import { PdfSlide } from "@/components/shared/PdfSlide";
import { Sheet } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { StickyColor, StickyNote, Stroke } from "@/types";
import { HideNameToggle } from "./Identity";

const PENS = ["#0F172A", "#990000", "#2563EB", "#16A34A"];
const COLORS: StickyColor[] = ["amber", "blue", "emerald", "rose"];

/** Opens automatically when the instructor taps "Class Board". Draw with a finger / Pencil or post a sticky note. */
export function StudentBoardPad({ slideUrl, page, strokes, stickies, frozen, onStroke, onUndo, onSticky, anonymous, onAnonymous }: {
  anonymous: boolean; onAnonymous: (v: boolean) => void;
  slideUrl: string | null; page: number; strokes: BoardStroke[]; stickies: StickyNote[]; frozen: boolean;
  onStroke: (s: Stroke) => void; onUndo: () => void; onSticky: (text: string, color: StickyColor) => Promise<boolean>;
}) {
  const [pen, setPen] = useState(PENS[1]);
  const [noteOpen, setNoteOpen] = useState(false);
  const [text, setText] = useState("");
  const [color, setColor] = useState<StickyColor>("amber");
  const [sending, setSending] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-sm font-semibold text-slate-800">Class Board <span className="font-normal text-slate-400">· slide {page}</span></div>
        {frozen && <span className="flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white"><Lock className="h-3 w-3" /> Frozen by instructor</span>}
      </div>
      <div className="min-h-0 flex-1 px-2">
        <BoardSurface
          strokes={strokes}
          stickies={stickies}
          enabled={!frozen}
          color={pen}
          width={0.006}
          onStroke={onStroke}
          background={slideUrl ? <div className="h-full w-full opacity-60"><PdfSlide url={slideUrl} page={page} /></div> : undefined}
        />
      </div>
      <div className="flex items-center gap-2 px-3 pb-safe-2 pt-3">
        <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5">
          {PENS.map((c) => (
            <button key={c} onClick={() => setPen(c)} aria-label={`Pen ${c}`} className={cn("h-9 w-9 rounded-xl border-2 transition-transform", pen === c ? "scale-110 border-slate-900" : "border-transparent")} style={{ background: c }} />
          ))}
        </div>
        <button onClick={onUndo} disabled={frozen} aria-label="Undo" className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 active:scale-95 disabled:opacity-40"><Undo2 className="h-5 w-5" /></button>
        <Button size="lg" className="h-12 flex-1" disabled={frozen} onClick={() => setNoteOpen(true)}><StickyIcon className="h-5 w-5" /> Sticky note</Button>
      </div>

      <Sheet open={noteOpen} onClose={() => setNoteOpen(false)}>
        <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">Post a sticky note</h2><HideNameToggle value={anonymous} onChange={onAnonymous} compact /></div>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value.slice(0, 140))} rows={3} placeholder="Your idea or answer…" className={cn("w-full resize-none rounded-2xl border-2 px-4 py-3 text-base outline-none", STICKY_STYLES[color])} />
        <div className="mt-1 text-right text-xs text-slate-400">{text.length}/140</div>
        <div className="mt-2 flex items-center gap-2">
          {COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={c} className={cn("h-11 w-11 rounded-xl border-2", STICKY_STYLES[c], color === c && "ring-2 ring-slate-900 ring-offset-2")} />
          ))}
          <Button size="lg" className="ml-auto" disabled={!text.trim()} loading={sending} onClick={async () => {
            setSending(true);
            const ok = await onSticky(text.trim(), color);
            setSending(false);
            if (ok) { setText(""); setNoteOpen(false); }
          }}>Post</Button>
        </div>
      </Sheet>
    </div>
  );
}
