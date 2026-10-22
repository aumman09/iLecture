"use client";
import { io, type Socket } from "socket.io-client";
import { useEffect, useRef, useState } from "react";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io("/classroom", {
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
  }
  return socket;
}

/** Emit with acknowledgement + timeout → Promise. */
export function emitAck<T = Record<string, unknown>>(event: string, payload: unknown, timeoutMs = 8000): Promise<T & { ok: boolean; error?: string }> {
  const s = getSocket();
  return new Promise((resolve) => {
    s.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: T & { ok: boolean; error?: string }) => {
      if (err) resolve({ ok: false, error: "Connection timeout" } as T & { ok: boolean; error?: string });
      else resolve(res);
    });
  });
}

export function useConnection() {
  const [connected, setConnected] = useState(false);
  const ref = useRef<Socket | null>(null);
  useEffect(() => {
    const s = getSocket();
    ref.current = s;
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    s.on("connect", on);
    s.on("disconnect", off);
    setConnected(s.connected);
    return () => {
      s.off("connect", on);
      s.off("disconnect", off);
    };
  }, []);
  return connected;
}
