"use client";
import { useCallback, useEffect, useState } from "react";
import { CloudUpload, Download, Lightbulb, ThumbsUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface EvalPayload {
  totalSessionsHeld: number; clarityIndex: number; responsivenessIndex: number; emiDeliveryScore: number;
  topStrengths: string[]; actionableImprovements: string[];
  sessions: { date: string; title: string; attended: number; exitTickets: number; avgComprehension: number | null }[];
}

/** Module F — Continuous Teaching Evaluation + 1-click sync to MFU Central Eval + TQF 5 export. */
export function EvalSummary({ sectionId }: { sectionId: string }) {
  const [data, setData] = useState<EvalPayload | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setData(null);
    const r = await fetch(`/api/analytics/evaluation-export?sectionId=${sectionId}&format=json`);
    if (r.ok) setData(await r.json());
  }, [sectionId]);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    const r = await fetch("/api/analytics/evaluation-export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionId }) });
    const j = await r.json();
    setSyncing(false);
    setMsg({ ok: !!j.synced, text: j.syncMessage ?? j.error ?? "Done" });
    if (j.payload) setData(j.payload);
  };

  const maxComp = 5;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Sessions held" value={data ? String(data.totalSessionsHeld) : "–"} />
        <Kpi label="Clarity Index" value={data ? data.clarityIndex.toFixed(2) : "–"} suffix="/ 5" good={data ? data.clarityIndex >= 4 : undefined} />
        <Kpi label="Responsiveness" value={data ? data.responsivenessIndex.toFixed(0) : "–"} suffix="%" good={data ? data.responsivenessIndex >= 80 : undefined} />
        <Kpi label="EMI Delivery" value={data ? data.emiDeliveryScore.toFixed(2) : "–"} suffix="/ 5" good={data ? data.emiDeliveryScore >= 3.75 : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Comprehension per session</h3>
          <div className="mt-4 flex h-48 items-end gap-2">
            {data?.sessions.map((s) => (
              <div key={s.date + s.title} className="flex flex-1 flex-col items-center gap-1" title={`${s.title}: ${s.avgComprehension ?? "–"}`}>
                <span className="font-mono text-[11px] text-slate-500">{s.avgComprehension?.toFixed(1) ?? "–"}</span>
                <div className={cn("w-full max-w-[44px] rounded-t-md", (s.avgComprehension ?? 0) >= 4 ? "bg-emerald-500" : (s.avgComprehension ?? 0) >= 3 ? "bg-amber-500" : "bg-rose-500")} style={{ height: `${((s.avgComprehension ?? 0) / maxComp) * 160}px` }} />
                <span className="w-full truncate text-center text-[10px] text-slate-400">{s.date.slice(5)}</span>
              </div>
            ))}
            {data && data.sessions.length === 0 && <p className="m-auto text-sm text-slate-400">No finished sessions yet</p>}
          </div>
        </Card>

        <Card className="flex flex-col p-5">
          <h3 className="text-sm font-semibold text-slate-900">TQF 5 (มคอ.5) / AUN-QA export</h3>
          <p className="mt-1 text-xs text-slate-500">Evidence for AUN-QA Criterion 2 & 3. No student identities are included.</p>
          <div className="mt-4 space-y-2">
            <Button className="w-full" loading={syncing} onClick={sync}><CloudUpload className="h-4 w-4" />Sync to MFU Central Evaluation</Button>
            <a href={`/api/analytics/evaluation-export?sectionId=${sectionId}&format=pdf`} className="block"><Button variant="secondary" className="w-full"><Download className="h-4 w-4" />Download TQF 5 appendix (PDF)</Button></a>
          </div>
          {msg && <p className={cn("mt-3 rounded-lg px-3 py-2 text-xs", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>{msg.text}</p>}
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><ThumbsUp className="h-4 w-4" />Strengths</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {data?.topStrengths.map((s) => <li key={s} className="rounded-lg bg-emerald-50 px-3 py-2">{s}</li>)}
            {data && data.topStrengths.length === 0 && <li className="text-slate-400">Not enough data yet</li>}
          </ul>
        </Card>
        <Card className="p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-700"><Lightbulb className="h-4 w-4" />Actionable improvements</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {data?.actionableImprovements.map((s) => <li key={s} className="rounded-lg bg-amber-50 px-3 py-2">{s}</li>)}
            {data && data.actionableImprovements.length === 0 && <li className="text-slate-400">None identified 🎉</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, suffix, good }: { label: string; value: string; suffix?: string; good?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={cn("font-mono text-2xl font-bold", good === undefined ? "text-slate-900" : good ? "text-emerald-600" : "text-amber-600")}>{value}</span>
        {suffix && <span className="text-sm text-slate-400">{suffix}</span>}
      </div>
    </Card>
  );
}
