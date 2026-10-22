/**
 * Standalone BullMQ worker process (optional). `npm run worker`
 * By default server.ts already runs these workers in-process; run this separately to scale out
 * (set RUN_WORKERS_IN_SERVER=false on the web servers).
 */
import "../load-env";
import { startWorkers } from "./start";
startWorkers();
