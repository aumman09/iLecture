import { Queue } from "bullmq";
import { redisEnabled, newRedisConnection } from "./redis";

/**
 * Background jobs (BullMQ when Redis is configured, otherwise in-process timers).
 *  - scan-slide-deck : PDF text extraction + AI tagging per page
 *  - close-session   : Muddiest-point summary, risk recalculation, teaching evaluation
 */
export type JobName = "scan-slide-deck" | "close-session";
export interface JobOptions { delayMs?: number; jobId?: string }

export const QUEUE_NAME = "ilecture-jobs";
const g = globalThis as unknown as { __ilectureQueue?: Queue; __ilectureTimers?: Map<string, NodeJS.Timeout> };

function queue() {
  if (!g.__ilectureQueue) g.__ilectureQueue = new Queue(QUEUE_NAME, { connection: newRedisConnection() });
  return g.__ilectureQueue;
}
const timers = () => (g.__ilectureTimers ??= new Map());

export async function runJob(name: JobName, data: Record<string, unknown>) {
  const p = await import("../server/workers/processors");
  if (name === "scan-slide-deck") return p.processSlideScan(data as { slideDeckId: string });
  if (name === "close-session") return p.processSessionClose(data as { sessionId: string });
}

export async function enqueue(name: JobName, data: Record<string, unknown>, opts: JobOptions = {}) {
  if (redisEnabled()) {
    await queue().add(name, data, {
      delay: opts.delayMs,
      jobId: opts.jobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    });
    return;
  }
  const id = opts.jobId ?? `${name}-${Date.now()}-${Math.random()}`;
  if (opts.jobId && timers().has(id)) return; // de-duplicate like BullMQ jobId
  const t = setTimeout(() => {
    timers().delete(id);
    runJob(name, data).catch((e) => console.error(`[job:${name}]`, e));
  }, opts.delayMs ?? 0);
  timers().set(id, t);
}

/** Run a previously delayed job right now (e.g. all students already submitted the exit ticket). */
export async function promote(name: JobName, jobId: string, data: Record<string, unknown>) {
  if (redisEnabled()) {
    const job = await queue().getJob(jobId);
    if (job && (await job.isDelayed())) {
      await job.promote();
      return;
    }
    if (!job) await enqueue(name, data, { jobId });
    return;
  }
  const t = timers().get(jobId);
  if (t) {
    clearTimeout(t);
    timers().delete(jobId);
  }
  await runJob(name, data).catch((e) => console.error(`[job:${name}]`, e));
}
