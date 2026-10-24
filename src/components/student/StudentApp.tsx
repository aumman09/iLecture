"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Maximize2, MessageCircleQuestion, Radio, WifiOff, X } from "lucide-react";
import { useLiveSession } from "@/lib/use-live-session";
import { PdfSlide } from "@/components/shared/PdfSlide";
import { Toasts, useToasts } from "@/components/ui/Toast";
import { Logo } from "@/components/ui/Logo";
import { PaceBar } from "./PaceBar";
import { LiveQuestionFeed } from "./LiveQuestionFeed";
import { QuestionForm, type AskResult } from "./QuestionForm";
import { StudentBoardPad } from "./StudentBoardPad";
import { StudentIdeaBoard } from "./StudentIdeaBoard";
import { AuthorTag, HideNameToggle } from "./Identity";
import { ExitTicketModal } from "./ExitTicketModal";
import type { PaceSignal, QuestionDTO, SlideMetadataDTO } from "@/types";

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    const req = async () => {
      try { lock = await (navigator as unknown as { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen"); } catch { /* ignore */ }
    };
    req();
    const vis = () => document.visibilityState === "visible" && req();
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); lock?.release().catch(() => undefined); };
  }, [active]);
}

/**
 * Student mobile / iPad app. Zero-config: the slide follows the instructor, the board and the
 * exit ticket open by themselves. The only things a student ever taps are Pace, Vote and Ask.
 */
