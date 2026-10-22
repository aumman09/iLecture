import IORedis, { type Redis } from "ioredis";
import { env } from "./env";

// Redis is optional. Without REDIS_URL the app runs as a single instance:
// background jobs execute in-process and Socket.io uses its in-memory adapter.
const g = globalThis as unknown as { __ilectureRedis?: Redis | null };

export function redisEnabled() {
  return !!env.redisUrl;
}

export function getRedis(): Redis | null {
  if (!redisEnabled()) return null;
  if (g.__ilectureRedis === undefined) {
    g.__ilectureRedis = new IORedis(env.redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
    g.__ilectureRedis.on("error", (e) => console.error("[redis]", e.message));
  }
  return g.__ilectureRedis;
}

/** Fresh connection (BullMQ workers / pub-sub need dedicated connections). */
export function newRedisConnection(): Redis {
  return new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
}
