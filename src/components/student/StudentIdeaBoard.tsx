"use client";
import { useEffect, useState } from "react";
import { Hand, Lightbulb, Lock, Minus, PenLine, Plus, Send, Type, Undo2 } from "lucide-react";
import { FreeBoard, type FreeTool } from "@/components/shared/FreeBoard";
import { STICKY_STYLES, type BoardStroke } from "@/components/shared/BoardSurface";
import { Sheet } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { StickyColor, StickyNote, Stroke } from "@/types";
import { HideNameToggle } from "./Identity";

const COLORS: StickyColor[] = ["amber", "blue", "emerald", "rose"];
const PENS = ["#0F172A", "#990000", "#2563EB", "#16A34A"];

/**
 * Student Idea Board — a blank whiteboard shared with the whole class.
 *  ✍️ Write (default): tap anywhere → type → Post. The note appears at that spot on every screen.
 *  ✏️ Draw: draw lines / arrows to connect ideas.   ✋ Move: drag your own notes, scroll the board.
 */
export function StudentIdeaBoard({ prompt, notes, strokes, frozen, onPost, onLike, onDelete, onStroke, onUndo, onMove, anonymous, onAnonymous }: {
  prompt: string | null; notes: StickyNote[]; strokes: BoardStroke[]; frozen: boolean; anonymous: boolean;
  onPost: (text: string, color: StickyColor, at: { x: number; y: number }) => Promise<boolean>;
  onLike: (id: string, remove: boolean) => void; onDelete: (id: string) => void;
  onStroke: (s: Stroke) => void; onUndo: () => void; onMove: (id: string, x: number, y: number) => void;
  onAnonymous: (v: boolean) => void;
}) {
  const [tool, setTool] = useState<FreeTool>("text");
  const [pen, setPen] = useState(PENS[1]);
  const [zoom, setZoom] = useState(1);
  const [placing, setPlacing] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState("");
  const [color, setColor] = useState<StickyColor>(() => COLORS[Math.floor(Math.random() * COLORS.length)]);
  const [sending, setSending] = useState(false);

  // phones start zoomed in so notes are readable; scroll to see the rest of the board
  useEffect(() => { if (window.innerWidth < 640) setZoom(2); }, []);

  const post = async () => {
    if (!text.trim() || !placing) return;
    setSending(true);
    const ok = await onPost(text.trim(), color, placing);
    setSending(false);
    if (ok) { setText(""); setPlacing(null); navigator.vibrate?.(20); }
  };

  const mine = notes.filter((n) => n.mine).length;
  const toolBtn = (k: FreeTool, Icon: React.ElementType, label: string) => (
    <button
      key={k}
      onClick={() => setTool(k)}
      aria-pressed={tool === k}
      className={cn("flex h-12 flex-1 flex-col items-center justify-center rounded-xl text-[11px] font-semibold", tool === k ? "bg-slate-900 text-white" : "text-slate-600")}
    >
      <Icon className="h-5 w-5" />{label}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pt-2">
        <div className="rounded-2xl bg-mfu px-4 py-2.5 text-white shadow-sm">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/70"><Lightbulb className="h-3.5 w-3.5" />Idea Board · บอร์ดความคิดเห็น</div>
          <div className="mt-0.5 text-base font-semibold leading-snug">{prompt || "Share your ideas with the class"}</div>
        </div>
        <div className="flex items-center justify-between gap-2 px-1 py-1.5 text-xs text-slate-500">
          {frozen ? (
            <span className="flex items-center gap-1 font-medium text-slate-800"><Lock className="h-3.5 w-3.5" />Posting is closed</span>
          ) : (
            <span>{tool === "text" ? "👆 Tap anywhere on the board to write" : tool === "pen" ? "✏️ Draw lines to connect ideas" : "✋ Drag your notes · scroll the board"}</span>
          )}
          <span className="shrink-0">{notes.length} ideas{mine ? ` · ${mine} yours` : ""}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-2">
        <FreeBoard
          strokes={strokes}
          notes={notes}
          tool={tool}
          color={pen}
          penWidth={0.005}
          canEdit={!frozen}
          fit="width"
          zoom={zoom}
          onStroke={onStroke}
          onPlace={(x, y) => setPlacing({ x, y })}
          onMove={onMove}
          onLike={(n) => { navigator.vibrate?.(8); onLike(n.id, !!n.likedByMe); }}
          onDelete={(n) => onDelete(n.id)}
          canMove={(n) => !!n.mine}
          canDelete={(n) => !!n.mine}
          className="rounded-xl bg-slate-200/50 p-1"
          emptyHint={<p className="text-sm text-slate-400">Blank board ✨<br />Tap anywhere to add the first idea</p>}
        />
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-2 pb-safe-2 pt-2">
        <div className="flex items-center gap-1">
          <div className="flex flex-1 gap-1 rounded-2xl bg-slate-100 p-1">
            {toolBtn("text", Type, "Write")}
            {toolBtn("pen", PenLine, "Draw")}
            {toolBtn("move", Hand, "Move")}
          </div>
          <button onClick={onUndo} disabled={frozen} aria-label="Undo" className="flex h-12 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 disabled:opacity-40"><Undo2 className="h-5 w-5" /></button>
          <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200">
            <button onClick={() => setZoom((z) => Math.min(3, z + 0.5))} aria-label="Zoom in" className="flex h-6 w-10 items-center justify-center text-slate-600 active:bg-slate-100"><Plus className="h-4 w-4" /></button>
            <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Zoom out" className="flex h-6 w-10 items-center justify-center border-t border-slate-200 text-slate-600 active:bg-slate-100"><Minus className="h-4 w-4" /></button>
          </div>
        </div>
        {tool === "pen" && (
          <div className="mt-2 flex items-center justify-center gap-2">
            {PENS.map((c) => (
              <button key={c} onClick={() => setPen(c)} aria-label={`Pen ${c}`} className={cn("h-8 w-8 rounded-full border-2", pen === c ? "scale-110 border-slate-900" : "border-white shadow")} style={{ background: c }} />
            ))}
          </div>
        )}
      </div>

      <Sheet open={!!placing} onClose={() => setPlacing(null)}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Your idea</h2>
          <HideNameToggle value={anonymous} onChange={onAnonymous} compact />
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 280))}
          rows={3}
          placeholder="Type your idea… (Thai or English)"
          className={cn("w-full resize-none rounded-2xl border-2 px-4 py-3 text-base outline-none placeholder:text-current placeholder:opacity-50", STICKY_STYLES[color])}
        />
        <div className="mt-2 flex items-center gap-2">
          {COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={c} className={cn("h-9 w-9 rounded-lg border-2", STICKY_STYLES[c], color === c && "ring-2 ring-slate-900 ring-offset-1")} />
          ))}
          <span className="ml-auto text-xs text-slate-400">{text.length}/280</span>
          <Button size="lg" disabled={!text.trim()} loading={sending} onClick={post}><Send className="h-4 w-4" />Post</Button>
        </div>
      </Sheet>
    </div>
  );
}
