"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { StickyNote, Stroke } from "@/types";

export type BoardStroke = Stroke & { id: string; displayPseudonym?: string };

export const STICKY_STYLES: Record<StickyNote["color"], string> = {
  amber: "bg-amber-100 border-amber-300 text-amber-950",
  blue: "bg-sky-100 border-sky-300 text-sky-950",
  emerald: "bg-emerald-100 border-emerald-300 text-emerald-950",
  rose: "bg-rose-100 border-rose-300 text-rose-950",
};

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number) {
  if (!s.points.length) return;
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = Math.max(1, s.width * w);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.points.length === 1) {
    ctx.beginPath();
    ctx.arc(s.points[0][0] * w, s.points[0][1] * h, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(s.points[0][0] * w, s.points[0][1] * h);
  // quadratic smoothing through midpoints
  for (let i = 1; i < s.points.length - 1; i++) {
    const [x0, y0] = s.points[i];
    const [x1, y1] = s.points[i + 1];
    ctx.quadraticCurveTo(x0 * w, y0 * h, ((x0 + x1) / 2) * w, ((y0 + y1) / 2) * h);
  }
  const last = s.points[s.points.length - 1];
  ctx.lineTo(last[0] * w, last[1] * h);
  ctx.stroke();
}

/**
 * Shared collaborative canvas. Points are normalised (0–1) so strokes from a phone land in the
 * same place on a 16:9 projector. Works with mouse, finger and Apple Pencil (pointer events).
 */
export function BoardSurface({
  strokes, stickies, enabled, color, width, onStroke, background, aspect = 16 / 9, className, showNames = false, penOnly = false,
}: {
  strokes: BoardStroke[];
  stickies: StickyNote[];
  enabled: boolean;
  color: string;
  width: number;
  onStroke?: (s: Stroke) => void;
  background?: React.ReactNode;
  aspect?: number;
  className?: string;
  showNames?: boolean;
  penOnly?: boolean;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const current = useRef<[number, number][] | null>(null);
  const pointerId = useRef<number | null>(null);

  // fit an aspect-ratio box inside the parent
  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const W = e.contentRect.width, H = e.contentRect.height;
      const w = Math.min(W, H * aspect || W);
      setBox({ w, h: w / aspect });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  const redraw = useCallback(() => {
    const c = canvas.current;
    if (!c || box.w === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(box.w * dpr)) {
      c.width = Math.round(box.w * dpr);
      c.height = Math.round(box.h * dpr);
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.w, box.h);
    strokes.forEach((s) => drawStroke(ctx, s, box.w, box.h));
    if (current.current) drawStroke(ctx, { points: current.current, color, width }, box.w, box.h);
  }, [strokes, box, color, width]);

  useEffect(() => { redraw(); }, [redraw]);

  const norm = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };

  const down = (e: React.PointerEvent) => {
    if (!enabled || pointerId.current !== null) return;
    if (penOnly && e.pointerType === "touch") return;
    e.preventDefault();
    pointerId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    current.current = [norm(e)];
    redraw();
  };
  const move = (e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId || !current.current) return;
    const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent];
    const r = canvas.current!.getBoundingClientRect();
    for (const ev of events) {
      const p: [number, number] = [Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))];
      const last = current.current[current.current.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.002) current.current.push(p);
    }
    redraw();
  };
  const up = (e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;
    const pts = current.current;
    current.current = null;
    if (pts && pts.length) {
      const rounded = pts.map(([x, y]) => [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000] as [number, number]);
      onStroke?.({ points: rounded, color, width });
    }
  };

  return (
    <div ref={outer} className={cn("relative flex h-full w-full items-center justify-center", className)}>
      <div className="relative overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200" style={{ width: box.w, height: box.h }}>
        {background && <div className="pointer-events-none absolute inset-0">{background}</div>}
        <canvas
          ref={canvas}
          className={cn("absolute inset-0 h-full w-full select-none-touch", enabled ? "cursor-crosshair" : "")}
          style={{ touchAction: enabled ? "none" : "auto" }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        {stickies.map((n) => (
          <div
            key={n.id}
            className={cn("pointer-events-none absolute flex flex-col rounded-md border p-[0.6%] shadow-md animate-pop", STICKY_STYLES[n.color])}
            style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%`, width: "15%", minHeight: "11%", fontSize: Math.max(9, box.w * 0.0135) }}
          >
            <div className="flex-1 break-words leading-snug">{n.text}</div>
            {showNames && <div className="mt-1 truncate opacity-60" style={{ fontSize: "0.75em" }}>{n.displayPseudonym}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Hook that keeps board items in sync with socket broadcasts for the current slide page. */
export function useBoardState(page: number) {
  const [strokes, setStrokes] = useState<BoardStroke[]>([]);
  const [stickies, setStickies] = useState<StickyNote[]>([]);
  const pageRef = useRef(page);
  pageRef.current = page;
  return { strokes, setStrokes, stickies, setStickies, pageRef };
}
