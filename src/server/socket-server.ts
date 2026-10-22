import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { decode } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getRedis, newRedisConnection, redisEnabled } from "@/lib/redis";
import { generatePseudonym } from "@/lib/pseudonym";
import { enqueue, promote } from "@/lib/queue";
import { removeUpvote, upvoteQuestion } from "@/lib/question-service";
import {
  STAFF_BOARD_ID, boardItems, buildSessionState, canControl, getSessionByCode, listQuestions, markAttendance,
  metadataFor, paceStats, placeSticky, type FullSession,
} from "@/lib/session-service";
import type { AppUser } from "@/lib/auth";
import type { PaceSignal, StickyColor, Stroke } from "@/types";
import { EMIT_CHANNEL, NAMESPACE, roomAll, roomInstructor, roomStudent, setIO } from "./realtime";

/**
 * Socket.io real-time server — namespace "/classroom", room per session code.
 * Identity always comes from the NextAuth session cookie, never from client payloads.
 */

type Ack = (res: { ok: boolean; error?: string; [k: string]: unknown }) => void;
const noop: Ack = () => undefined;
const roomStudents = (code: string) => `room:${code}:students`;

interface SocketData {
  user: AppUser;
  sessionCode?: string;
  isController?: boolean;
  bucket: { tokens: number; ts: number };
}

// ── short-lived session cache (hot path: strokes / pace taps) ─────────────────────────
const cache = new Map<string, { s: FullSession; at: number }>();
async function loadSession(code: string, fresh = false) {
  const hit = cache.get(code);
  if (!fresh && hit && Date.now() - hit.at < 5000) return hit.s;
  const s = await getSessionByCode(code);
  if (s) cache.set(code, { s, at: Date.now() });
  else cache.delete(code);
  return s;
}
function patchCache(code: string, patch: Partial<FullSession>) {
  const hit = cache.get(code);
  if (hit) Object.assign(hit.s, patch);
}

function allow(socket: Socket, cost = 1, rate = 25, burst = 60) {
  const d = socket.data as SocketData;
  const now = Date.now();
  d.bucket.tokens = Math.min(burst, d.bucket.tokens + ((now - d.bucket.ts) / 1000) * rate);
  d.bucket.ts = now;
  if (d.bucket.tokens < cost) return false;
  d.bucket.tokens -= cost;
  return true;
}

