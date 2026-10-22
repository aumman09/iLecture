"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, BarChart3, Expand, FileText, Info, Minimize, QrCode, Radio, Users, WifiOff } from "lucide-react";
import { useLiveSession } from "@/lib/use-live-session";
import { Toasts, useToasts } from "@/components/ui/Toast";
import { Logo } from "@/components/ui/Logo";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { FloatingDock } from "./FloatingDock";
import { QADrawer } from "./QADrawer";
import { SlideViewer } from "./SlideViewer";
import { ClassBoardCanvas } from "./ClassBoardCanvas";
import type { MuddiestTopic } from "@/types";

/** ZERO-CLICK TEACHING CONSOLE — slides + board + dock, nothing else. */
export function LiveConsole({ sessionCode, joinUrl, sessionId }: { sessionCode: string; joinUrl: string; sessionId: string }) {
  const { toasts, push } = useToasts(3500);
  const [qaOpen, setQaOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const silentRef = useRef(true);

  const live = useLiveSession(sessionCode, {
    onQuestionIncoming: (q) => {
      // Silent Focus Mode: only bump the dock badge — no toast, no sound.
      setUnseen((n) => n + 1);
      if (!silentRef.current && !q.clustered && q.polishedContent) push({ title: `New question · slide ${q.slidePage}`, body: q.polishedContent });
    },
  });
  const { state, questions, strokes, stickies, pace, actions, connected, exitProgress, summaryReady, exitClosesAt } = live;
  silentRef.current = state?.isSilentMode ?? true;

  const openQA = useCallback(() => { setQaOpen(true); setUnseen(0); }, []);
  const total = state?.totalPages ?? 1;
  const page = state?.currentSlidePage ?? 1;

  // keyboard + presentation clicker support
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (!state || state.status !== "LIVE") return;
      if (["ArrowRight", "PageDown", " ", "ArrowDown"].includes(e.key)) { e.preventDefault(); actions.gotoSlide(page + 1); }
      else if (["ArrowLeft", "PageUp", "ArrowUp"].includes(e.key)) { e.preventDefault(); actions.gotoSlide(page - 1); }
      else if (e.key.toLowerCase() === "b") actions.toggleBoard(!state.isBoardActive);
      else if (e.key.toLowerCase() === "q") (qaOpen ? setQaOpen(false) : openQA());
      else if (e.key.toLowerCase() === "s") actions.setSilent(!state.isSilentMode);
      else if (e.key.toLowerCase() === "f") toggleFullscreen();
      else if (e.key === "Escape") setQaOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => undefined);
    else document.exitFullscreen?.();
  };
  useEffect(() => {
    const f = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  if (live.error && !state)
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-100">
        <p className="text-slate-700">{live.error}</p>
        <Link href="/dashboard" className="text-mfu underline">Back to dashboard</Link>
      </div>
    );
  if (!state) return <div className="flex h-screen items-center justify-center bg-slate-100"><div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-mfu" /></div>;

  const slideUrl = state.slideDeckId ? `/api/slides/${state.slideDeckId}/file` : null;
  const openQs = questions.filter((q) => !q.isAnswered).length;
  const confusedHot = pace && pace.total >= 5 && pace.confusedPct >= 30;

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      {!state.isSilentMode && <Toasts toasts={toasts} position="top-right" />}

      {/* Minimal top header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <Link href="/dashboard" className="flex items-center gap-2" title="Dashboard"><ArrowLeft className="h-4 w-4 text-slate-400" /><Logo /></Link>
        <span className="h-6 w-px bg-slate-200" />
        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-mfu" />
          <span className="font-mono font-semibold text-slate-700">{state.courseCode}</span>
          <span className="truncate text-slate-600">{state.slideDeckTitle ?? state.sessionTitle}</span>
        </div>
        <button onClick={() => setShowMeta((v) => !v)} className={cn("rounded-lg p-1.5 text-slate-400 hover:bg-slate-100", showMeta && "text-mfu")} title="AI slide insight"><Info className="h-4 w-4" /></button>
        <div className="ml-auto flex items-center gap-2">
          {confusedHot && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">🤔 {pace!.confusedPct}% confused</span>}
          <button onClick={() => setQrOpen(true)} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50">
            <QrCode className="h-4 w-4 text-slate-500" />
            <span className="font-mono text-sm font-bold tracking-wider text-slate-900">PIN: {state.sessionCode}</span>
          </button>
          <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold", connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
            {connected ? <Radio className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {state.status === "LIVE" ? "LIVE" : state.status === "EXIT_TICKET" ? "EXIT TICKET" : "ENDED"}: <Users className="h-3.5 w-3.5" />{state.activeCount} Active
          </span>
          <button onClick={toggleFullscreen} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Full screen (F)">{fullscreen ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}</button>
        </div>
      </header>

      {/* Main stage */}
      <main className="relative min-h-0 flex-1 p-4 pb-24">
        {state.isBoardActive ? (
          <ClassBoardCanvas
            slideUrl={slideUrl}
            page={page}
            strokes={strokes}
            stickies={stickies}
            frozen={state.isBoardFrozen}
            onStroke={(s) => actions.drawStroke(s)}
            onFreeze={(f) => actions.toggleBoard(true, f)}
            onClear={() => actions.clearBoard()}
            onUndo={() => actions.undo()}
          />
        ) : (
          <SlideViewer url={slideUrl} page={page} metadata={state.metadata} showMeta={showMeta} />
        )}

        {state.status !== "LIVE" && (
          <PostClassPanel
            sessionId={sessionId}
            status={state.status}
            progress={exitProgress}
            closesAt={exitClosesAt}
            summaryReady={summaryReady}
            onFinalize={() => actions.finalizeNow()}
          />
        )}

        <FloatingDock
          page={page}
          total={total}
          onPrev={() => actions.gotoSlide(page - 1)}
          onNext={() => actions.gotoSlide(page + 1)}
          boardActive={state.isBoardActive}
          onToggleBoard={() => actions.toggleBoard(!state.isBoardActive)}
          silent={state.isSilentMode}
          onToggleSilent={() => actions.setSilent(!state.isSilentMode)}
          qaCount={unseen > 0 ? unseen : 0}
          onOpenQA={openQA}
          onEnd={() => setEndOpen(true)}
          disabled={state.status !== "LIVE"}
        />
      </main>

      <QADrawer
        open={qaOpen}
        onClose={() => setQaOpen(false)}
        questions={questions}
        currentPage={page}
        pace={pace}
        onResolve={(id, a) => actions.resolveQuestion(id, a)}
        onPin={(id, p) => actions.pinQuestion(id, p)}
        onGoto={(p) => actions.gotoSlide(p)}
      />

      <Modal open={qrOpen} onClose={() => setQrOpen(false)} className="max-w-2xl">
        <div className="flex flex-col items-center gap-6 py-4 text-center md:flex-row md:text-left">
          <div className="rounded-2xl border border-slate-200 bg-white p-4"><QRCodeSVG value={joinUrl} size={280} level="M" /></div>
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-slate-500">Scan to join</div>
            <div className="mt-1 font-mono text-6xl font-bold tracking-wider text-slate-900">{state.sessionCode}</div>
            <div className="mt-3 break-all text-sm text-slate-500">{joinUrl}</div>
            <div className="mt-4 text-sm text-slate-600">{state.activeCount} students connected · {openQs} open questions</div>
          </div>
        </div>
      </Modal>

      <Modal open={endOpen} onClose={() => setEndOpen(false)} title="End class?">
        <p className="text-sm text-slate-600">Every student phone will show a 20-second exit ticket (★ rating + muddiest point). Results and early-warning scores are calculated automatically.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEndOpen(false)}>Keep teaching</Button>
          <Button onClick={async () => { setEndOpen(false); const r = await actions.endClass(); if (!r.ok) push({ title: "Could not end class", body: r.error, tone: "error" }); }}>End class &amp; send exit ticket</Button>
        </div>
      </Modal>
    </div>
  );
}

