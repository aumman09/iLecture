import { Worker } from "bullmq";
import { QUEUE_NAME } from "@/lib/queue";
import { newRedisConnection, redisEnabled } from "@/lib/redis";
import { processSessionClose, processSlideScan } from "./processors";

export function startWorkers() {
  if (!redisEnabled()) {
    console.log("[workers] REDIS_URL not set — jobs run in-process, no BullMQ worker needed");
    return null;
  }
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "scan-slide-deck") return processSlideScan(job.data);
      if (job.name === "close-session") return processSessionClose(job.data);
      throw new Error(`Unknown job ${job.name}`);
    },
    { connection: newRedisConnection(), concurrency: 4 }
  );
  worker.on("failed", (job, err) => console.error(`[workers] ${job?.name} failed:`, err.message));
  console.log("[workers] BullMQ worker started on queue", QUEUE_NAME);
  return worker;
}
