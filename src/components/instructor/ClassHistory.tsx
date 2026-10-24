"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, History, Lightbulb, MessagesSquare, Radio, Search, Star, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import type { SessionVM } from "./Dashboard";

const WEEK = 7 * 86400000;

/** Every class of this course section, grouped by teaching week (week 1 = week of the first class). */
export function ClassHistory({ sessions }: { sessions: SessionVM[] }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    if (sessions.length === 0) return [];
    const sorted = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    // week boundaries start on the Monday of the first class
    const first = new Date(sorted[0].startedAt);
    const monday = new Date(first.getFullYear(), first.getMonth(), first.getDate() - ((first.getDay() + 6) % 7));
    const byWeek = new Map<number, SessionVM[]>();
    for (const s of sorted) {
      const w = Math.floor((new Date(s.startedAt).getTime() - monday.getTime()) / WEEK) + 1;
      if (!byWeek.has(w)) byWeek.set(w, []);
      byWeek.get(w)!.push(s);
    }
    const needle = q.trim().toLowerCase();
    return [...byWeek.entries()]
      .map(([week, list]) => ({
        week,
        from: new Date(monday.getTime() + (week - 1) * WEEK),
        list: list.filter((s) => !needle || s.title.toLowerCase().includes(needle) || (s.topTopic ?? "").toLowerCase().includes(needle)).reverse(),
      }))
      .filter((g) => g.list.length > 0)
      .sort((a, b) => b.week - a.week);
  }, [sessions, q]);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><History className="h-4 w-4 text-mfu" />Class history · ประวัติการสอน</h2>
        <span className="text-sm text-slate-500">{sessions.length} classes</span>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or topic" className="h-9 w-56 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-mfu" />
        </div>
      </div>
      {groups.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">{sessions.length ? "No class matches your search." : "No classes yet — start your first live class above."}</Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.week}>
              <div className="mb-1.5 flex items-baseline gap-2 px-1">
                <span className="text-sm font-semibold text-slate-800">Week {g.week}</span>
                <span className="text-xs text-slate-400">{g.from.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – {new Date(g.from.getTime() + 6 * 86400000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
              <Card className="divide-y divide-slate-100">
                {g.list.map((s) => {
                  const d = new Date(s.startedAt);
                  const live = s.status !== "ENDED";
                  return (
                    <Link key={s.id} href={live ? `/live/${s.id}` : `/dashboard/history/${s.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50">
                      <div className="w-14 shrink-0 text-center">
                        <div className="text-[11px] font-medium uppercase text-slate-400">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                        <div className="text-lg font-semibold leading-tight text-slate-900">{d.getDate()}</div>
                        <div className="text-[11px] text-slate-400">{d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-slate-900">{s.title}</span>
                          {live && <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"><Radio className="h-3 w-3" />{s.status === "LIVE" ? "Live" : "Exit ticket"}</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{s.attended}</span>
                          <span className="flex items-center gap-1"><MessagesSquare className="h-3.5 w-3.5" />{s.questions}</span>
                          <span className="flex items-center gap-1"><Lightbulb className="h-3.5 w-3.5" />{s.ideas ?? 0}</span>
                          <span className={cn("flex items-center gap-1", s.avgComprehension !== null && s.avgComprehension < 3 && "font-semibold text-rose-600")}><Star className="h-3.5 w-3.5" />{s.avgComprehension?.toFixed(2) ?? "–"}</span>
                          {s.topTopic && <span className="truncate">Muddiest: <span className="text-slate-700">{s.topTopic}</span></span>}
                        </div>
                      </div>
                      <span className="hidden shrink-0 text-xs font-medium text-mfu sm:block">{live ? "Resume" : "Open record"}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </Link>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
