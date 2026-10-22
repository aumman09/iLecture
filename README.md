# iLecture MFU

**Zero-Click Smart Classroom · Live Backchannel · Early Warning Retention**
*สอบใช้ iProctor • บรรยายใช้ iLecture*

Next.js 14 (App Router) · Socket.io (custom server) · PostgreSQL 16 + pgvector · Prisma · Redis + BullMQ · NextAuth (Google) · OpenAI / Ollama

---

## Quick start (local)

```bash
# 1. Infrastructure: PostgreSQL (pgvector) + Redis (needs Docker Desktop)
docker compose up -d

# 2. Configure
cp .env.example .env          # demo mode is on by default — no keys needed

# 3. Install, migrate, seed
npm install
npx prisma migrate deploy
npm run db:seed

# 4. Run (Next.js + Socket.io + background workers in one process)
npm run dev                   # http://localhost:3000
```

Production: `npm run build && npm start`.

### Demo accounts (DEMO_MODE=true)
| Role | How to sign in |
|---|---|
| Instructor | `/login` → **Instructor** |
| Advisor | `/login` → **Advisor** |
| Student | open `/join/LEC789` on a phone → **Join as a new demo student** (or pick a seeded student) |

The seed creates `1001101 Introduction to Computing`, a 3-slide C-pointers deck (already AI-scanned), 36 students with 6 weeks of history (2 critical + 3 moderate risk) and a **live room `LEC789`** with clustered questions.

### Testing with real phones / iPads
Phones must reach your computer over the same Wi-Fi:
1. Find your LAN IP (macOS: `ipconfig getifaddr en0`, e.g. `192.168.1.20`).
2. Set `NEXTAUTH_URL="http://192.168.1.20:3000"` in `.env` and restart.
3. Open the console on the laptop via that address, then click the **PIN** badge to show the QR code.

> Camera-QR → browser works over plain HTTP. For "Add to Home Screen" (PWA) or production, serve over HTTPS (reverse proxy such as Caddy / Nginx).

---

## How it works

### Instructor — Zero-Click console (`/live/[sessionId]`)
- Dashboard → **Start live class** on a synced slide deck (1 click).
- Full-screen slides + floating dock: `Prev / Slide X/Y / Next` · **Open Class Board** · **Silent mode** · **View Q&A (badge)** · **End Class**.
- Keyboard / presentation clicker: `→ ← Space PageUp/PageDown` change slides, `B` board, `Q` Q&A, `S` silent, `F` full screen.
- Silent Focus Mode (default ON): new questions only bump the red badge; OFF shows a 3.5 s toast.
- End Class → exit ticket on every phone → auto-closes after `EXIT_TICKET_WINDOW_SEC` (default 180 s) or as soon as everyone has answered → AI muddiest-point summary, risk scores and teaching evaluation are recalculated.

### Student — mobile / iPad (`/join/[code]`) — designed for minimal taps
- **Scan QR → sign in once (session lasts the semester) → in the room.** No PIN typing; `/join` also shows a big "Live now" button for enrolled courses.
- The slide follows the instructor automatically (students can swipe back with ‹ › and tap "Back to live"; full-screen + pinch zoom).
- **Pace bar**: 🐇 Too fast · 👍 Clear · 🤔 Confused — one tap, tap again to undo, resets each slide.
- **Ask**: one-tap quick questions ("Could you give an example?"…) and "Explain ‹key term›" chips from the AI slide scan, or type in Thai — it is **auto-polished into academic English while typing**; one tap to send. Similar questions are merged (pgvector) and count as a vote.
- **Vote**: one tap on ▲.
- **Class Board** opens by itself: draw with finger / Apple Pencil or post a sticky note.
- **Exit ticket** opens by itself: ★ rating → tap the confusing slide (pre-selected from your 🤔 taps) → Submit.
- Screen wake-lock, haptics, auto-reconnect, iPad landscape 2-column layout, safe-area (notch) aware, installable PWA.

