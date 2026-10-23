"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, EyeOff, RefreshCw, Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface Row {
  studentId: string; name: string; email: string | null; attended: number; hiddenName: number;
  questions: number; votes: number; paceTaps: number; ideas: number; strokes: number; likes: number;
  exitTickets: number; avgRating: number | null; score: number;
}
interface Resp {
  sessions: { id: string; title: string; startedAt: string }[];
  weights: Record<string, number>;
  totals: { students: number; active: number; silent: number; usedHideName: number; questions: number; ideas: number } | null;
  rows: Row[];
}

const COLS: { key: keyof Row; label: string }[] = [
  { key: "attended", label: "Attended" },
  { key: "questions", label: "Questions" },
  { key: "votes", label: "Votes" },
  { key: "ideas", label: "Ideas / notes" },
  { key: "likes", label: "♥ given" },
  { key: "paceTaps", label: "Pace taps" },
  { key: "exitTickets", label: "Exit tickets" },
  { key: "avgRating", label: "Avg ★" },
  { key: "score", label: "Score" },
];

/** Instructor-only participation analytics — real identities, including posts made with "hide my name". */
export function ParticipationTable({ sectionId }: { sectionId: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<keyof Row>("score");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(null);
    const r = await fetch(`/api/analytics/participation?sectionId=${sectionId}${sessionId ? `&sessionId=${sessionId}` : ""}`);
    const j = await r.json();
    if (!r.ok) return setError(j.error);
    setData(j);
  }, [sectionId, sessionId]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const list = (data?.rows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.studentId.includes(q));
    return [...list].sort((a, b) => (Number(b[sort] ?? -1) - Number(a[sort] ?? -1)) || a.name.localeCompare(b.name));
  }, [data, q, sort]);
  const max = Math.max(1, ...(data?.rows ?? []).map((r) => r.score));
  const t = data?.totals;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Active participants" value={t ? `${t.active} / ${t.students}` : "–"} />
        <Stat label="Attended but silent" value={t?.silent ?? "–"} tone="amber" />
        <Stat label="Questions · Ideas" value={t ? `${t.questions} · ${t.ideas}` : "–"} />
        <Stat label="Used “hide my name”" value={t?.usedHideName ?? "–"} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Participation</h2>
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs">
            <option value="">All sessions</option>
            {data?.sessions.map((s) => <option key={s.id} value={s.id}>{new Date(s.startedAt).toLocaleDateString()} · {s.title}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or ID" className="h-8 w-40 rounded-lg border border-slate-200 pl-7 pr-2 text-xs outline-none focus:border-mfu" />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
            <a href={`/api/analytics/participation?sectionId=${sectionId}${sessionId ? `&sessionId=${sessionId}` : ""}&format=csv`}><Button variant="secondary" size="sm"><Download className="h-3.5 w-3.5" />Export CSV</Button></a>
          </div>
        </div>
        {error && <p className="px-4 py-3 text-sm text-rose-600">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Student</th>
                {COLS.map((c) => (
                  <th key={c.key} className="px-3 py-2.5 font-medium">
                    <button onClick={() => setSort(c.key)} className={cn("uppercase", sort === c.key && "text-mfu")}>{c.label}{sort === c.key ? " ↓" : ""}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!data && !error && <tr><td colSpan={COLS.length + 1} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>}
              {rows.map((r) => (
                <tr key={r.studentId} className={cn(r.attended > 0 && r.score === 0 && "bg-amber-50/50")}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 font-medium text-slate-900">
                      {r.name}
                      {r.hiddenName > 0 && <span title={`Hid their name from classmates in ${r.hiddenName} session(s)`} className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 text-[10px] font-normal text-slate-500"><EyeOff className="h-3 w-3" />{r.hiddenName}</span>}
                    </div>
                    <div className="font-mono text-xs text-slate-500">{r.studentId}</div>
                  </td>
                  {COLS.map((c) =>
                    c.key === "score" ? (
                      <td key={c.key} className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-mfu" style={{ width: `${(r.score / max) * 100}%` }} /></div>
                          <span className="font-mono text-xs font-semibold text-slate-800">{r.score}</span>
                        </div>
                      </td>
                    ) : (
                      <td key={c.key} className={cn("px-3 py-2.5 font-mono text-xs", Number(r[c.key] ?? 0) === 0 ? "text-slate-300" : "text-slate-700")}>{r[c.key] ?? "–"}</td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && (
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            Score = question ×{data.weights.questions} · idea/note ×{data.weights.ideas} · exit ticket ×{data.weights.exitTickets} · vote ×{data.weights.votes} · ♥ ×{data.weights.likes} · pace tap ×{data.weights.paceTaps}.
            Posts made with “hide my name” are counted here — classmates and the projector never saw the name.
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "amber" }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn("mt-1 font-mono text-2xl font-bold", tone === "amber" ? "text-amber-600" : "text-slate-900")}>{value}</div>
    </Card>
  );
}
