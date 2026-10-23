"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eraser, Eye, EyeOff, Heart, Lightbulb, Lock, LockOpen, Pencil, Sparkles, X } from "lucide-react";
import { STICKY_STYLES } from "@/components/shared/BoardSurface";
import { cn } from "@/lib/cn";
import type { StickyNote } from "@/types";

const PROMPT_IDEAS = [
  "What is one thing you learned today?",
  "Where would you use this in real life?",
  "What is still unclear to you?",
  "Give an example of …",
];

/**
 * Idea Board on the projector — a blank wall where every student posts ideas from their phone.
 * Notes flow in as a masonry wall (scales to 200+ notes), sortable by newest or most ♥.
 */
export function IdeaWall({ notes, prompt, frozen, sessionCode, onPrompt, onFreeze, onClear, onDelete, onLike }: {
  notes: StickyNote[]; prompt: string | null; frozen: boolean; sessionCode: string;
  onPrompt: (p: string | null) => void; onFreeze: (f: boolean) => void; onClear: () => void; onDelete: (id: string) => void; onLike: (id: string, remove: boolean) => void;
}) {
  const [sort, setSort] = useState<"new" | "top">("new");
  const [showNames, setShowNames] = useState(true);
  const [editing, setEditing] = useState(!prompt);
  const [draft, setDraft] = useState(prompt ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setDraft(prompt ?? ""); }, [prompt, editing]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const sorted = useMemo(() => {
    const list = [...notes];
    if (sort === "top") list.sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    else list.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    return list;
  }, [notes, sort]);

  const save = () => { onPrompt(draft.trim() || null); setEditing(false); };
  const tool = "flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100";

  return (
    <div className="flex h-full flex-col">
      {/* prompt */}
      <div className="mb-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-mfu"><Lightbulb className="h-4 w-4" />Idea Board · บอร์ดความคิดเห็น</div>
        {editing ? (
          <div className="mt-2">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 200))}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
                placeholder="Ask the class something… (optional)"
                className="h-12 flex-1 rounded-xl border border-slate-200 px-4 text-xl font-semibold outline-none focus:border-mfu focus:ring-2 focus:ring-mfu/20"
              />
              <button onClick={save} className="rounded-xl bg-mfu px-5 text-sm font-semibold text-white hover:bg-mfu-hover">Show to class</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PROMPT_IDEAS.map((p) => (
                <button key={p} onClick={() => setDraft(p)} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">{p}</button>
              ))}
            </div>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="group mt-1 flex w-full items-start gap-2 text-left" title="Edit question">
            <span className={cn("text-2xl font-semibold leading-snug lg:text-3xl", prompt ? "text-slate-900" : "text-slate-400")}>{prompt || "Share your ideas with the class"}</span>
            <Pencil className="mt-2 h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-500" />
          </button>
        )}
      </div>

      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-sm">
        <span className="px-2 text-sm font-semibold text-slate-800">{notes.length} ideas</span>
        <span className="mx-1 h-6 w-px bg-slate-200" />
        {(["new", "top"] as const).map((k) => (
          <button key={k} onClick={() => setSort(k)} className={cn(tool, sort === k && "bg-slate-900 text-white hover:bg-slate-800")}>{k === "new" ? "Newest" : "Most ♥"}</button>
        ))}
        <span className="mx-1 h-6 w-px bg-slate-200" />
        <button className={tool} onClick={() => setShowNames((v) => !v)}>{showNames ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}Names</button>
        <button className={cn(tool, frozen && "bg-slate-900 text-white hover:bg-slate-800")} onClick={() => onFreeze(!frozen)}>{frozen ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}{frozen ? "Closed" : "Close posting"}</button>
        <button className={cn(tool, "text-rose-600 hover:bg-rose-50")} onClick={() => { if (confirm("Remove all ideas from the board?")) onClear(); }}><Eraser className="h-4 w-4" />Clear</button>
        <span className="ml-auto pr-2 text-xs text-slate-500">Students post from their phones · PIN <span className="font-mono font-bold text-slate-800">{sessionCode}</span></span>
      </div>

      {/* wall */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-slate-200/50 p-3">
        {sorted.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Sparkles className="h-12 w-12 text-amber-500" />
            <p className="mt-3 text-2xl font-semibold text-slate-700">Waiting for ideas…</p>
            <p className="mt-1 text-slate-500">The board is open on every student&apos;s phone and iPad.</p>
          </div>
        ) : (
          <div className="columns-2 gap-3 md:columns-3 xl:columns-4 2xl:columns-5">
            {sorted.map((n) => (
              <div key={n.id} className={cn("group relative mb-3 break-inside-avoid rounded-xl border-2 p-4 shadow-sm animate-pop", STICKY_STYLES[n.color])}>
                <p className="whitespace-pre-wrap break-words text-lg font-medium leading-snug">{n.text}</p>
                <div className="mt-3 flex items-center justify-between text-xs opacity-70">
                  <span className="truncate">{showNames ? n.displayPseudonym : ""}</span>
                  <button onClick={() => onLike(n.id, !!n.likedByMe)} className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", n.likedByMe ? "bg-rose-500 text-white opacity-100" : "hover:bg-black/5")}>
                    <Heart className={cn("h-3.5 w-3.5", n.likedByMe && "fill-current")} />{n.likeCount ?? 0}
                  </button>
                </div>
                <button onClick={() => onDelete(n.id)} className="absolute right-1.5 top-1.5 hidden rounded-md bg-white/80 p-1 text-slate-500 hover:text-rose-600 group-hover:block" title="Remove"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
