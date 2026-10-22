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

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOSTNAME || "0.0.0.0";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res, parse(req.url!, true)));
  attachSocketServer(server);
  if (process.env.RUN_WORKERS_IN_SERVER !== "false") startWorkers();
  server.listen(port, hostname, () => {
    console.log(`\n  iLecture MFU ready → http://localhost:${port}  (${dev ? "development" : "production"})`);
    if (process.env.DEMO_MODE === "true") console.log("  Demo mode ON — one-tap demo login at /login\n");
  });
});
