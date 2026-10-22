"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Lock, Mail, RefreshCw, Send } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { RiskRow } from "@/types";

const levelTone = { CRITICAL: "red", MODERATE: "amber", LOW: "green" } as const;

/** Early-warning table. Identities are pseudonymised except for CRITICAL students (privacy guard). */
export function RetentionTable({ sectionId, isAdvisor }: { sectionId: string; isAdvisor?: boolean }) {
  const [rows, setRows] = useState<RiskRow[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; critical: number; moderate: number; low: number; lastEvaluatedAt: string | null } | null>(null);
  const [filter, setFilter] = useState<"ALL" | "CRITICAL" | "MODERATE">("ALL");
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const r = await fetch(`/api/analytics/retention?sectionId=${sectionId}`);
    const j = await r.json();
    if (!r.ok) return setError(j.error);
    setRows(j.rows);
    setSummary(j.summary);
  }, [sectionId]);
  useEffect(() => { load(); }, [load]);

  const intervene = async (row: RiskRow) => {
    setSending(row.studentId);
    const r = await fetch("/api/analytics/retention/intervene", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionId, studentId: row.studentId }) });
    const j = await r.json();
    setSending(null);
    if (!r.ok) return setError(j.error);
    window.location.href = j.mailto;
    setRows((rs) => rs?.map((x) => (x.studentId === row.studentId ? { ...x, interventionSentAt: new Date().toISOString() } : x)) ?? null);
  };

  const shown = rows?.filter((r) => filter === "ALL" || r.riskLevel === filter) ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Students tracked" value={summary?.total ?? "–"} />
        <Stat label="Critical (≥70)" value={summary?.critical ?? "–"} tone="red" />
        <Stat label="Moderate (40–69)" value={summary?.moderate ?? "–"} tone="amber" />
        <Stat label="Low (<40)" value={summary?.low ?? "–"} tone="green" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Early Warning — Retention Risk</h2>
          <span className="text-xs text-slate-400">RiskScore = 0.25·Attendance + 0.20·Engagement + 0.30·Comprehension + 0.25·Momentum</span>
          <div className="ml-auto flex items-center gap-1">
            {(["ALL", "CRITICAL", "MODERATE"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={cn("rounded-lg px-2.5 py-1 text-xs font-medium", filter === f ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}>{f === "ALL" ? "All" : f.toLowerCase()}</button>
            ))}
            <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
        {error && <p className="px-4 py-3 text-sm text-rose-600">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Student</th>
                <th className="px-3 py-2.5 font-medium">Risk</th>
                <th className="px-3 py-2.5 font-medium">Attendance</th>
                <th className="px-3 py-2.5 font-medium">Engagement</th>
                <th className="px-3 py-2.5 font-medium">Avg ★</th>
                <th className="px-3 py-2.5 font-medium">Low streak</th>
                <th className="px-3 py-2.5 font-medium">🤔 signals</th>
                <th className="px-4 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!rows && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>}
              {rows && shown.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No students in this group 🎉</td></tr>}
              {shown.map((r) => (
                <tr key={r.studentId} className={cn(r.riskLevel === "CRITICAL" && "bg-rose-50/60")}>
                  <td className="px-4 py-3">
                    {r.isUnlocked ? (
                      <div>
                        <div className="font-medium text-slate-900">{r.displayName}</div>
                        <div className="font-mono text-xs text-slate-500">{r.studentId}{r.advisorEmail && <span className="font-sans"> · advisor {r.advisorEmail}</span>}</div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-slate-500"><Lock className="h-3.5 w-3.5" /><span className="font-mono text-xs">{r.displayName}</span></div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Badge tone={levelTone[r.riskLevel]}>{r.riskLevel === "CRITICAL" && <AlertTriangle className="h-3 w-3" />}{r.riskLevel}</Badge>
                      <span className="font-mono text-xs text-slate-600">{r.riskScore.toFixed(1)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3"><Meter value={r.attendanceRate} /></td>
                  <td className="px-3 py-3"><Meter value={r.engagementRate} /></td>
                  <td className="px-3 py-3 font-mono">{r.avgComprehensionRating.toFixed(2)}</td>
                  <td className="px-3 py-3 font-mono">{r.consecutiveLowRatings}</td>
                  <td className="px-3 py-3 font-mono">{r.confusionSignalCount}</td>
                  <td className="px-4 py-3 text-right">
                    {r.riskLevel === "CRITICAL" || (isAdvisor && r.isUnlocked) ? (
                      r.interventionSentAt ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Mail className="h-3.5 w-3.5" />Sent {new Date(r.interventionSentAt).toLocaleDateString()}</span>
                      ) : (
                        <Button size="sm" loading={sending === r.studentId} onClick={() => intervene(r)}><Send className="h-3.5 w-3.5" />Notify student &amp; advisor</Button>
                      )
                    ) : (
                      <span className="text-xs text-slate-400">Monitoring</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {summary?.lastEvaluatedAt && <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">Recalculated automatically after each class · last {new Date(summary.lastEvaluatedAt).toLocaleString()}</div>}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "red" | "amber" | "green" }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn("mt-1 font-mono text-2xl font-bold", tone === "red" ? "text-rose-600" : tone === "amber" ? "text-amber-600" : tone === "green" ? "text-emerald-600" : "text-slate-900")}>{value}</div>
    </Card>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full", value < 60 ? "bg-rose-500" : value < 80 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="font-mono text-xs text-slate-600">{value.toFixed(0)}%</span>
    </div>
  );
}