### Privacy
- Peers and the projector only ever see pseudonyms (`HMAC(session, student)` → "Curious Otter"); identity comes from the session cookie, never from client payloads.
- Early Warning shows `Student #A3F2E` labels; real name / ID / advisor are unlocked only at **CRITICAL** (≥ 70). Advisors see only their own advisees.

### Early Warning formula (`src/lib/risk-engine.ts`)
`Risk = 0.25·A + 0.20·E + 0.30·C + 0.25·M` as in the PRD. Implementation details:
- Only sessions held after the student enrolled are counted (auto-enrolled students are not penalised for earlier weeks).
- "Low rating" = 1–2 ★. Confusion signals are counted over the last 3 sessions.
- Recalculated automatically after every class.

---

## Configuration (`.env`)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL with `pgvector` |
| `REDIS_URL` | Optional. Empty = single instance, jobs run in-process |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | Public URL + secret (`openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth. Staff get Classroom + Drive read-only scopes; students only `openid email profile` |
| `STAFF_EMAIL_DOMAIN`, `STUDENT_EMAIL_DOMAIN` | `mfu.ac.th`, `lamduan.mfu.ac.th` |
| `ADVISOR_EMAILS`, `ADMIN_EMAILS` | Comma-separated role overrides |
| `DEMO_MODE` | `true` = demo logins + mock Google Classroom. **Set `false` in production** |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` | Empty = offline heuristics (polish / embeddings / summaries). Ollama: `OPENAI_BASE_URL=http://localhost:11434/v1` |
| `CLUSTER_SIMILARITY_THRESHOLD` | Default `0.84` |
| `EXIT_TICKET_WINDOW_SEC` | Default `180` |
| `AUTO_ENROLL_ON_JOIN` | Default `true`: a student who scans the QR is enrolled in that section |
| `MFU_CENTRAL_EVAL_WEBHOOK_URL/API_KEY` | Teaching-evaluation sync target |
| `STORAGE_DIR` | Where synced slide PDFs are stored (default `./storage`) |
| `RUN_WORKERS_IN_SERVER` | `false` to run workers separately with `npm run worker` |

**Google Cloud setup:** enable *Google Classroom API* and *Google Drive API*, create an OAuth client (Web), add the redirect URI `{NEXTAUTH_URL}/api/auth/callback/google` **and** `{NEXTAUTH_URL}/api/auth/callback/google-student`.

---

## Project layout
```
server.ts                       custom server: Next.js + Socket.io + BullMQ workers
prisma/schema.prisma            PRD §5 schema (+ session_attendances)
prisma/migrations/              SQL migration (pgvector + HNSW index)
prisma/seed.ts                  demo data
src/app/(auth)/login            MFU Google SSO + demo login
src/app/(instructor)/dashboard  Teach · Early Warning · Teaching Evaluation · Session Reports
src/app/(instructor)/live/[id]  Zero-Click console
src/app/(student)/join          "Live now" button + PIN keypad
src/app/(student)/join/[code]   student mobile / iPad app
src/app/api/…                   REST API (PRD §7) + slides file, session summary, intervention
src/components/instructor|student|shared
src/lib/                        ai-service, risk-engine, evaluation, pseudonym, google-classroom, queue, …
src/server/socket-server.ts     all Socket.io events (PRD §8)
src/server/workers/             slide-scanner, session-close
```

### Notes and deviations from the PRD
- **Prisma 6 with the Rust-free client (`@prisma/adapter-pg`)** instead of Prisma 5: no query-engine binary, smaller deploys.
- Role / status columns use PostgreSQL enums instead of `VARCHAR + CHECK`; the same values apply.
- Added the `session_attendances` table (needed for AttendanceRate) and `student_risk_metrics.intervention_sent_at`.
- Extra socket events: `instructor:silent_toggle`, `instructor:finalize_now`, `board:fetch`, `board:undo`, `question:variant`, `exit_ticket:progress`, `session:summary_ready`, `session:ended`.
- "Send Intervention Notice" logs the intervention and opens a pre-filled e-mail (student, cc advisor + instructor) in the instructor's mail app; plug in SMTP / MFU mail later if you want server-side sending.
- In demo mode, the default MFU webhook URL is not called; only the payload is validated.
