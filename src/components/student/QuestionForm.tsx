"use client";
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Wand2 } from "lucide-react";
import { Sheet } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const QUICK = [
  { en: "Could you repeat that, please?", th: "พูดอีกครั้งได้ไหม" },
  { en: "Could you explain this slide again?", th: "อธิบายสไลด์นี้อีกที" },
  { en: "Could you give an example?", th: "ขอตัวอย่างหน่อย" },
  { en: "Could you slow down a little?", th: "ช้าลงนิดนึง" },
];

export type AskResult = { ok: boolean; status?: string; error?: string; reason?: string };

/**
 * Ask sheet: one-tap quick questions, or type in Thai / any English — it is auto-polished into
 * academic English while you type (no extra button press), and you send with one tap.
 */
export function QuestionForm({ open, onClose, slidePage, keyTerms, onSubmit }: {
  open: boolean; onClose: () => void; slidePage: number; keyTerms: string[];
  onSubmit: (raw: string, polished: string) => Promise<AskResult>;
}) {
  const [raw, setRaw] = useState("");
  const [polished, setPolished] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [useOriginal, setUseOriginal] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reqId = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) { setRaw(""); setPolished(""); setErr(null); setUseOriginal(false); }
  }, [open]);

  // debounced auto-polish
  useEffect(() => {
    const text = raw.trim();
    if (text.length < 4) { setPolished(""); return; }
    const id = ++reqId.current;
    setPolishing(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/questions/polish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rawContent: text }) });
        const j = await r.json();
        if (id === reqId.current && j.polishedContent) setPolished(j.polishedContent);
      } finally {
        if (id === reqId.current) setPolishing(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [raw]);

  const send = async (rawText: string, polishedText: string) => {
    setSending(true);
    setErr(null);
    const r = await onSubmit(rawText, polishedText);
    setSending(false);
    if (r.ok) onClose();
    else setErr(r.reason ?? r.error ?? "Could not send");
  };

  const finalText = useOriginal || !polished ? raw.trim() : polished;

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Ask about slide {slidePage}</h2>
        <span className="text-xs text-slate-400">Anonymous</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {QUICK.map((q) => (
          <button key={q.en} disabled={sending} onClick={() => send(q.en, q.en)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-[13px] leading-tight text-slate-700 active:scale-[0.98] active:bg-slate-100">
            {q.en}
            <span className="block text-[11px] text-slate-400">{q.th}</span>
          </button>
        ))}
      </div>
      {keyTerms.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {keyTerms.slice(0, 4).map((k) => (
            <button key={k} disabled={sending} onClick={() => send(`Could you explain ${k} again?`, `Could you explain ${k} again?`)} className="rounded-full border border-mfu/20 bg-mfu/5 px-3 py-1.5 text-xs font-medium text-mfu active:scale-95">
              Explain “{k}”?
            </button>
          ))}
        </div>
      )}

      <div className="mt-4">
        <textarea
          ref={inputRef}
          value={raw}
          onChange={(e) => setRaw(e.target.value.slice(0, 600))}
          rows={3}
          placeholder="Type your own question — Thai is fine (พิมพ์ภาษาไทยได้)"
          className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:border-mfu focus:ring-2 focus:ring-mfu/20"
        />
        {(polished || polishing) && (
          <div className={cn("mt-2 rounded-2xl border px-4 py-3 text-sm", useOriginal ? "border-slate-200 bg-slate-50 text-slate-400" : "border-emerald-200 bg-emerald-50 text-emerald-900")}>
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide">
              <span className="flex items-center gap-1 text-emerald-700"><Sparkles className="h-3.5 w-3.5" /> AI Polish (English)</span>
              {polished && (
                <button onClick={() => setUseOriginal((v) => !v)} className="font-medium normal-case text-slate-500 underline">
                  {useOriginal ? "Use polished" : "Send my original"}
                </button>
              )}
            </div>
            {polishing && !polished ? <span className="flex items-center gap-2 text-slate-500"><Wand2 className="h-4 w-4 animate-pulse" /> Polishing…</span> : polished}
          </div>
        )}
        {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
        <Button size="xl" className="mt-3 w-full" disabled={raw.trim().length < 2 || (polishing && !useOriginal)} loading={sending} onClick={() => send(raw.trim(), finalText)}>
          <Send className="h-5 w-5" /> Send
        </Button>
      </div>
    </Sheet>
  );
}
