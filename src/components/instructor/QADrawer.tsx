"use client";
import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Layers, Pin, PinOff, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { animalOf } from "@/components/student/LiveQuestionFeed";
import type { PaceStats, QuestionDTO } from "@/types";

/** Slide-out clustered Q&A panel — opened from the dock during natural lecture breaks. */
export function QADrawer({ open, onClose, questions, currentPage, pace, onResolve, onPin, onGoto }: {
  open: boolean; onClose: () => void; questions: QuestionDTO[]; currentPage: number; pace: PaceStats | null;
  onResolve: (id: string, answered: boolean) => void; onPin: (id: string, pinned: boolean) => void; onGoto: (page: number) => void;
}) {
  const [tab, setTab] = useState<"open" | "answered">("open");
  const [onlySlide, setOnlySlide] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const list = useMemo(
    () => questions.filter((q) => (tab === "open" ? !q.isAnswered : q.isAnswered)).filter((q) => !onlySlide || q.slidePage === currentPage),
    [questions, tab, onlySlide, currentPage]
  );
  const openCount = questions.filter((q) => !q.isAnswered).length;

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/20" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
          <h2 className="font-semibold text-slate-900">Questions <span className="text-slate-400">({openCount} open)</span></h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        {pace && pace.total > 0 && (
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="mb-1.5 flex justify-between text-xs text-slate-500"><span>Pace on slide {pace.slidePage}</span><span>{pace.total} responses</span></div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="bg-emerald-500" style={{ width: `${pace.clearPct}%` }} />
              <div className="bg-amber-500" style={{ width: `${pace.tooFastPct}%` }} />
              <div className="bg-rose-500" style={{ width: `${pace.confusedPct}%` }} />
            </div>
            <div className="mt-1.5 flex gap-3 text-[11px] text-slate-600">
              <span>👍 Clear {pace.clearPct}%</span><span>🐇 Too fast {pace.tooFastPct}%</span><span>🤔 Confused {pace.confusedPct}%</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
          {(["open", "answered"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium capitalize", tab === t ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}>{t}</button>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={onlySlide} onChange={(e) => setOnlySlide(e.target.checked)} className="accent-mfu" /> This slide only
          </label>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {list.length === 0 && <p className="py-10 text-center text-sm text-slate-400">{tab === "open" ? "No open questions 🎉" : "Nothing answered yet"}</p>}
          {list.map((q) => (
            <div key={q.id} className={cn("rounded-xl border p-3", q.isPinned ? "border-amber-300 bg-amber-50/50" : "border-slate-200")}>
              <div className="flex gap-3">
                <div className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-slate-50 py-1.5 text-slate-700">
                  <ChevronUp className="h-4 w-4" />
                  <span className="text-sm font-bold">{q.upvoteCount}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-snug text-slate-900">{q.polishedContent}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <button onClick={() => onGoto(q.slidePage)} className={cn("rounded px-1.5 py-0.5 font-medium", q.slidePage === currentPage ? "bg-mfu/10 text-mfu" : "bg-slate-100 hover:bg-slate-200")}>Slide {q.slidePage}</button>
                    <span>{animalOf(q.displayPseudonym)} {q.displayPseudonym}</span>
                    {q.clusterSize > 1 && (
                      <button onClick={() => setExpanded(expanded === q.id ? null : q.id)} className="flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
                        <Layers className="h-3 w-3" /> {q.clusterSize} merged <ChevronDown className={cn("h-3 w-3 transition-transform", expanded === q.id && "rotate-180")} />
                      </button>
                    )}
                  </div>
                  {q.rawContent && q.rawContent !== q.polishedContent && <p className="mt-1 text-xs italic text-slate-400">Original: {q.rawContent}</p>}
                  {expanded === q.id && (q.variants?.length ?? 0) > 0 && (
                    <ul className="mt-2 space-y-1 border-l-2 border-amber-200 pl-2 text-xs text-slate-600">
                      {q.variants!.map((v, i) => <li key={i}>“{v}”</li>)}
                    </ul>
                  )}
                </div>
              </div>
              <div className="mt-2 flex justify-end gap-1.5">
                <button onClick={() => onPin(q.id, !q.isPinned)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">
                  {q.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}{q.isPinned ? "Unpin" : "Pin"}
                </button>
                {q.isAnswered ? (
                  <button onClick={() => onResolve(q.id, false)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"><RotateCcw className="h-3.5 w-3.5" />Reopen</button>
                ) : (
                  <button onClick={() => onResolve(q.id, true)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Answered</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