function parseCookies(header?: string) {
  const out: Record<string, string> = {};
  (header ?? "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

async function userFromHandshake(socket: Socket): Promise<AppUser | null> {
  const cookies = parseCookies(socket.handshake.headers.cookie);
  const raw = cookies["__Secure-next-auth.session-token"] ?? cookies["next-auth.session-token"];
  if (!raw) return null;
  const t = await decode({ token: raw, secret: env.nextAuthSecret }).catch(() => null);
  if (!t?.uid) return null;
  return { id: String(t.uid), email: String(t.email ?? ""), name: String(t.name ?? ""), role: t.role as AppUser["role"], studentId: (t.studentId as string) ?? null };
}

export function attachSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: env.appUrl, credentials: true },
    pingInterval: 20000,
    pingTimeout: 25000,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
    maxHttpBufferSize: 256 * 1024,
  });

  if (redisEnabled()) {
    const pub = newRedisConnection();
    const sub = newRedisConnection();
    io.adapter(createAdapter(pub, sub));
    // re-emit events published by separate worker processes
    const listener = newRedisConnection();
    listener.subscribe(EMIT_CHANNEL);
    listener.on("message", (_ch, msg) => {
      try {
        const { room, event, payload } = JSON.parse(msg);
        io.of(NAMESPACE).local.to(room).emit(event, payload);
      } catch { /* ignore */ }
    });
    getRedis();
  }
  setIO(io);

  const nsp = io.of(NAMESPACE);

  // presence (debounced per room)
  const presenceTimers = new Map<string, NodeJS.Timeout>();
  function schedulePresence(code: string) {
    if (presenceTimers.has(code)) return;
    presenceTimers.set(code, setTimeout(async () => {
      presenceTimers.delete(code);
      const sockets = await nsp.in(roomStudents(code)).fetchSockets();
      const ids = new Set(sockets.map((s) => (s.data as SocketData).user?.studentId).filter(Boolean));
      nsp.to(roomAll(code)).emit("room:presence_update", { activeCount: ids.size });
    }, 800));
  }
  async function activeCount(code: string) {
    const sockets = await nsp.in(roomStudents(code)).fetchSockets();
    return new Set(sockets.map((s) => (s.data as SocketData).user?.studentId).filter(Boolean)).size;
  }

  nsp.use(async (socket, next) => {
    const user = await userFromHandshake(socket);
    if (!user) return next(new Error("unauthorized"));
    (socket.data as SocketData) = { user, bucket: { tokens: 60, ts: Date.now() } };
    next();
  });

  nsp.on("connection", (socket) => {
    const data = socket.data as SocketData;
    const user = data.user;

    /** Resolve the session the socket joined, check it is LIVE and (optionally) that caller controls it. */
    async function ctx(code: unknown, opts: { control?: boolean; live?: boolean } = {}) {
      const c = String(code ?? data.sessionCode ?? "");
      if (!c || c !== data.sessionCode) throw new Error("Join the session first");
      const s = await loadSession(c, !!opts.control);
      if (!s) throw new Error("Session not found");
      if (opts.control && !data.isController) throw new Error("Only the instructor can do this");
      if (opts.live && s.status !== "LIVE") throw new Error("This class is no longer live");
      return s;
    }
    const wrap = <T>(fn: (p: T, ack: Ack) => Promise<void>) => async (p: T, ack?: Ack) => {
      const a = typeof ack === "function" ? ack : noop;
      try {
        await fn(p ?? ({} as T), a);
      } catch (e) {
        a({ ok: false, error: (e as Error).message });
      }
    };

    // ── join ─────────────────────────────────────────────────────────────
    socket.on("session:join", wrap<{ sessionCode: string }>(async ({ sessionCode }, ack) => {
      const code = String(sessionCode || "").toUpperCase();
      const s = await loadSession(code, true);
      if (!s) return ack({ ok: false, error: "Session not found" });
      const isController = canControl(s, user);
      if (user.role !== "STUDENT" && !isController) return ack({ ok: false, error: "This class belongs to another instructor" });
      data.sessionCode = code;
      data.isController = isController;
      socket.join(roomAll(code));
      if (isController) socket.join(roomInstructor(code));
      if (user.role === "STUDENT" && user.studentId) {
        socket.join(roomStudents(code));
        socket.join(roomStudent(code, user.studentId));
        await markAttendance(s, user);
      }
      schedulePresence(code);
      const state = await buildSessionState(s, user, await activeCount(code));
      const viewer = { role: user.role, studentId: user.studentId };
      const [questions, board, pace] = await Promise.all([
        listQuestions(s.id, viewer),
        s.isBoardActive ? boardItems(s.id, s.currentSlidePage) : Promise.resolve(null),
        isController ? paceStats(s.id, s.currentSlidePage) : Promise.resolve(null),
      ]);
      ack({ ok: true, state, questions, board, pace });
    }));

    // ── instructor controls ─────────────────────────────────────────────
    socket.on("instructor:slide_change", wrap<{ sessionCode: string; slidePage: number }>(async (p, ack) => {
      const s = await ctx(p.sessionCode, { control: true });
      const total = s.slideDeck?.totalPages ?? 1;
      const page = Math.min(total, Math.max(1, Math.round(Number(p.slidePage) || 1)));
      await prisma.classSession.update({ where: { id: s.id }, data: { currentSlidePage: page } });
      patchCache(s.sessionCode, { currentSlidePage: page });
      nsp.to(roomAll(s.sessionCode)).emit("slide:changed", { slidePage: page, metadata: metadataFor(s, page) });
      nsp.to(roomInstructor(s.sessionCode)).emit("pace:updated", await paceStats(s.id, page));
      ack({ ok: true, slidePage: page });
    }));

    socket.on("instructor:board_toggle", wrap<{ sessionCode: string; isActive: boolean; isFrozen?: boolean }>(async (p, ack) => {
      const s = await ctx(p.sessionCode, { control: true });
      const isActive = !!p.isActive;
      const isFrozen = isActive ? !!p.isFrozen : false;
      await prisma.classSession.update({ where: { id: s.id }, data: { isBoardActive: isActive, isBoardFrozen: isFrozen } });
      patchCache(s.sessionCode, { isBoardActive: isActive, isBoardFrozen: isFrozen });
      nsp.to(roomAll(s.sessionCode)).emit("board:state_changed", { isActive, isFrozen, slidePage: s.currentSlidePage });
      ack({ ok: true });
    }));

    socket.on("instructor:board_clear", wrap<{ sessionCode: string; slidePage: number }>(async (p, ack) => {
      const s = await ctx(p.sessionCode, { control: true });
      const page = Number(p.slidePage) || s.currentSlidePage;
      await prisma.classBoardItem.deleteMany({ where: { sessionId: s.id, slidePage: page } });
      nsp.to(roomAll(s.sessionCode)).emit("board:cleared", { slidePage: page });
      ack({ ok: true });
    }));

    socket.on("instructor:silent_toggle", wrap<{ sessionCode: string; isSilentMode: boolean }>(async (p, ack) => {
      const s = await ctx(p.sessionCode, { control: true });
      await prisma.classSession.update({ where: { id: s.id }, data: { isSilentMode: !!p.isSilentMode } });
      patchCache(s.sessionCode, { isSilentMode: !!p.isSilentMode });
      ack({ ok: true });
    }));

    socket.on("instructor:question_resolve", wrap<{ sessionCode: string; questionId: string; isAnswered?: boolean }>(async (p, ack) => {
      const s = await ctx(p.sessionCode, { control: true });
      const isAnswered = p.isAnswered !== false;
      await prisma.question.updateMany({ where: { id: String(p.questionId), sessionId: s.id }, data: { isAnswered } });
      nsp.to(roomAll(s.sessionCode)).emit(isAnswered ? "question:resolved" : "question:reopened", { questionId: p.questionId });
      ack({ ok: true });
    }));

    socket.on("instructor:question_pin", wrap<{ sessionCode: string; questionId: string; isPinned: boolean }>(async (p, ack) => {
      const s = await ctx(p.sessionCode, { control: true });
      await prisma.question.updateMany({ where: { id: String(p.questionId), sessionId: s.id }, data: { isPinned: !!p.isPinned } });
      nsp.to(roomAll(s.sessionCode)).emit("question:pinned", { questionId: p.questionId, isPinned: !!p.isPinned });
      ack({ ok: true });
    }));

    socket.on("instructor:end_class", wrap<{ sessionCode: string }>(async (p, ack) => {
      const s = await ctx(p.sessionCode, { control: true });
      if (s.status !== "LIVE") return ack({ ok: true, status: s.status });
      await prisma.classSession.update({ where: { id: s.id }, data: { status: "EXIT_TICKET", isBoardActive: false } });
      patchCache(s.sessionCode, { status: "EXIT_TICKET", isBoardActive: false });
      const closesAt = Date.now() + env.exitTicketWindowSec * 1000;
      nsp.to(roomAll(s.sessionCode)).emit("session:exit_ticket_trigger", { sessionId: s.id, sessionTitle: s.sessionTitle, closesAt });
      await enqueue("close-session", { sessionId: s.id }, { delayMs: env.exitTicketWindowSec * 1000, jobId: `close-${s.id}` });
      ack({ ok: true, closesAt });
    }));

    socket.on("instructor:finalize_now", wrap<{ sessionCode: string }>(async (p, ack) => {
      const s = await ctx(p.sessionCode, { control: true });
      await promote("close-session", `close-${s.id}`, { sessionId: s.id });
      ack({ ok: true });
    }));

    // ── student interactions ────────────────────────────────────────────
    socket.on("student:question_upvote", wrap<{ sessionCode: string; questionId: string; remove?: boolean }>(async (p, ack) => {
      if (!user.studentId) throw new Error("Students only");
      if (!allow(socket, 2)) throw new Error("Slow down");
      const s = await ctx(p.sessionCode, { live: true });
      const q = await prisma.question.findFirst({ where: { id: String(p.questionId), sessionId: s.id }, select: { id: true } });
      if (!q) throw new Error("Question not found");
      const count = p.remove ? await removeUpvote(q.id, user.studentId) : await upvoteQuestion(q.id, user.studentId);
      if (count !== null) nsp.to(roomAll(s.sessionCode)).emit("question:upvoted", { questionId: q.id, upvoteCount: count });
      ack({ ok: true, upvoteCount: count });
    }));

    socket.on("student:pace_signal", wrap<{ sessionCode: string; slidePage: number; signalType: PaceSignal | null }>(async (p, ack) => {
      if (!user.studentId) throw new Error("Students only");
      if (!allow(socket, 2)) throw new Error("Slow down");
      const s = await ctx(p.sessionCode, { live: true });
      const page = s.currentSlidePage; // always attach to the slide being shown right now
      const key = { sessionId_slidePage_studentId: { sessionId: s.id, slidePage: page, studentId: user.studentId } };
      if (!p.signalType) {
        await prisma.paceSignal.deleteMany({ where: { sessionId: s.id, slidePage: page, studentId: user.studentId } });
      } else {
        if (!["TOO_FAST", "CLEAR", "CONFUSED"].includes(p.signalType)) throw new Error("Invalid signal");
        await prisma.paceSignal.upsert({
          where: key,
          create: { sessionId: s.id, slidePage: page, studentId: user.studentId, signalType: p.signalType },
          update: { signalType: p.signalType, createdAt: new Date() },
        });
      }
      nsp.to(roomInstructor(s.sessionCode)).emit("pace:updated", await paceStats(s.id, page));
      ack({ ok: true, slidePage: page, signalType: p.signalType });
    }));

    // ── collaborative board ─────────────────────────────────────────────
    socket.on("board:fetch", wrap<{ sessionCode: string; slidePage?: number }>(async (p, ack) => {
      const s = await ctx(p.sessionCode);
      ack({ ok: true, board: await boardItems(s.id, Number(p.slidePage) || s.currentSlidePage) });
    }));

    socket.on("board:draw_stroke", wrap<{ sessionCode: string; slidePage: number; stroke: Stroke }>(async (p, ack) => {
      if (!allow(socket, 1)) throw new Error("Slow down");
      const s = await ctx(p.sessionCode, { live: true });
      if (!s.isBoardActive) throw new Error("Board is closed");
      if (s.isBoardFrozen && !data.isController) throw new Error("Board is frozen");
      const pts = Array.isArray(p.stroke?.points) ? p.stroke.points.slice(0, 1500) : [];
      const points = pts
        .filter((pt) => Array.isArray(pt) && pt.length === 2)
        .map(([x, y]) => [Math.min(1, Math.max(0, Number(x))), Math.min(1, Math.max(0, Number(y)))] as [number, number]);
      if (points.length < 1) throw new Error("Empty stroke");
      const color = /^#[0-9a-f]{3,8}$/i.test(String(p.stroke.color)) ? String(p.stroke.color) : "#0F172A";
      const width = Math.min(0.03, Math.max(0.001, Number(p.stroke.width) || 0.004));
      const page = s.currentSlidePage;
      const sid = data.isController ? STAFF_BOARD_ID : user.studentId!;
      const pseudonym = data.isController ? "Instructor" : generatePseudonym(s.id, sid);
      const item = await prisma.classBoardItem.create({
        data: { sessionId: s.id, slidePage: page, studentId: sid, displayPseudonym: pseudonym, itemType: "DRAWING_PATH", payloadJson: { points, strokeColor: color, strokeWidth: width } },
      });
      socket.to(roomAll(s.sessionCode)).emit("board:stroke_broadcast", { slidePage: page, stroke: { id: item.id, points, color, width }, displayPseudonym: pseudonym });
      ack({ ok: true, id: item.id });
    }));

    socket.on("board:undo", wrap<{ sessionCode: string }>(async (p, ack) => {
      const s = await ctx(p.sessionCode, { live: true });
      const sid = data.isController ? STAFF_BOARD_ID : user.studentId!;
      const last = await prisma.classBoardItem.findFirst({ where: { sessionId: s.id, slidePage: s.currentSlidePage, studentId: sid }, orderBy: { createdAt: "desc" } });
      if (!last) return ack({ ok: true, removed: null });
      await prisma.classBoardItem.delete({ where: { id: last.id } });
      nsp.to(roomAll(s.sessionCode)).emit("board:item_removed", { id: last.id, slidePage: s.currentSlidePage });
      ack({ ok: true, removed: last.id });
    }));

    socket.on("board:add_sticky", wrap<{ sessionCode: string; slidePage: number; text: string; color: StickyColor }>(async (p, ack) => {
      if (!allow(socket, 10)) throw new Error("Slow down");
      const s = await ctx(p.sessionCode, { live: true });
      if (!s.isBoardActive) throw new Error("Board is closed");
      if (s.isBoardFrozen && !data.isController) throw new Error("Board is frozen");
      const text = String(p.text ?? "").trim().slice(0, 140);
      if (!text) throw new Error("Empty note");
      const color: StickyColor = ["amber", "blue", "emerald", "rose"].includes(p.color) ? p.color : "amber";
      const page = s.currentSlidePage;
      const existing = await prisma.classBoardItem.findMany({ where: { sessionId: s.id, slidePage: page, itemType: "STICKY_NOTE" }, select: { payloadJson: true } });
      const pos = placeSticky(existing.map((e) => e.payloadJson as { x: number; y: number }));
      const sid = data.isController ? STAFF_BOARD_ID : user.studentId!;
      const pseudonym = data.isController ? "Instructor" : generatePseudonym(s.id, sid);
      const item = await prisma.classBoardItem.create({
        data: { sessionId: s.id, slidePage: page, studentId: sid, displayPseudonym: pseudonym, itemType: "STICKY_NOTE", payloadJson: { text, color, ...pos } },
      });
      const payload = { id: item.id, slidePage: page, text, color, ...pos, displayPseudonym: pseudonym };
      nsp.to(roomAll(s.sessionCode)).emit("board:sticky_broadcast", payload);
      ack({ ok: true, sticky: payload });
    }));

    socket.on("disconnect", () => {
      if (data.sessionCode) schedulePresence(data.sessionCode);
    });
  });

  console.log(`[socket] Socket.io ready on namespace ${NAMESPACE}${redisEnabled() ? " (redis adapter)" : ""}`);
  return io;
}
