// Centralised, typed access to runtime configuration (server-side only).
const bool = (v: string | undefined, d = false) => (v === undefined || v === "" ? d : ["1", "true", "yes", "on"].includes(v.toLowerCase()));

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL?.trim() || "",
  appUrl: (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  nextAuthSecret: process.env.NEXTAUTH_SECRET ?? "dev-insecure-secret",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  staffDomain: process.env.STAFF_EMAIL_DOMAIN ?? "mfu.ac.th",
  studentDomain: process.env.STUDENT_EMAIL_DOMAIN ?? "lamduan.mfu.ac.th",
  advisorEmails: (process.env.ADVISOR_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  adminEmails: (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  demoMode: bool(process.env.DEMO_MODE, false),
  openaiKey: process.env.OPENAI_API_KEY?.trim() || "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || undefined,
  chatModel: process.env.AI_MODEL_CHAT || "gpt-4o-mini",
  embeddingModel: process.env.AI_MODEL_EMBEDDING || "text-embedding-3-small",
  clusterThreshold: Number(process.env.CLUSTER_SIMILARITY_THRESHOLD || 0.84),
  storageDir: process.env.STORAGE_DIR || "./storage",
  evalWebhookUrl: process.env.MFU_CENTRAL_EVAL_WEBHOOK_URL ?? "",
  evalApiKey: process.env.MFU_CENTRAL_EVAL_API_KEY ?? "",
  exitTicketWindowSec: Number(process.env.EXIT_TICKET_WINDOW_SEC || 180),
  autoEnroll: bool(process.env.AUTO_ENROLL_ON_JOIN, true),
};

export const googleConfigured = () =>
  !!env.googleClientId && !!env.googleClientSecret && !env.googleClientId.startsWith("your-");
