import type { Server } from "socket.io";
import { getRedis } from "@/lib/redis";

/**
 * Emit Socket.io events from anywhere (route handlers, workers).
 * - Same process as the socket server  → emit directly (io stored on globalThis).
 * - Separate worker process            → publish via Redis; every socket server re-emits locally.
 */
export const NAMESPACE = "/classroom";
export const EMIT_CHANNEL = "ilecture:emit";
export const roomAll = (code: string) => `room:${code}`;
export const roomInstructor = (code: string) => `room:${code}:instructor`;
export const roomStudent = (code: string, studentId: string) => `room:${code}:student:${studentId}`;

const g = globalThis as unknown as { __ilectureIO?: Server };
export const setIO = (io: Server) => { g.__ilectureIO = io; };
export const getIO = () => g.__ilectureIO;

export async function emitTo(room: string, event: string, payload: unknown) {
  const io = getIO();
  if (io) {
    io.of(NAMESPACE).to(room).emit(event, payload);
    return;
  }
  const r = getRedis();
  if (r) await r.publish(EMIT_CHANNEL, JSON.stringify({ room, event, payload }));
  else console.warn(`[realtime] no socket server in this process — dropped ${event}`);
}
