"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, PartyPopper, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PdfThumb } from "@/components/shared/PdfSlide";
import { cn } from "@/lib/cn";
import type { SlideMetadataDTO } from "@/types";

const LABELS = ["", "Lost 😵", "Shaky 😕", "Okay 🙂", "Good 😀", "Crystal clear 🤩"];

/**
 * Post-class exit ticket — designed for 2–3 taps:
 *   ★ rating → tap the confusing slide (pre-selected from your "Confused" taps) → Submit.
 * Typing is optional.
 */
export function ExitTicketModal({ sessionTitle, totalPages, slideUrl, slides, confusedPages, closesAt, onSubmit }: {
  sessionTitle: string; totalPages: number; slideUrl: string | null; slides: Record<number, SlideMetadataDTO | undefined>;
  confusedPages: number[]; closesAt: number | null; onSubmit: (rating: number, muddiest: string) => Promise<boolean>;
}) {
  const [rating, setRating] = useState(0);
  const [picked, setPicked] = useState<number | "none" | null>(confusedPages.length ? confusedPages[confusedPages.length - 1] : null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!closesAt) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((closesAt - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [closesAt]);

  const pages = useMemo(() => Array.from({ length: totalPages }, (_, i) => i + 1), [totalPages]);

  const submit = async () => {
    let text = "";
    if (picked === "none") text = "Nothing — all clear";
    else if (typeof picked === "number") {
      const m = slides[picked];
      text = `Slide ${picked}: ${m?.keyTerms?.length ? m.keyTerms.join(", ") : m?.summary ?? ""}`.trim();
    }
    if (note.trim()) text = text && picked !== "none" ? `${text} — ${note.trim()}` : note.trim();
    setSending(true);
    const ok = await onSubmit(rating, text || "Nothing — all clear");
    setSending(false);
    if (ok) { setDone(true); navigator.vibrate?.([20, 40, 20]); }
  };

  if (done)
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white px-8 text-center">
        <PartyPopper className="h-14 w-14 text-mfu" />
        <h2 className="mt-4 text-2xl font-semibold">Thank you!</h2>
        <p className="mt-2 text-slate-500">Your feedback helps shape the next class. See you next time 👋</p>
      </div>
    );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white pt-safe">
      <div className="mx-auto flex min-h-full max-w-lg flex-col px-5 pb-safe-2">
        <div className="pt-6 text-center">
          <div className="text-xs font-semibold uppercase tracking-wide text-mfu">Exit ticket · 20 seconds</div>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">{sessionTitle}</h2>
          {left !== null && left > 0 && <div className="mt-1 text-xs text-slate-400">Closes in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</div>}
        </div>

        <section className="mt-6">
          <h3 className="text-center text-base font-medium text-slate-700">How well did you understand today&apos;s lecture?</h3>
          <div className="mt-3 flex justify-center gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => { setRating(n); navigator.vibrate?.(8); }} aria-label={`${n} stars`} className="p-1 active:scale-90">
                <Star className={cn("h-11 w-11 transition-colors", n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
              </button>
            ))}
          </div>
          <div className="h-5 text-center text-sm font-medium text-slate-600">{LABELS[rating]}</div>
        </section>

        <section className={cn("mt-5 transition-opacity", rating ? "opacity-100" : "pointer-events-none opacity-30")}>
          <h3 className="text-base font-medium text-slate-700">What was the muddiest point? <span className="text-sm font-normal text-slate-400">Tap a slide</span></h3>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {pages.map((p) => (
              <button key={p} onClick={() => setPicked(picked === p ? null : p)} className={cn("relative rounded-xl border-2 p-1.5 text-left transition-all active:scale-[0.98]", picked === p ? "border-mfu bg-mfu/5" : "border-slate-200")}>
                {slideUrl ? <PdfThumb url={slideUrl} page={p} /> : <div className="aspect-video rounded-lg bg-slate-100" />}
                <div className="mt-1 line-clamp-1 px-0.5 text-[11px] text-slate-600">{p}. {slides[p]?.keyTerms?.[0] ?? slides[p]?.category ?? `Slide ${p}`}</div>
                {picked === p && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-mfu text-white"><Check className="h-4 w-4" /></span>}
                {confusedPages.includes(p) && picked !== p && <span className="absolute right-2 top-2 rounded-full bg-rose-100 px-1.5 text-[10px] font-medium text-rose-700">you 🤔</span>}
              </button>
            ))}
            <button onClick={() => setPicked(picked === "none" ? null : "none")} className={cn("flex aspect-[4/3] flex-col items-center justify-center rounded-xl border-2 text-sm font-medium sm:aspect-auto", picked === "none" ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600")}>
              <span className="text-2xl">✅</span>All clear
            </button>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Anything to add? (optional, Thai OK)" className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-base outline-none focus:border-mfu" />
        </section>

        <div className="sticky bottom-0 mt-auto bg-gradient-to-t from-white via-white to-white/0 pb-2 pt-6">
          <Button size="xl" className="w-full" disabled={!rating || (picked === null && !note.trim())} loading={sending} onClick={submit}>Submit</Button>
        </div>
      </div>
    </div>
  );
}
