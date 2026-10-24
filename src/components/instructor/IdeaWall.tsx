"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, FilePlus2, Minimize, Eraser, Eye, EyeOff, Hand, Heart, LayoutGrid, Lightbulb, Lock, LockOpen, PenLine, Pencil, Sparkles, StickyNote as StickyIcon, Type, Undo2, X } from "lucide-react";
import { FreeBoard, type FreeTool } from "@/components/shared/FreeBoard";
import type { BoardStroke } from "@/components/shared/BoardSurface";
import { Modal } from "@/components/ui/Modal";
import type { StickyColor, Stroke } from "@/types";
import { STICKY_STYLES } from "@/components/shared/BoardSurface";
import { cn } from "@/lib/cn";
import type { StickyNote } from "@/types";
import { AuthorTag } from "@/components/student/Identity";

const PROMPT_IDEAS = [
  "What is one thing you learned today?",
  "Where would you use this in real life?",
  "What is still unclear to you?",
  "Give an example of …",
];

const PENS = ["#0F172A", "#990000", "#2563EB", "#16A34A", "#D97706"];
const NOTE_COLORS: StickyColor[] = ["amber", "blue", "emerald", "rose"];

/**
 * Idea Board on the projector — a blank whiteboard. Students tap anywhere on their phone to write,
 * everyone (instructor too) can draw lines to connect ideas, and the instructor can drag any note.
 * "List" view shows the same notes as a sortable masonry wall for reading.
 */
