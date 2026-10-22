"use client";
import { cn } from "@/lib/cn";
import type { PaceSignal } from "@/types";

const OPTIONS: { key: PaceSignal; emoji: string; label: string; th: string; on: string }[] = [
  { key: "TOO_FAST", emoji: "🐇", label: "Too fast", th: "เร็วไป", on: "bg-amber-500 text-white border-amber-500 shadow-amber-200" },
  { key: "CLEAR", emoji: "👍", label: "Clear", th: "เข้าใจ", on: "bg-emerald-600 text-white border-emerald-600 shadow-emerald-200" },
  { key: "CONFUSED", emoji: "🤔", label: "Confused", th: "งง", on: "bg-rose-600 text-white border-rose-600 shadow-rose-200" },
];

/** Three thumb-sized buttons. Tap = send, tap again = undo. Resets on every new slide. */
export function PaceBar({ value, onChange, disabled, slidePage }: { value: PaceSignal | null | undefined; onChange: (v: PaceSignal | null) => void; disabled?: boolean; slidePage: number }) {
  return (
    <div className="w-full">
      <div className="mb-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400">How is slide {slidePage}?</div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => {
          const active = value === o.key;
          return (
            <button
              key={o.key}
              disabled={disabled}
              aria-pressed={active}
              onClick={() => {
                navigator.vibrate?.(12);
                onChange(active ? null : o.key);
              }}
              className={cn(
                "flex h-[68px] flex-col items-center justify-center rounded-2xl border text-sm font-semibold transition-all active:scale-95 disabled:opacity-40",
                active ? cn(o.on, "shadow-lg") : "border-slate-200 bg-white text-slate-700"
              )}
            >
              <span className={cn("text-2xl leading-none", active && "animate-pop")}>{o.emoji}</span>
              <span className="mt-1 leading-none">{o.label}</span>
              <span className={cn("mt-0.5 text-[10px] font-normal leading-none", active ? "text-white/80" : "text-slate-400")}>{o.th}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
