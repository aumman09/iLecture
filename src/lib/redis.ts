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
    g.__ilectureRedis.on("error", (e) => logOnce(e.message));
  }
  return g.__ilectureRedis;
}

/** Fresh connection (BullMQ workers / pub-sub need dedicated connections). */
export function newRedisConnection(): Redis {
  const c = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  c.on("error", (e) => logOnce(e.message));
  return c;
}

let lastLog = 0;
function logOnce(msg: string) {
  if (Date.now() - lastLog > 30_000) {
    lastLog = Date.now();
    console.error("[redis]", msg);
  }
}

/**
 * Startup check: if REDIS_URL is set but Redis is not reachable, fall back to single-instance mode
 * (in-process jobs, in-memory Socket.io adapter) instead of crashing / spamming errors.
 */
export async function ensureRedisOrFallback(timeoutMs = 2500): Promise<boolean> {
  if (!redisEnabled()) return false;
  const probe = new IORedis(env.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null, connectTimeout: timeoutMs });
  probe.on("error", () => undefined);
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    console.warn(`\n  ⚠ Redis is not reachable at ${env.redisUrl} — running WITHOUT Redis (single instance, jobs in-process).`);
    console.warn("    Start it with \"docker compose up -d\" or set REDIS_URL=\"\" in .env to hide this warning.\n");
    process.env.REDIS_URL = "";
    return false;
  } finally {
    probe.disconnect();
  }
}
