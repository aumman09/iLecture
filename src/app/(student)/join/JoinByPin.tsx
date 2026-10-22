"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { ArrowRight, Delete, LogOut, QrCode, Radio } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function JoinByPin({ name, liveClasses }: { name: string; liveClasses: { code: string; title: string; course: string; status: string }[] }) {
  const router = useRouter();
  const [letters, setLetters] = useState("");
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const go = (code: string) => { setBusy(true); router.push(`/join/${code.toUpperCase()}`); };
  const full = letters.length === 3 && digits.length === 3;

  return (
    <main className="min-h-dvh-screen bg-slate-50 pt-safe pb-safe">
      <header className="flex items-center justify-between px-5 py-4">
        <Logo />
        <button onClick={() => signOut({ callbackUrl: "/login" })} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"><LogOut className="h-3.5 w-3.5" /> Sign out</button>
      </header>
      <div className="mx-auto max-w-md px-5">
        <p className="text-sm text-slate-500">Hi, {name.split(" ")[0]} 👋</p>

        {liveClasses.length > 0 && (
          <div className="mt-4 space-y-3">
            {liveClasses.map((c) => (
              <button key={c.code} onClick={() => go(c.code)} className="group flex w-full items-center gap-4 rounded-2xl bg-mfu p-5 text-left text-white shadow-lg active:scale-[0.99]">
                <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Radio className="h-6 w-6" />
                  <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-emerald-400 ring-2 ring-mfu" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium uppercase tracking-wide text-white/70">{c.status === "LIVE" ? "Live now" : "Exit ticket open"} · {c.code}</span>
                  <span className="block truncate text-lg font-semibold">{c.title}</span>
                  <span className="block truncate text-sm text-white/80">{c.course}</span>
                </span>
                <ArrowRight className="h-6 w-6 shrink-0 transition-transform group-active:translate-x-1" />
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><QrCode className="h-4 w-4 text-mfu" /> Scan the QR on the screen — or type the room PIN</div>
          <div className="mt-4">
            <input
              aria-label="Room letters"
              value={letters}
              onChange={(e) => setLetters(e.target.value.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 3))}
              placeholder="LEC"
              autoCapitalize="characters"
              autoComplete="off"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 text-center font-mono text-3xl tracking-[0.3em] text-slate-900 outline-none focus:border-mfu focus:ring-2 focus:ring-mfu/20"
            />
            <div className="mt-3 flex justify-center gap-2 font-mono text-3xl">
              {[0, 1, 2].map((i) => (
                <span key={i} className="flex h-14 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">{digits[i] ?? ""}</span>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {KEYS.map((k) => (
                <button key={k} onClick={() => setDigits((d) => (d + k).slice(0, 3))} className="h-14 rounded-xl bg-slate-100 text-2xl font-semibold text-slate-800 active:bg-slate-200">{k}</button>
              ))}
              <button onClick={() => setDigits((d) => d.slice(0, -1))} className="flex h-14 items-center justify-center rounded-xl bg-slate-100 active:bg-slate-200" aria-label="Delete"><Delete className="h-6 w-6 text-slate-600" /></button>
              <button onClick={() => setDigits((d) => (d + "0").slice(0, 3))} className="h-14 rounded-xl bg-slate-100 text-2xl font-semibold text-slate-800 active:bg-slate-200">0</button>
              <Button size="xl" className="h-14" disabled={!full} loading={busy} onClick={() => go(letters + digits)}>Join</Button>
            </div>
          </div>
        </div>
        <p className="mt-4 pb-6 text-center text-xs text-slate-400">Tip: add iLecture to your Home Screen for instant access.</p>
      </div>
    </main>
  );
}
