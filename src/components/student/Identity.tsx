"use client";
import { EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { ANIMAL_EMOJI } from "@/lib/animals";

/** "Curious Otter" → "Anonymous Otter" with the otter emoji. */
export function anonLabel(pseudonym: string) {
  const animal = pseudonym.split(" ").pop() ?? "";
  return { emoji: ANIMAL_EMOJI[animal] ?? "🙂", text: `Anonymous ${animal}`.trim() };
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "?";
}

/** Author chip used in question lists and on board notes. */
export function AuthorTag({ name, isAnonymous, mine, className }: { name: string; isAnonymous?: boolean; mine?: boolean; className?: string }) {
  if (isAnonymous) {
    const a = anonLabel(name);
    return (
      <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
        <span aria-hidden>{a.emoji}</span>
        <span className="truncate">{mine ? `You (${a.text})` : a.text}</span>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[8px] font-bold text-white">{initials(name)}</span>
      <span className="truncate">{mine ? `You (${name})` : name}</span>
    </span>
  );
}

/**
 * The "hide my name" tick box. Default = real name is shown to classmates and the screen.
 * Ticked = shown as "Anonymous …". The instructor's participation analytics still count it.
 */
export function HideNameToggle({ value, onChange, compact, dark }: { value: boolean; onChange: (v: boolean) => void; compact?: boolean; dark?: boolean }) {
  return (
    <label className={cn("inline-flex cursor-pointer select-none items-center gap-2", compact ? "text-xs" : "text-sm", dark ? "text-white/90" : "text-slate-600")}>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => { navigator.vibrate?.(8); onChange(e.target.checked); }}
        className="peer sr-only"
      />
      <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", value ? "bg-slate-900" : dark ? "bg-white/30" : "bg-slate-300")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", value ? "left-[18px]" : "left-0.5")} />
      </span>
      <span className="inline-flex items-center gap-1 font-medium"><EyeOff className="h-3.5 w-3.5" />Hide my name <span className={cn("font-normal", dark ? "text-white/60" : "text-slate-400")}>· ซ่อนชื่อ</span></span>
    </label>
  );
}