export function StudentApp({ sessionCode, studentName, slides }: { sessionCode: string; studentName: string; slides: SlideMetadataDTO[] }) {
  const { toasts, push } = useToasts(3000);
  const [askOpen, setAskOpen] = useState(false);
  const [browsePage, setBrowsePage] = useState<number | null>(null);
  const [zoom, setZoom] = useState(false);
  const confusedRef = useRef<Set<number>>(new Set());

  const live = useLiveSession(sessionCode, {
    onBoardToggled: (active) => { if (active) { navigator.vibrate?.(30); push({ title: "Class Board is open ✏️", body: "Share your ideas with the class." }); } },
    onSlideChanged: () => setBrowsePage(null),
    onExitTicket: () => navigator.vibrate?.([30, 60, 30]),
  });
  const { state, questions, strokes, stickies, actions, connected, error } = live;
  useWakeLock(state?.status === "LIVE");

  // remember slides this student marked "Confused" → pre-selected in the exit ticket
  const storageKey = `ilecture:confused:${sessionCode}`;
  useEffect(() => {
    try { (JSON.parse(localStorage.getItem(storageKey) || "[]") as number[]).forEach((p) => confusedRef.current.add(p)); } catch { /* ignore */ }
  }, [storageKey]);

  const slideMap = useMemo(() => Object.fromEntries(slides.map((s) => [s.pageNumber, s])), [slides]);
  const slideUrl = state?.slideDeckId ? `/api/slides/${state.slideDeckId}/file` : null;
  const livePage = state?.currentSlidePage ?? 1;
  const shownPage = browsePage ?? livePage;

  const pace = useCallback(async (v: PaceSignal | null) => {
    if (v === "CONFUSED") confusedRef.current.add(livePage); else confusedRef.current.delete(livePage);
    try { localStorage.setItem(storageKey, JSON.stringify([...confusedRef.current])); } catch { /* ignore */ }
    const r = await actions.sendPace(v);
    if (!r.ok) push({ title: "Not sent", body: r.error, tone: "error" });
  }, [actions, livePage, storageKey, push]);

  const ask = async (raw: string, polished: string): Promise<AskResult> => {
    const r = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: state!.sessionId, slidePage: livePage, rawContent: raw, polishedContent: polished }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) return { ok: false, reason: j.reason, error: j.error };
    if (j.status === "new") {
      actions.addLocalQuestion(j.question as QuestionDTO);
      push({ title: "Question posted ✅", body: state!.isAnonymous ? "Posted anonymously — classmates can't see your name." : `Posted as ${state!.myDisplayName}`, tone: "success" });
    } else if (j.status === "clustered") {
      actions.markVoted(j.parentQuestionId);
      push({ title: "Someone asked this already 🙌", body: `We added your vote to: “${j.parentContent}”`, tone: "success" });
    }
    navigator.vibrate?.(20);
    return { ok: true, status: j.status };
  };

  const setAnon = async (v: boolean) => {
    const r = await actions.setAnonymous(v);
    if (!r.ok) push({ title: r.error ?? "Could not change", tone: "error" });
    else push({ title: v ? "Your name is hidden 🕶️" : "Your name is visible 👋", body: v ? "Classmates and the screen see you as Anonymous." : `Classmates see you as ${r.displayName}.` });
  };

  const vote = (q: QuestionDTO) => {
    if (q.mine) return push({ title: "That's your question 🙂" });
    actions.upvote(q.id, !!q.votedByMe);
  };

  // ── states ──────────────────────────────────────────────────────────────
  if (error && !state)
    return (
      <Center>
        <p className="text-lg font-semibold">{error}</p>
        <Link href="/join" className="mt-4 text-mfu underline">Back</Link>
      </Center>
    );
  if (!state)
    return (
      <Center>
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-mfu" />
        <p className="mt-4 text-sm text-slate-500">Joining {sessionCode}…</p>
      </Center>
    );

  if (state.status === "ENDED")
    return (
      <Center>
        <div className="text-5xl">👋</div>
        <h1 className="mt-3 text-xl font-semibold">Class has ended</h1>
        <p className="mt-1 text-sm text-slate-500">{state.sessionTitle}</p>
        {state.exitTicketSubmitted && <p className="mt-3 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-700">Exit ticket submitted — thank you!</p>}
        <Link href="/join" className="mt-6 rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white">Done</Link>
      </Center>
    );

  const showExit = state.status === "EXIT_TICKET" && !state.exitTicketSubmitted;
  if (state.status === "EXIT_TICKET" && state.exitTicketSubmitted)
    return (
      <Center>
        <div className="text-5xl">🎉</div>
        <h1 className="mt-3 text-xl font-semibold">Thanks, {studentName.split(" ")[0]}!</h1>
        <p className="mt-1 text-sm text-slate-500">Your exit ticket was received.</p>
      </Center>
    );

  const meta = slideMap[livePage] ?? state.metadata ?? undefined;

  return (
    <div className="h-dvh-screen flex flex-col bg-slate-50 pt-safe">
      <Toasts toasts={toasts} position="top-center" />

      {/* header */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3">
        <Logo compact />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold text-slate-900">{state.courseCode} · {state.sessionTitle}</div>
          <div className="flex items-center gap-1 truncate text-[11px] text-slate-500">You appear as <AuthorTag name={state.myDisplayName ?? ""} isAnonymous={state.isAnonymous} className="font-medium text-slate-700" /></div>
        </div>
        {connected ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700"><Radio className="h-3 w-3" />LIVE</span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700"><WifiOff className="h-3 w-3" />Reconnecting</span>
        )}
      </header>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-white/80 px-3 py-1.5">
        <HideNameToggle value={!!state.isAnonymous} onChange={setAnon} compact />
        {state.isAnonymous && <span className="truncate text-[10px] text-slate-400">Hidden from classmates · your instructor still sees your participation</span>}
      </div>

      {state.isBoardActive && state.boardMode === "IDEAS" ? (
        <div className="min-h-0 flex-1">
          <StudentIdeaBoard
            prompt={state.boardPrompt}
            notes={stickies}
            strokes={strokes}
            frozen={state.isBoardFrozen}
            onStroke={(st) => actions.drawStroke(st).then((r) => { if (!r.ok) push({ title: r.error ?? "Not sent", tone: "error" }); })}
            onUndo={() => actions.undo()}
            onMove={(id, x, y) => actions.moveNote(id, x, y).then((r) => { if (!r.ok) push({ title: r.error ?? "Not moved", tone: "error" }); })}
            onPost={async (text, color, at) => {
              const r = await actions.addSticky(text, color, at);
              if (!r.ok) push({ title: r.error ?? "Not posted", tone: "error" });
              return r.ok;
            }}
            onLike={(id, remove) => actions.likeNote(id, remove)}
            onDelete={(id) => actions.deleteNote(id)}
            anonymous={!!state.isAnonymous}
            onAnonymous={setAnon}
          />
        </div>
      ) : state.isBoardActive ? (
        <div className="min-h-0 flex-1">
          <StudentBoardPad
            slideUrl={slideUrl}
            page={livePage}
            strokes={strokes}
            stickies={stickies}
            frozen={state.isBoardFrozen}
            onStroke={(s) => actions.drawStroke(s).then((r) => { if (!r.ok) push({ title: r.error ?? "Not sent", tone: "error" }); })}
            onUndo={() => actions.undo()}
            onSticky={async (text, color) => {
              const r = await actions.addSticky(text, color);
              if (!r.ok) push({ title: r.error ?? "Not posted", tone: "error" });
              else push({ title: "Posted to the board 📌", tone: "success" });
              return r.ok;
            }}
            anonymous={!!state.isAnonymous}
            onAnonymous={setAnon}
          />
        </div>
      ) : (
        <>
          {/* content: phone = stacked, iPad landscape = 2 columns */}
          <main className="min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-[1fr_minmax(320px,380px)] md:overflow-hidden landscape:md:grid-cols-[1fr_minmax(320px,400px)]">
            <section className="relative p-3 md:flex md:min-h-0 md:flex-col md:p-4 md:pb-40">
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 md:aspect-auto md:min-h-0 md:flex-1">
                <PdfSlide url={slideUrl} page={shownPage} priority />
                <button onClick={() => setZoom(true)} className="absolute right-2 top-2 rounded-lg bg-white/80 p-1.5 text-slate-600 shadow-sm backdrop-blur" aria-label="Full screen"><Maximize2 className="h-4 w-4" /></button>
                {browsePage !== null && (
                  <button onClick={() => setBrowsePage(null)} className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-mfu px-3 py-1.5 text-xs font-semibold text-white shadow-lg">● Back to live slide {livePage}</button>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between px-1">
                <button disabled={shownPage <= 1} onClick={() => setBrowsePage(shownPage - 1 === livePage ? null : shownPage - 1)} className="rounded-lg p-2 text-slate-500 disabled:opacity-30" aria-label="Previous slide"><ChevronLeft className="h-5 w-5" /></button>
                <div className="min-w-0 flex-1 text-center">
                  <div className="text-xs font-semibold text-slate-700">Slide {shownPage} / {state.totalPages}{browsePage !== null && <span className="ml-1 text-amber-600">(browsing)</span>}</div>
                  {slideMap[shownPage]?.keyTerms?.length ? (
                    <div className="mt-1 flex flex-wrap justify-center gap-1">
                      {slideMap[shownPage]!.keyTerms.slice(0, 4).map((k) => <span key={k} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200">{k}</span>)}
                    </div>
                  ) : null}
                </div>
                <button disabled={shownPage >= state.totalPages} onClick={() => setBrowsePage(shownPage + 1 === livePage ? null : shownPage + 1)} className="rounded-lg p-2 text-slate-500 disabled:opacity-30" aria-label="Next slide"><ChevronRight className="h-5 w-5" /></button>
              </div>
            </section>

            <section className="px-3 pb-44 md:min-h-0 md:overflow-y-auto md:border-l md:border-slate-200 md:bg-white md:px-4 md:pb-44 md:pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Class questions <span className="font-normal text-slate-400">· tap ▲ if you wonder too</span></h2>
                <span className="text-xs text-slate-400">{state.activeCount} online</span>
              </div>
              <LiveQuestionFeed questions={questions} onVote={vote} currentPage={livePage} />
            </section>
          </main>

          {/* bottom dock: pace + ask — thumb zone */}
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 md:right-[380px] landscape:md:right-[400px]">
            <div className="pointer-events-auto mx-auto max-w-2xl border-t border-slate-200 bg-white/95 px-3 pb-safe-2 pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur md:mb-3 md:rounded-3xl md:border">
              <div className="flex items-end gap-2">
                <div className="flex-1"><PaceBar value={state.myPace} onChange={pace} slidePage={livePage} /></div>
                <button
                  onClick={() => setAskOpen(true)}
                  className="flex h-16 w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-mfu text-sm font-semibold text-white shadow-lg shadow-mfu/20 active:scale-95"
                >
                  <MessageCircleQuestion className="h-6 w-6" />
                  Ask
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <QuestionForm open={askOpen} onClose={() => setAskOpen(false)} slidePage={livePage} keyTerms={meta?.keyTerms ?? []} onSubmit={ask} anonymous={!!state.isAnonymous} onAnonymous={setAnon} />

      {zoom && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 pt-safe pb-safe">
          <div className="flex justify-end p-2"><button onClick={() => setZoom(false)} className="rounded-full bg-white/10 p-2 text-white" aria-label="Close"><X className="h-6 w-6" /></button></div>
          <div className="min-h-0 flex-1 overflow-auto p-2" style={{ touchAction: "pinch-zoom pan-x pan-y" }}><PdfSlide url={slideUrl} page={shownPage} priority /></div>
          <p className="pb-2 text-center text-xs text-white/50">Rotate your phone for a bigger slide · pinch to zoom</p>
        </div>
      )}

      {showExit && (
        <ExitTicketModal
          sessionTitle={state.sessionTitle}
          totalPages={state.totalPages}
          slideUrl={slideUrl}
          slides={slideMap}
          confusedPages={[...confusedRef.current].sort((a, b) => a - b)}
          closesAt={live.exitClosesAt}
          onSubmit={async (rating, muddiestText) => {
            const r = await fetch("/api/exit-ticket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: state.sessionId, rating, muddiestText }) });
            if (!r.ok) { const j = await r.json().catch(() => ({})); push({ title: j.error ?? "Could not submit", tone: "error" }); return false; }
            try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
            setTimeout(() => actions.markExitSubmitted(), 2200);
            return true;
          }}
        />
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh-screen flex flex-col items-center justify-center bg-slate-50 px-6 text-center">{children}</div>;
}
