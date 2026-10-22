import { cn } from "@/lib/cn";
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 64 64" className="h-7 w-7 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#990000" />
        <rect x="14" y="16" width="36" height="24" rx="3" fill="none" stroke="#fff" strokeWidth="4" />
        <path d="M26 48h12M32 40v8" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        <circle cx="44" cy="20" r="6" fill="#D97706" stroke="#990000" strokeWidth="2" />
      </svg>
      {!compact && (
        <span>
          iLecture <span className="text-mfu">MFU</span>
        </span>
      )}
    </span>
  );
}