function PostClassPanel({ sessionId, status, progress, closesAt, summaryReady, onFinalize }: {
  sessionId: string; status: string; progress: { submitted: number; attended: number } | null; closesAt: number | null; summaryReady: boolean; onFinalize: () => void;
}) {
  const [left, setLeft] = useState<number | null>(null);
  const [summary, setSummary] = useState<{ topMuddiestTopics: MuddiestTopic[]; avgComprehension: string | null; mostConfusingSlidePage: number | null } | null>(null);
  const [counts, setCounts] = useState<{ attended: number; feedbacks: number } | null>(null);
  useEffect(() => {
    if (!closesAt) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((closesAt - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [closesAt]);
  useEffect(() => {
    if (!(summaryReady || status === "ENDED")) return;
    let tries = 0;
    const load = async () => {
      const r = await fetch(`/api/analytics/session-summary?sessionId=${sessionId}`);
      const j = await r.json();
      if (j.summary) { setSummary(j.summary); setCounts({ attended: j.attended, feedbacks: j.feedbacks }); }
      else if (tries++ < 10) setTimeout(load, 1500);
    };
    load();
  }, [summaryReady, status, sessionId]);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-7 shadow-2xl">
        {!summary ? (
          <>
            <div className="text-xs font-semibold uppercase tracking-wide text-mfu">Exit ticket in progress</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Collecting the muddiest points…</h2>
            <div className="mt-6 flex items-end gap-3">
              <span className="font-mono text-6xl font-bold text-slate-900">{progress?.submitted ?? 0}</span>
              <span className="pb-2 text-lg text-slate-500">/ {progress?.attended ?? "–"} students responded</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress?.attended ? (progress.submitted / progress.attended) * 100 : 0}%` }} />
            </div>
            <div className="mt-6 flex items-center justify-between">
              <span className="text-sm text-slate-500">{left !== null && left > 0 ? `Auto-closes in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "Analysing…"}</span>
              <Button onClick={onFinalize} variant="dark">Close now &amp; analyse</Button>
            </div>
          </>
        ) : (
          <>
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Class complete</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Top muddiest points</h2>
            <p className="mt-1 text-sm text-slate-500">
              {counts?.feedbacks ?? 0} of {counts?.attended ?? 0} students · comprehension {summary.avgComprehension ? Number(summary.avgComprehension).toFixed(2) : "–"}/5
              {summary.mostConfusingSlidePage ? ` · most confusing: slide ${summary.mostConfusingSlidePage}` : ""}
            </p>
            <ol className="mt-5 space-y-3">
              {summary.topMuddiestTopics.length === 0 && <li className="text-sm text-slate-500">No muddy points reported 🎉</li>}
              {summary.topMuddiestTopics.map((t) => (
                <li key={t.rank} className="flex gap-4 rounded-xl border border-slate-200 p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mfu text-sm font-bold text-white">{t.rank}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2"><span className="font-semibold text-slate-900">{t.topic}</span><span className="font-mono text-sm text-slate-500">{t.percentage}%</span></div>
                    <p className="mt-0.5 text-sm text-slate-600">{t.explanation}</p>
                    <p className="mt-1 text-xs font-medium text-amber-700">Recap next class: ~{t.recommendedRecapMins} min</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex justify-end gap-2">
              <Link href={`/dashboard?tab=reports&session=${sessionId}`}><Button variant="secondary"><BarChart3 className="h-4 w-4" /> Full report</Button></Link>
              <Link href="/dashboard"><Button>Back to dashboard</Button></Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
