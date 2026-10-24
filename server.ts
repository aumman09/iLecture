/**
 * iLecture MFU custom server: Next.js + Socket.io (+ BullMQ workers) in one process.
 *   npm run dev    → development with hot reload
 *   npm run start  → production (run `npm run build` first)
 */
import "./src/server/load-env";
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { attachSocketServer } from "./src/server/socket-server";
import { startWorkers } from "./src/server/workers/start";
import { ensureRedisOrFallback } from "./src/lib/redis";
import { ensurePdfWorker } from "./src/server/ensure-assets";
import { checkDatabase } from "./src/server/check-db";

ensurePdfWorker();

// Trust the request host for auth redirects unless explicitly disabled (AUTH_TRUST_HOST=false).
if (process.env.AUTH_TRUST_HOST === undefined) process.env.AUTH_TRUST_HOST = "true";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOSTNAME || "0.0.0.0";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

Promise.all([app.prepare(), ensureRedisOrFallback(), checkDatabase()]).then(() => {
  const server = createServer((req, res) => {
    // Let NextAuth build redirects from the address the user actually opened
    // (localhost on the Mac, 192.168.x.x on a phone / iPad, or the public domain behind a proxy).
    if (!req.headers["x-forwarded-proto"]) req.headers["x-forwarded-proto"] = (req.socket as { encrypted?: boolean }).encrypted ? "https" : "http";
    if (!req.headers["x-forwarded-host"] && req.headers.host) req.headers["x-forwarded-host"] = req.headers.host;
    handle(req, res, parse(req.url!, true));
  });
  attachSocketServer(server);
  if (process.env.RUN_WORKERS_IN_SERVER !== "false") startWorkers();
  server.listen(port, hostname, () => {
    console.log(`\n  iLecture MFU ready → http://localhost:${port}  (${dev ? "development" : "production"})`);
    if (process.env.DEMO_MODE === "true") console.log("  Demo mode ON — one-tap demo login at /login\n");
  });
});
