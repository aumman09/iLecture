"use client";
import { useMemo, useState } from "react";
import { Heart, Lightbulb, Lock, Send, Trash2 } from "lucide-react";
import { STICKY_STYLES } from "@/components/shared/BoardSurface";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { StickyColor, StickyNote } from "@/types";

const COLORS: StickyColor[] = ["amber", "blue", "emerald", "rose"];

/** Opens by itself when the instructor opens the Idea Board: type → Post (1 tap), ♥ others' ideas (1 tap). */
export function StudentIdeaBoard({ prompt, notes, frozen, onPost, onLike, onDelete }: {
  prompt: string | null; notes: StickyNote[]; frozen: boolean;
  onPost: (text: string, color: StickyColor) => Promise<boolean>; onLike: (id: string, remove: boolean) => void; onDelete: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [color, setColor] = useState<StickyColor>(() => COLORS[Math.floor(Math.random() * COLORS.length)]);
  const [sending, setSending] = useState(false);
  const sorted = useMemo(() => [...notes].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")), [notes]);
  const mineCount = notes.filter((n) => n.mine).length;

  const post = async () => {
    if (!text.trim()) return;
    setSending(true);
    const ok = await onPost(text.trim(), color);
    setSending(false);
    if (ok) { setText(""); navigator.vibrate?.(20); }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pt-3">
        <div className="rounded-2xl bg-mfu px-4 py-3 text-white shadow-sm">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/70"><Lightbulb className="h-3.5 w-3.5" />Idea Board · บอร์ดความคิดเห็น</div>
          <div className="mt-0.5 text-lg font-semibold leading-snug">{prompt || "Share your idea with the class"}</div>
        </div>

        {frozen ? (
          <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white"><Lock className="h-4 w-4" />Posting is closed by the instructor</div>
        ) : (
          <div className={cn("mt-3 rounded-2xl border-2 p-2 shadow-sm", STICKY_STYLES[color])}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 280))}
              rows={3}
              placeholder="Type your idea… (Thai or English)"
              className="w-full resize-none bg-transparent px-2 py-1 text-base outline-none placeholder:text-current placeholder:opacity-50"
            />
            <div className="flex items-center gap-1.5">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} aria-label={c} className={cn("h-8 w-8 rounded-lg border-2", STICKY_STYLES[c], color === c && "ring-2 ring-slate-900 ring-offset-1")} />
              ))}
              <span className="ml-auto mr-1 text-xs opacity-60">{text.length}/280</span>
              <Button size="lg" disabled={!text.trim()} loading={sending} onClick={post}><Send className="h-4 w-4" />Post</Button>
            </div>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between px-1 text-xs text-slate-500">
          <span>{notes.length} ideas from the class{mineCount ? ` · ${mineCount} yours` : ""}</span>
          <span>tap ♥ on ideas you like</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-safe-2 pt-2">
        <div className="columns-1 gap-2 sm:columns-2 lg:columns-3">
          {sorted.map((n) => (
            <div key={n.id} className={cn("mb-2 break-inside-avoid rounded-xl border-2 p-3", STICKY_STYLES[n.color], n.mine && "ring-2 ring-mfu/40")}>
              <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{n.text}</p>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="truncate opacity-60">{n.mine ? "You" : n.displayPseudonym}</span>
                {n.mine && !frozen && (
                  <button onClick={() => onDelete(n.id)} className="rounded-md p-1 opacity-50 active:opacity-100" aria-label="Delete my idea"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
                <button
                  onClick={() => { navigator.vibrate?.(8); onLike(n.id, !!n.likedByMe); }}
                  aria-pressed={!!n.likedByMe}
                  className={cn("ml-auto flex h-8 items-center gap-1 rounded-full px-3 font-semibold active:scale-95", n.likedByMe ? "bg-rose-500 text-white" : "bg-white/60")}
                >
                  <Heart className={cn("h-4 w-4", n.likedByMe && "fill-current")} />{n.likeCount ?? 0}
                </button>
              </div>
            </div>
          ))}
        </div>
        {sorted.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No ideas yet — be the first! ✨</p>}
      </div>
    </div>
  );
}
