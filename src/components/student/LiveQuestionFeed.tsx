"use client";
import { useState } from "react";
import { CheckCircle2, ChevronUp, Layers, Pin } from "lucide-react";
import { cn } from "@/lib/cn";
import { ANIMAL_EMOJI } from "@/lib/animals";
import type { QuestionDTO } from "@/types";
import { AuthorTag } from "./Identity";

export function animalOf(pseudonym: string) {
  return ANIMAL_EMOJI[pseudonym.split(" ").pop() ?? ""] ?? "🙂";
}

/** Peer question list — one tap on the vote pill to "me too". */
export function LiveQuestionFeed({ questions, onVote, currentPage, disabled }: { questions: QuestionDTO[]; onVote: (q: QuestionDTO) => void; currentPage: number; disabled?: boolean }) {
  const [showAnswered, setShowAnswered] = useState(false);
  const open = questions.filter((q) => !q.isAnswered);
  const answered = questions.filter((q) => q.isAnswered);

  if (questions.length === 0)
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
        No questions yet. Be the first 🙌<br />Tick “Hide my name” if you’d rather ask anonymously.
      </div>
    );

  return (
    <div className="space-y-2">
      {open.map((q) => (
        <QuestionRow key={q.id} q={q} onVote={onVote} highlight={q.slidePage === currentPage} disabled={disabled} />
      ))}
      {answered.length > 0 && (
        <button onClick={() => setShowAnswered((v) => !v)} className="w-full py-2 text-center text-xs font-medium text-slate-500">
          {showAnswered ? "Hide" : "Show"} {answered.length} answered
        </button>
      )}
      {showAnswered && answered.map((q) => <QuestionRow key={q.id} q={q} onVote={onVote} disabled />)}
    </div>
  );
}

function QuestionRow({ q, onVote, highlight, disabled }: { q: QuestionDTO; onVote: (q: QuestionDTO) => void; highlight?: boolean; disabled?: boolean }) {
  return (
    <div className={cn("flex items-stretch gap-3 rounded-2xl border bg-white p-3 shadow-sm", q.isPinned ? "border-amber-300 bg-amber-50/40" : "border-slate-200", q.isAnswered && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
          <AuthorTag name={q.displayPseudonym} isAnonymous={q.isAnonymous} mine={q.mine} className="max-w-[60%]" />
          <span className={cn("rounded px-1 font-medium", highlight ? "bg-mfu/10 text-mfu" : "bg-slate-100 text-slate-500")}>Slide {q.slidePage}</span>
          {q.clusterSize > 1 && <span className="flex items-center gap-0.5 text-amber-700"><Layers className="h-3 w-3" />{q.clusterSize} similar</span>}
          {q.isPinned && <span className="flex items-center gap-0.5 text-amber-700"><Pin className="h-3 w-3" />Pinned</span>}
          {q.isAnswered && <span className="flex items-center gap-0.5 text-emerald-600"><CheckCircle2 className="h-3 w-3" />Answered</span>}
        </div>
        <p className="text-[15px] leading-snug text-slate-800">{q.polishedContent}</p>
      </div>
      <button
        disabled={disabled}
        onClick={() => { navigator.vibrate?.(10); onVote(q); }}
        aria-pressed={!!q.votedByMe}
        aria-label={q.votedByMe ? "Remove vote" : "Me too"}
        className={cn(
          "flex w-14 shrink-0 flex-col items-center justify-center rounded-xl border text-sm font-bold transition-all active:scale-95",
          q.votedByMe ? "border-mfu bg-mfu text-white" : "border-slate-200 bg-slate-50 text-slate-700"
        )}
      >
        <ChevronUp className="h-5 w-5" />
        {q.upvoteCount}
      </button>
    </div>
  );
}
