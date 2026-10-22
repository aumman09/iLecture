"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { MuddiestTopic } from "@/types";

interface Report {
  session: { title: string; code: string; status: string; startedAt: string; course: string };
  summary: { topMuddiestTopics: MuddiestTopic[]; avgComprehension: string | null; mostConfusingSlidePage: number | null } | null;
  attended: number; feedbacks: number;
  ratingDistribution: Record<string, number>;
  paceBySlide: Record<string, { TOO_FAST: number; CLEAR: number; CONFUSED: number }>;
  slides: { page: number; summary: string; category: string }[];
  topQuestions: { polishedContent: string; upvoteCount: number; clusterSize: number; isAnswered: boolean; slidePage: number }[];
}

export function SessionReport({ sessionId }: { sessionId: string }) {
  const [r, setR] = useState<Report | null>(null);
  useEffect(() => {
    setR(null);
    fetch(`/api/analytics/session-summary?sessionId=${sessionId}`).then((x) => x.json()).then(setR);
  }, [sessionId]);
  if (!r) return <Card className="p-10 text-center text-sm text-slate-400">Loading report…</Card>;
  const maxRating = Math.max(1, ...Object.values(r.ratingDistribution));
  const pages = Object.keys(r.paceBySlide).map(Number).sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="text-xs text-slate-500">{r.session.course} · {new Date(r.session.startedAt).toLocaleString()} · PIN {r.session.code}</div>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">{r.session.title}</h2>
        <div className="mt-3 flex flex-wrap gap-6 text-sm">
          <div><span className="font-mono text-xl font-bold">{r.attended}</span> <span className="text-slate-500">attended</span></div>
          <div><span className="font-mono text-xl font-bold">{r.feedbacks}</span> <span className="text-slate-500">exit tickets</span></div>
          <div><span className="font-mono text-xl font-bold">{r.summary?.avgComprehension ? Number(r.summary.avgComprehension).toFixed(2) : "–"}</span> <span className="text-slate-500">avg ★</span></div>
          {r.summary?.mostConfusingSlidePage && <div><span className="font-mono text-xl font-bold text-rose-600">#{r.summary.mostConfusingSlidePage}</span> <span className="text-slate-500">most confusing slide</span></div>}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Top 3 muddiest topics</h3>
          <ol className="mt-3 space-y-2">
            {(r.summary?.topMuddiestTopics ?? []).map((t) => (
              <li key={t.rank} className="rounded-lg border border-slate-200 p-3">
                <div className="flex justify-between text-sm"><span className="font-semibold">{t.rank}. {t.topic}</span><span className="font-mono text-slate-500">{t.percentage}%</span></div>
                <p className="mt-0.5 text-xs text-slate-600">{t.explanation}</p>
                <p className="mt-1 text-xs text-amber-700">Recap ~{t.recommendedRecapMins} min</p>
              </li>
            ))}
            {!r.summary && <li className="text-sm text-slate-400">Summary will appear after the class ends.</li>}
          </ol>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Comprehension distribution</h3>
          <div className="mt-3 space-y-1.5">
            {[5, 4, 3, 2, 1].map((n) => (
              <div key={n} className="flex items-center gap-2 text-xs">
                <span className="w-8 text-slate-500">{n} ★</span>
                <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100"><div className={n >= 4 ? "h-full bg-emerald-500" : n === 3 ? "h-full bg-amber-500" : "h-full bg-rose-500"} style={{ width: `${((r.ratingDistribution[n] ?? 0) / maxRating) * 100}%` }} /></div>
                <span className="w-6 text-right font-mono text-slate-600">{r.ratingDistribution[n] ?? 0}</span>
              </div>
            ))}
          </div>
          {pages.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold text-slate-900">Pace signals per slide</h3>
              <div className="mt-2 space-y-1.5">
                {pages.map((p) => {
                  const v = r.paceBySlide[p];
                  const t = v.CLEAR + v.TOO_FAST + v.CONFUSED || 1;
                  return (
                    <div key={p} className="flex items-center gap-2 text-xs">
                      <span className="w-12 text-slate-500">Slide {p}</span>
                      <div className="flex h-3 flex-1 overflow-hidden rounded bg-slate-100">
                        <div className="bg-emerald-500" style={{ width: `${(v.CLEAR / t) * 100}%` }} />
                        <div className="bg-amber-500" style={{ width: `${(v.TOO_FAST / t) * 100}%` }} />
                        <div className="bg-rose-500" style={{ width: `${(v.CONFUSED / t) * 100}%` }} />
                      </div>
                      <span className="w-6 text-right font-mono text-slate-600">{t}</span>
                    </div>
                  );
                })}
                <div className="flex gap-3 pt-1 text-[11px] text-slate-500"><span>■ <span className="text-emerald-600">clear</span></span><span>■ <span className="text-amber-600">too fast</span></span><span>■ <span className="text-rose-600">confused</span></span></div>
              </div>
            </>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900">Most-voted questions</h3>
        <ul className="mt-3 divide-y divide-slate-100">
          {r.topQuestions.map((q, i) => (
            <li key={i} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex w-10 items-center gap-0.5 font-mono text-slate-600"><ChevronUp className="h-3.5 w-3.5" />{q.upvoteCount}</span>
              <span className="flex-1 text-slate-800">{q.polishedContent}</span>
              <span className="text-xs text-slate-400">slide {q.slidePage}{q.clusterSize > 1 ? ` · ${q.clusterSize} merged` : ""}</span>
              {q.isAnswered && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            </li>
          ))}
          {r.topQuestions.length === 0 && <li className="py-2 text-sm text-slate-400">No questions</li>}
        </ul>
      </Card>
    </div>
  );
}
