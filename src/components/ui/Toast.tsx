"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface ToastItem { id: number; title: string; body?: string; tone?: "default" | "success" | "error" }

/** Tiny toast queue. `position` lets the instructor console use top-right, the student app top-center. */
export function useToasts(duration = 3500) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const id = useRef(0);
  const push = useCallback((t: Omit<ToastItem, "id">) => {
    const tid = ++id.current;
    setToasts((x) => [...x.slice(-2), { ...t, id: tid }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== tid)), duration);
  }, [duration]);
  return { toasts, push };
}

export function Toasts({ toasts, position = "top-right" }: { toasts: ToastItem[]; position?: "top-right" | "top-center" }) {
  const [, force] = useState(0);
  useEffect(() => { force((n) => n + 1); }, [toasts.length]);
  return (
    <div className={cn("pointer-events-none fixed z-[60] flex flex-col gap-2", position === "top-right" ? "right-4 top-16 w-80" : "left-1/2 top-3 w-[min(92vw,420px)] -translate-x-1/2 pt-safe")}>
      {toasts.map((t) => (
        <div key={t.id} className={cn("pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg animate-fade-in-down",
          t.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : t.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-800")}>
          <div className="font-semibold">{t.title}</div>
          {t.body && <div className="mt-0.5 text-slate-600 line-clamp-3">{t.body}</div>}
        </div>
      ))}
    </div>
  );
}
