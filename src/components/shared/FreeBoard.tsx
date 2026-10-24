"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { AuthorTag } from "@/components/student/Identity";
import { STICKY_STYLES, drawStroke, type BoardStroke } from "./BoardSurface";
import type { StickyNote, Stroke } from "@/types";

export type FreeTool = "text" | "pen" | "move";
export const BOARD_ASPECT = 16 / 10;
const NOTE_W = 0.15; // note width as a share of the board width

/**
 * Blank collaborative whiteboard (Idea Board): tap anywhere to write a note, draw lines/arrows to
 * connect ideas, drag notes to arrange them. Coordinates are normalised (0–1) so a note placed on a
 * phone lands in the same spot on the projector.
 */
export function FreeBoard({
  strokes, notes, tool, color, penWidth = 0.004, canEdit, zoom = 1, fit = "contain", showNames = true,
  onStroke, onPlace, onMove, onLike, onDelete, canMove, canDelete, className, emptyHint,
}: {
  strokes: BoardStroke[];
  notes: StickyNote[];
  tool: FreeTool;
  color: string;
  penWidth?: number;
  canEdit: boolean;
  zoom?: number;
  /** contain = whole board visible (projector); width = fill width × zoom and scroll (phones) */
  fit?: "contain" | "width";
  showNames?: boolean;
  onStroke: (s: Stroke) => void;
  onPlace: (x: number, y: number) => void;
  onMove: (id: string, x: number, y: number) => void;
  onLike: (n: StickyNote) => void;
  onDelete: (n: StickyNote) => void;
  canMove: (n: StickyNote) => boolean;
  canDelete: (n: StickyNote) => boolean;
  className?: string;
  emptyHint?: React.ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const current = useRef<[number, number][] | null>(null);
  const penPointer = useRef<number | null>(null);
  const justDragged = useRef(false);
  const dragInfo = useRef<{ id: string; pointerId: number; dx: number; dy: number; moved: boolean; startX: number; startY: number } | null>(null);

  // size the board
  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const W = e.contentRect.width, H = e.contentRect.height;
      if (fit === "contain") {
        const w = Math.max(0, Math.min(W, H * BOARD_ASPECT));
        setBox({ w, h: w / BOARD_ASPECT });
      } else {
        const w = Math.max(0, W * zoom);
        setBox({ w, h: w / BOARD_ASPECT });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, zoom]);

  const redraw = useCallback(() => {
    const c = canvas.current;
    if (!c || box.w === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(box.w * dpr) || c.height !== Math.round(box.h * dpr)) {
      c.width = Math.round(box.w * dpr);
      c.height = Math.round(box.h * dpr);
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.w, box.h);
    strokes.forEach((s) => drawStroke(ctx, s, box.w, box.h));
    if (current.current) drawStroke(ctx, { points: current.current, color, width: penWidth }, box.w, box.h);
  }, [strokes, box, color, penWidth]);
  useEffect(() => { redraw(); }, [redraw]);

  const norm = (clientX: number, clientY: number): [number, number] => {
    const r = boardRef.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (clientX - r.left) / r.width)), Math.min(1, Math.max(0, (clientY - r.top) / r.height))];
  };

  // ── pen ───────────────────────────────────────────────────────────
  const penDown = (e: React.PointerEvent) => {
    if (tool !== "pen" || !canEdit || penPointer.current !== null) return;
    e.preventDefault();
    penPointer.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    current.current = [norm(e.clientX, e.clientY)];
    setSelected(null);
    redraw();
  };
  const penMove = (e: React.PointerEvent) => {
    if (penPointer.current !== e.pointerId || !current.current) return;
    const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events) {
      const p = norm(ev.clientX, ev.clientY);
      const last = current.current[current.current.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.0015) current.current.push(p);
    }
    redraw();
  };
  const penUp = (e: React.PointerEvent) => {
    if (penPointer.current !== e.pointerId) return;
    penPointer.current = null;
    const pts = current.current;
    current.current = null;
    if (pts?.length) onStroke({ points: pts.map(([x, y]) => [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]), color, width: penWidth });
  };

  // ── tap to write ─────────────────────────────────────────────────
  const boardClick = (e: React.MouseEvent) => {
    if (e.target !== boardRef.current && e.target !== canvas.current) return; // clicks on notes are handled there
    if (selected) { setSelected(null); return; }
    if (tool !== "text" || !canEdit) return;
    const [x, y] = norm(e.clientX, e.clientY);
    onPlace(Math.min(1 - NOTE_W - 0.005, Math.max(0, x - 0.01)), Math.min(0.94, Math.max(0, y - 0.015)));
  };

  // ── drag notes ───────────────────────────────────────────────────
  const noteDown = (e: React.PointerEvent, n: StickyNote) => {
    e.stopPropagation();
    if (tool !== "move" || !canEdit || !canMove(n)) return;
    const [px, py] = norm(e.clientX, e.clientY);
    dragInfo.current = { id: n.id, pointerId: e.pointerId, dx: px - n.x, dy: py - n.y, moved: false, startX: e.clientX, startY: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const noteMove = (e: React.PointerEvent) => {
    const d = dragInfo.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
    d.moved = true;
    const [px, py] = norm(e.clientX, e.clientY);
    setDrag({ id: d.id, x: Math.min(1 - NOTE_W, Math.max(0, px - d.dx)), y: Math.min(0.95, Math.max(0, py - d.dy)) });
  };
  const noteUp = (e: React.PointerEvent, n: StickyNote) => {
    const d = dragInfo.current;
    if (d && d.pointerId === e.pointerId) {
      dragInfo.current = null;
      if (d.moved && drag && drag.id === n.id) {
        justDragged.current = true;
        onMove(n.id, Math.round(drag.x * 10000) / 10000, Math.round(drag.y * 10000) / 10000);
        setDrag(null);
        return;
      }
      setDrag(null);
    }
  };

  const fontPx = Math.max(9, box.w * 0.0125);

  return (
    <div ref={outer} className={cn("relative h-full w-full", fit === "width" ? "overflow-auto overscroll-contain" : "flex items-center justify-center overflow-hidden", className)}>
      <div
        ref={boardRef}
        onClick={boardClick}
        className={cn("relative shrink-0 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200", tool === "text" && canEdit && "cursor-text", fit === "width" && "mx-auto")}
        style={{
          width: box.w, height: box.h,
          backgroundImage: "radial-gradient(circle, #CBD5E1 1px, transparent 1.2px)",
          backgroundSize: `${Math.max(14, box.w / 48)}px ${Math.max(14, box.w / 48)}px`,
        }}
      >
        <canvas
          ref={canvas}
          className="absolute inset-0 h-full w-full select-none-touch"
          style={{ touchAction: tool === "pen" && canEdit ? "none" : "auto", cursor: tool === "pen" && canEdit ? "crosshair" : undefined }}
          onPointerDown={penDown}
          onPointerMove={penMove}
          onPointerUp={penUp}
          onPointerCancel={penUp}
        />
        {notes.length === 0 && strokes.length === 0 && emptyHint && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">{emptyHint}</div>
        )}
        {notes.map((n) => {
          const pos = drag?.id === n.id ? drag : n;
          const movable = tool === "move" && canEdit && canMove(n);
          const isSel = selected === n.id;
          return (
            <div
              key={n.id}
              onPointerDown={(e) => noteDown(e, n)}
              onPointerMove={noteMove}
              onPointerUp={(e) => noteUp(e, n)}
              onClick={(e) => { e.stopPropagation(); if (justDragged.current) { justDragged.current = false; return; } setSelected(isSel ? null : n.id); }}
              className={cn(
                "absolute rounded-lg border-2 shadow-md animate-pop select-none-touch",
                STICKY_STYLES[n.color],
                movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                n.mine && "ring-2 ring-mfu/30",
                isSel && "z-10 ring-2 ring-slate-900",
                drag?.id === n.id && "z-20 scale-105 shadow-xl"
              )}
              style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, width: `${NOTE_W * 100}%`, fontSize: fontPx, padding: fontPx * 0.55, touchAction: movable ? "none" : "auto" }}
            >
              <div className="whitespace-pre-wrap break-words font-medium leading-snug">{n.text}</div>
              {(showNames || (n.likeCount ?? 0) > 0) && (
                <div className="mt-1 flex items-center gap-1 opacity-70" style={{ fontSize: fontPx * 0.72 }}>
                  {showNames && <AuthorTag name={n.displayPseudonym} isAnonymous={n.isAnonymous} mine={n.mine} className="min-w-0 flex-1" />}
                  {(n.likeCount ?? 0) > 0 && <span className="ml-auto inline-flex items-center gap-0.5 font-semibold"><Heart className="h-[1em] w-[1em] fill-current" />{n.likeCount}</span>}
                </div>
              )}
              {isSel && (
                <div className="absolute left-0 top-full mt-1 flex gap-1 rounded-lg bg-slate-900 p-1 text-white shadow-lg" style={{ fontSize: Math.max(12, fontPx * 0.85) }} onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => onLike(n)} className={cn("flex items-center gap-1 rounded-md px-2 py-1", n.likedByMe ? "bg-rose-500" : "hover:bg-white/10")} aria-label="Like">
                    <Heart className={cn("h-4 w-4", n.likedByMe && "fill-current")} />{n.likeCount ?? 0}
                  </button>
                  {canDelete(n) && (
                    <button onClick={() => { setSelected(null); onDelete(n); }} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
