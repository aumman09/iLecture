"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { emitAck, getSocket } from "./socket-client";
import type { BoardMode, BoardItemsDTO, PaceSignal, PaceStats, QuestionDTO, SessionStateDTO, SlideMetadataDTO, StickyColor, StickyNote, Stroke } from "@/types";
import type { BoardStroke } from "@/components/shared/BoardSurface";

export function sortQuestions(qs: QuestionDTO[]) {
  return [...qs].sort((a, b) =>
    Number(b.isPinned) - Number(a.isPinned) ||
    Number(a.isAnswered) - Number(b.isAnswered) ||
    b.upvoteCount - a.upvoteCount ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

interface Handlers {
  onQuestionIncoming?: (q: { id: string; polishedContent?: string; slidePage?: number; clustered: boolean }) => void;
  onBoardToggled?: (active: boolean) => void;
  onExitTicket?: () => void;
  onSlideChanged?: (page: number) => void;
}

/**
 * One hook for both the instructor console and the student app: joins the Socket.io room,
 * keeps session / questions / board / pace state in sync and exposes typed actions.
 */
export function useLiveSession(sessionCode: string, handlers: Handlers = {}) {
  const [state, setState] = useState<SessionStateDTO | null>(null);
  const [questions, setQuestions] = useState<QuestionDTO[]>([]);
  const [strokes, setStrokes] = useState<BoardStroke[]>([]);
  const [stickies, setStickies] = useState<StickyNote[]>([]);
  const [pace, setPace] = useState<PaceStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [exitClosesAt, setExitClosesAt] = useState<number | null>(null);
  const [exitProgress, setExitProgress] = useState<{ submitted: number; attended: number } | null>(null);
  const [summaryReady, setSummaryReady] = useState(false);
  const h = useRef(handlers);
  h.current = handlers;
  const pageRef = useRef(1);
  const modeRef = useRef<BoardMode>("SLIDE");
  /** page the board is on: live slide, or 0 for the blank Idea Board */
  const bp = () => (modeRef.current === "IDEAS" ? 0 : pageRef.current);

  const applyBoard = useCallback((b: BoardItemsDTO | null) => {
    if (!b) { setStrokes([]); setStickies([]); return; }
    if (b.slidePage !== bp()) return;
    setStrokes(b.strokes);
    setStickies(b.stickies);
  }, []);

  const fetchBoard = useCallback(async () => {
    const r = await emitAck<{ board: BoardItemsDTO }>("board:fetch", { sessionCode });
    if (r.ok) applyBoard(r.board);
  }, [sessionCode, applyBoard]);

  useEffect(() => {
    const s = getSocket();
    const join = async () => {
      setConnected(true);
      const r = await emitAck<{ state: SessionStateDTO; questions: QuestionDTO[]; board: BoardItemsDTO | null; pace: PaceStats | null }>("session:join", { sessionCode });
      if (!r.ok) { setError(r.error ?? "Could not join"); return; }
      setError(null);
      pageRef.current = r.state.currentSlidePage;
      modeRef.current = r.state.boardMode;
      setState(r.state);
      setQuestions(sortQuestions(r.questions));
      applyBoard(r.board);
      if (r.pace) setPace(r.pace);
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = (e: Error) => { setConnected(false); if (e.message === "unauthorized") setError("Please sign in again"); };

    const on: Record<string, (p: any) => void> = {
      "slide:changed": (p: { slidePage: number; metadata: SlideMetadataDTO | null }) => {
        pageRef.current = p.slidePage;
        setState((st) => {
          if (!st) return st;
          if (st.isBoardActive && modeRef.current === "SLIDE") fetchBoard();
          return { ...st, currentSlidePage: p.slidePage, metadata: p.metadata, myPace: st.myPace === undefined ? undefined : null };
        });
        if (modeRef.current === "SLIDE") { setStrokes([]); setStickies([]); }
        h.current.onSlideChanged?.(p.slidePage);
      },
      "room:presence_update": (p: { activeCount: number }) => setState((st) => (st ? { ...st, activeCount: p.activeCount } : st)),
      "question:new": (q: QuestionDTO) => {
        setQuestions((qs) => (qs.some((x) => x.id === q.id) ? qs : sortQuestions([...qs, q])));
        h.current.onQuestionIncoming?.({ id: q.id, polishedContent: q.polishedContent, slidePage: q.slidePage, clustered: false });
      },
      "question:clustered": (p: { parentQuestionId: string; clusterSize: number; upvoteCount: number }) => {
        setQuestions((qs) => sortQuestions(qs.map((q) => (q.id === p.parentQuestionId ? { ...q, clusterSize: p.clusterSize, upvoteCount: p.upvoteCount } : q))));
        h.current.onQuestionIncoming?.({ id: p.parentQuestionId, clustered: true });
      },
      "question:variant": (p: { parentQuestionId: string; polishedContent: string }) =>
        setQuestions((qs) => qs.map((q) => (q.id === p.parentQuestionId ? { ...q, variants: [...(q.variants ?? []), p.polishedContent] } : q))),
      "question:upvoted": (p: { questionId: string; upvoteCount: number }) =>
        setQuestions((qs) => sortQuestions(qs.map((q) => (q.id === p.questionId ? { ...q, upvoteCount: p.upvoteCount } : q)))),
      "question:resolved": (p: { questionId: string }) => setQuestions((qs) => sortQuestions(qs.map((q) => (q.id === p.questionId ? { ...q, isAnswered: true } : q)))),
      "question:reopened": (p: { questionId: string }) => setQuestions((qs) => sortQuestions(qs.map((q) => (q.id === p.questionId ? { ...q, isAnswered: false } : q)))),
      "question:pinned": (p: { questionId: string; isPinned: boolean }) => setQuestions((qs) => sortQuestions(qs.map((q) => (q.id === p.questionId ? { ...q, isPinned: p.isPinned } : q)))),
      "pace:updated": (p: PaceStats) => { if (p.slidePage === pageRef.current) setPace(p); },
      "board:state_changed": (p: { isActive: boolean; isFrozen: boolean; mode?: BoardMode; prompt?: string | null }) => {
        const modeChanged = !!p.mode && p.mode !== modeRef.current;
        if (p.mode) modeRef.current = p.mode;
        setState((st) => (st ? { ...st, isBoardActive: p.isActive, isBoardFrozen: p.isFrozen, boardMode: p.mode ?? st.boardMode, boardPrompt: p.prompt === undefined ? st.boardPrompt : p.prompt } : st));
        if (modeChanged) { setStrokes([]); setStickies([]); }
        if (p.isActive) fetchBoard();
        h.current.onBoardToggled?.(p.isActive);
      },
      "board:stroke_broadcast": (p: { slidePage: number; stroke: BoardStroke; displayPseudonym: string }) => {
        if (p.slidePage === bp()) setStrokes((s) => (s.some((x) => x.id === p.stroke.id) ? s : [...s, { ...p.stroke, displayPseudonym: p.displayPseudonym }]));
      },
      "board:sticky_broadcast": (n: StickyNote) => { if (n.slidePage === bp()) setStickies((s) => (s.some((x) => x.id === n.id) ? s : [...s, n])); },
      "board:cleared": (p: { slidePage: number }) => { if (p.slidePage === bp()) { setStrokes([]); setStickies([]); } },
      "board:prompt": (p: { prompt: string | null }) => setState((st) => (st ? { ...st, boardPrompt: p.prompt } : st)),
      "board:liked": (p: { id: string; likeCount: number }) => setStickies((s) => s.map((n) => (n.id === p.id ? { ...n, likeCount: p.likeCount } : n))),
      "board:item_removed": (p: { id: string }) => { setStrokes((s) => s.filter((x) => x.id !== p.id)); setStickies((s) => s.filter((x) => x.id !== p.id)); },
      "session:exit_ticket_trigger": (p: { closesAt: number }) => {
        setState((st) => (st ? { ...st, status: "EXIT_TICKET", isBoardActive: false } : st));
        setExitClosesAt(p.closesAt);
        h.current.onExitTicket?.();
      },
      "session:ended": () => setState((st) => (st ? { ...st, status: "ENDED" } : st)),
      "session:summary_ready": () => setSummaryReady(true),
      "exit_ticket:progress": (p: { submitted: number; attended: number }) => setExitProgress(p),
    };

    s.on("connect", join);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onConnectError);
    Object.entries(on).forEach(([e, fn]) => s.on(e, fn));
    if (s.connected) join();
    return () => {
      s.off("connect", join);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onConnectError);
      Object.entries(on).forEach(([e, fn]) => s.off(e, fn));
    };
  }, [sessionCode, applyBoard, fetchBoard]);

  // ── actions ────────────────────────────────────────────────────────────
  const actions = {
    gotoSlide: async (page: number) => {
      if (!state) return;
      const p = Math.min(state.totalPages, Math.max(1, page));
      if (p === state.currentSlidePage) return;
      pageRef.current = p;
      setState({ ...state, currentSlidePage: p }); // optimistic
      if (modeRef.current === "SLIDE") { setStrokes([]); setStickies([]); }
      const r = await emitAck<{ slidePage: number }>("instructor:slide_change", { sessionCode, slidePage: p });
      if (!r.ok) setError(r.error ?? null);
    },
    /** mode: "SLIDE" = draw on the current slide, "IDEAS" = blank class Idea Board */
    toggleBoard: async (isActive: boolean, isFrozen = false, mode?: BoardMode, prompt?: string | null) => {
      if (mode && mode !== modeRef.current) { modeRef.current = mode; setStrokes([]); setStickies([]); }
      setState((st) => (st ? { ...st, isBoardActive: isActive, isBoardFrozen: isFrozen, boardMode: mode ?? st.boardMode, boardPrompt: prompt === undefined ? st.boardPrompt : prompt } : st));
      const r = await emitAck("instructor:board_toggle", { sessionCode, isActive, isFrozen, mode, prompt });
      if (isActive) fetchBoard();
      return r;
    },
    setBoardPrompt: (prompt: string | null) => {
      setState((st) => (st ? { ...st, boardPrompt: prompt } : st));
      return emitAck("instructor:board_prompt", { sessionCode, prompt });
    },
    clearBoard: () => { setStrokes([]); setStickies([]); return emitAck("instructor:board_clear", { sessionCode, slidePage: bp() }); },
    likeNote: async (id: string, remove = false) => {
      setStickies((s) => s.map((n) => (n.id === id ? { ...n, likedByMe: !remove, likeCount: Math.max(0, (n.likeCount ?? 0) + (remove ? -1 : 1)) } : n)));
      const r = await emitAck<{ likeCount: number | null }>("board:like", { sessionCode, itemId: id, remove });
      if (r.ok && typeof r.likeCount === "number") setStickies((s) => s.map((n) => (n.id === id ? { ...n, likeCount: r.likeCount as number } : n)));
      return r;
    },
    deleteNote: (id: string) => { setStickies((s) => s.filter((n) => n.id !== id)); return emitAck("board:delete_item", { sessionCode, itemId: id }); },
    setSilent: (isSilentMode: boolean) => {
      setState((st) => (st ? { ...st, isSilentMode } : st));
      return emitAck("instructor:silent_toggle", { sessionCode, isSilentMode });
    },
    resolveQuestion: (questionId: string, isAnswered = true) => {
      setQuestions((qs) => sortQuestions(qs.map((q) => (q.id === questionId ? { ...q, isAnswered } : q))));
      return emitAck("instructor:question_resolve", { sessionCode, questionId, isAnswered });
    },
    pinQuestion: (questionId: string, isPinned: boolean) => {
      setQuestions((qs) => sortQuestions(qs.map((q) => (q.id === questionId ? { ...q, isPinned } : q))));
      return emitAck("instructor:question_pin", { sessionCode, questionId, isPinned });
    },
    endClass: async () => {
      const r = await emitAck<{ closesAt: number }>("instructor:end_class", { sessionCode });
      if (r.ok) { setState((st) => (st ? { ...st, status: "EXIT_TICKET", isBoardActive: false } : st)); if (r.closesAt) setExitClosesAt(r.closesAt); }
      return r;
    },
    finalizeNow: () => emitAck("instructor:finalize_now", { sessionCode }),
    upvote: async (questionId: string, remove = false) => {
      setQuestions((qs) => qs.map((q) => (q.id === questionId ? { ...q, votedByMe: !remove, upvoteCount: q.upvoteCount + (remove ? -1 : 1) } : q)));
      const r = await emitAck<{ upvoteCount: number | null }>("student:question_upvote", { sessionCode, questionId, remove });
      if (r.ok && typeof r.upvoteCount === "number") setQuestions((qs) => sortQuestions(qs.map((q) => (q.id === questionId ? { ...q, upvoteCount: r.upvoteCount as number } : q))));
      if (!r.ok) setQuestions((qs) => qs.map((q) => (q.id === questionId ? { ...q, votedByMe: remove, upvoteCount: q.upvoteCount + (remove ? 1 : -1) } : q)));
      return r;
    },
    sendPace: async (signalType: PaceSignal | null) => {
      setState((st) => (st ? { ...st, myPace: signalType } : st));
      return emitAck("student:pace_signal", { sessionCode, slidePage: pageRef.current, signalType });
    },
    drawStroke: async (stroke: Stroke) => {
      const tempId = `local-${Date.now()}-${Math.random()}`;
      setStrokes((s) => [...s, { ...stroke, id: tempId }]);
      const r = await emitAck<{ id: string }>("board:draw_stroke", { sessionCode, slidePage: pageRef.current, stroke });
      if (r.ok) setStrokes((s) => s.map((x) => (x.id === tempId ? { ...x, id: r.id } : x)));
      else setStrokes((s) => s.filter((x) => x.id !== tempId));
      return r;
    },
    undo: () => emitAck("board:undo", { sessionCode }),
    addSticky: async (text: string, color: StickyColor) => {
      const r = await emitAck<{ sticky: StickyNote }>("board:add_sticky", { sessionCode, slidePage: bp(), text, color });
      if (r.ok && r.sticky) setStickies((s) => (s.some((x) => x.id === r.sticky.id) ? s.map((x) => (x.id === r.sticky.id ? { ...x, mine: true } : x)) : [...s, r.sticky]));
      return r;
    },
    addLocalQuestion: (q: QuestionDTO) => setQuestions((qs) => (qs.some((x) => x.id === q.id) ? qs.map((x) => (x.id === q.id ? { ...x, ...q } : x)) : sortQuestions([...qs, q]))),
    markVoted: (questionId: string) => setQuestions((qs) => qs.map((q) => (q.id === questionId ? { ...q, votedByMe: true } : q))),
    markExitSubmitted: () => setState((st) => (st ? { ...st, exitTicketSubmitted: true } : st)),
  };

  return { state, questions, strokes, stickies, pace, error, connected, exitClosesAt, exitProgress, summaryReady, actions };
}