export function IdeaWall({ notes, strokes, prompt, frozen, sessionCode, page, pageCount, onPage, onPrompt, onFreeze, onClear, onDelete, onLike, onStroke, onUndo, onMove, onPost }: {
  notes: StickyNote[]; strokes: BoardStroke[]; prompt: string | null; frozen: boolean; sessionCode: string;
  page: number; pageCount: number; onPage: (n: number) => void;
  onPrompt: (p: string | null) => void; onFreeze: (f: boolean) => void; onClear: () => void; onDelete: (id: string) => void; onLike: (id: string, remove: boolean) => void;
  onStroke: (s: Stroke) => void; onUndo: () => void; onMove: (id: string, x: number, y: number) => void;
  onPost: (text: string, color: StickyColor, at: { x: number; y: number }) => Promise<boolean>;
}) {
  const [view, setView] = useState<"board" | "list">("board");
  const [full, setFull] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Full screen: real browser full screen where supported, plus a fixed overlay (works on iPad too)
  const toggleFull = () => {
    if (!full) {
      setFull(true);
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    } else {
      setFull(false);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    }
  };
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFull(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("fullscreenchange", onFs); window.removeEventListener("keydown", onKey); };
  }, []);
  // switching page: show that page's question, or open the editor if the page has none yet
  useEffect(() => { setEditing(!prompt); }, [page, prompt]);
  const [boardTool, setBoardTool] = useState<FreeTool>("move");
  const [pen, setPen] = useState(PENS[1]);
  const [placing, setPlacing] = useState<{ x: number; y: number } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteColor, setNoteColor] = useState<StickyColor>("amber");
  const [sort, setSort] = useState<"new" | "top">("new");
  const [showNames, setShowNames] = useState(true);
  const [editing, setEditing] = useState(!prompt);
  const [draft, setDraft] = useState(prompt ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setDraft(prompt ?? ""); }, [prompt, editing]);
  // focus after a short delay so the keyboard shortcut that opened the board (I) is not typed into the box
  useEffect(() => {
    if (!editing) return;
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [editing]);

  const sorted = useMemo(() => {
    const list = [...notes];
    if (sort === "top") list.sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    else list.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    return list;
  }, [notes, sort]);

  const save = () => { onPrompt(draft.trim() || null); setEditing(false); };
  const tool = "flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100";

  const pager = (
    <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
      <button onClick={() => onPage(page - 1)} disabled={page <= 1} className="flex h-8 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-white disabled:opacity-30" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
      <span className="px-1 text-xs font-semibold text-slate-700">Page {page} / {pageCount}</span>
      <button onClick={() => onPage(page + 1)} disabled={page >= pageCount} className="flex h-8 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-white disabled:opacity-30" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
      <button onClick={() => onPage(pageCount + 1)} disabled={pageCount >= 20} className="flex h-8 items-center gap-1 rounded-md bg-white px-2 text-xs font-semibold text-mfu shadow-sm hover:bg-mfu/5 disabled:opacity-40" title="Add a new blank page"><FilePlus2 className="h-4 w-4" />New page</button>
    </div>
  );

  return (
    <div ref={rootRef} className={cn("flex h-full flex-col", full && "fixed inset-0 z-[80] bg-slate-100 p-3")}>
      {/* prompt */}
      <div className={cn("mb-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm", full && "mb-2 py-2")}>
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
        {pager}
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          <button onClick={() => setView("board")} className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium", view === "board" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}><StickyIcon className="h-4 w-4" />Board</button>
          <button onClick={() => setView("list")} className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium", view === "list" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}><LayoutGrid className="h-4 w-4" />List</button>
        </div>
        <span className="mx-1 h-6 w-px bg-slate-200" />
        {view === "board" ? (
          <>
            {([["move", Hand, "Move"], ["text", Type, "Write"], ["pen", PenLine, "Draw"]] as const).map(([k, Icon, label]) => (
              <button key={k} onClick={() => setBoardTool(k)} className={cn(tool, boardTool === k && "bg-slate-900 text-white hover:bg-slate-800")}><Icon className="h-4 w-4" />{label}</button>
            ))}
            {boardTool === "pen" && PENS.map((c) => (
              <button key={c} onClick={() => setPen(c)} aria-label={`Pen ${c}`} className={cn("h-6 w-6 rounded-full border-2", pen === c ? "scale-110 border-slate-900" : "border-white")} style={{ background: c }} />
            ))}
            <button className={tool} onClick={onUndo}><Undo2 className="h-4 w-4" />Undo</button>
          </>
        ) : (
          (["new", "top"] as const).map((k) => (
            <button key={k} onClick={() => setSort(k)} className={cn(tool, sort === k && "bg-slate-900 text-white hover:bg-slate-800")}>{k === "new" ? "Newest" : "Most ♥"}</button>
          ))
        )}
        <span className="mx-1 h-6 w-px bg-slate-200" />
        <button className={tool} onClick={() => setShowNames((v) => !v)}>{showNames ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}Names</button>
        <button className={cn(tool, frozen && "bg-slate-900 text-white hover:bg-slate-800")} onClick={() => onFreeze(!frozen)}>{frozen ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}{frozen ? "Closed" : "Close posting"}</button>
        <button className={cn(tool, "text-rose-600 hover:bg-rose-50")} onClick={() => { if (confirm("Remove all ideas from the board?")) onClear(); }}><Eraser className="h-4 w-4" />Clear</button>
        <span className="ml-auto pr-1 text-xs text-slate-500">PIN <span className="font-mono font-bold text-slate-800">{sessionCode}</span></span>
        <button className={cn(tool, "bg-slate-900 text-white hover:bg-slate-800")} onClick={toggleFull} title="Full screen (Esc to exit)">{full ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}{full ? "Exit full screen" : "Full screen"}</button>
      </div>

      {view === "board" && (
        <div className="min-h-0 flex-1 rounded-2xl bg-slate-200/50 p-2">
          <FreeBoard
            strokes={strokes}
            notes={notes}
            tool={boardTool}
            color={pen}
            canEdit
            showNames={showNames}
            onStroke={onStroke}
            onPlace={(x, y) => { setNoteText(""); setPlacing({ x, y }); }}
            onMove={onMove}
            onLike={(n) => onLike(n.id, !!n.likedByMe)}
            onDelete={(n) => onDelete(n.id)}
            canMove={() => true}
            canDelete={() => true}
            emptyHint={
              <div>
                <Sparkles className="mx-auto h-10 w-10 text-amber-500" />
                <p className="mt-2 text-2xl font-semibold text-slate-600">Blank board — waiting for ideas…</p>
                <p className="mt-1 text-slate-400">Students tap anywhere on their phone to write · everyone can draw lines to connect ideas</p>
              </div>
            }
          />
        </div>
      )}

      <Modal open={!!placing} onClose={() => setPlacing(null)} title="Add a note">
        <textarea autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value.slice(0, 280))} onKeyDown={(e) => e.stopPropagation()} rows={3} className={cn("w-full resize-none rounded-xl border-2 px-3 py-2 outline-none", STICKY_STYLES[noteColor])} placeholder="Topic, keyword or idea…" />
        <div className="mt-3 flex items-center gap-2">
          {NOTE_COLORS.map((c) => <button key={c} onClick={() => setNoteColor(c)} aria-label={c} className={cn("h-8 w-8 rounded-lg border-2", STICKY_STYLES[c], noteColor === c && "ring-2 ring-slate-900 ring-offset-1")} />)}
          <button disabled={!noteText.trim()} onClick={async () => { if (placing && (await onPost(noteText.trim(), noteColor, placing))) setPlacing(null); }} className="ml-auto rounded-xl bg-mfu px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">Add</button>
        </div>
      </Modal>

      {/* list view */}
      {view === "list" && <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-slate-200/50 p-3">
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
                  {showNames ? <AuthorTag name={n.displayPseudonym} isAnonymous={n.isAnonymous} className="max-w-[70%]" /> : <span />}
                  <button onClick={() => onLike(n.id, !!n.likedByMe)} className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", n.likedByMe ? "bg-rose-500 text-white opacity-100" : "hover:bg-black/5")}>
                    <Heart className={cn("h-3.5 w-3.5", n.likedByMe && "fill-current")} />{n.likeCount ?? 0}
                  </button>
                </div>
                <button onClick={() => onDelete(n.id)} className="absolute right-1.5 top-1.5 hidden rounded-md bg-white/80 p-1 text-slate-500 hover:text-rose-600 group-hover:block" title="Remove"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </div>}
    </div>
  );
}
