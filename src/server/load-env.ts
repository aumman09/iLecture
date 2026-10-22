// Must be imported first by server.ts / worker entry so .env is loaded before any module reads process.env.
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
