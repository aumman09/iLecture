"use client";
import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Modal({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; className?: string }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className={cn("w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-fade-in-down", className)} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Mobile-first bottom sheet (used by the student app). */
export function Sheet({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: React.ReactNode; className?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center" onClick={onClose}>
      <div className={cn("w-full max-w-lg rounded-t-3xl bg-white p-5 pb-safe-2 shadow-2xl animate-sheet-up sm:rounded-3xl sm:pb-5", className)} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" />
        {children}
      </div>
    </div>
  );
}
