import { handle, json } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSectionAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

/** Points per action used for the participation score (shown in the UI legend). */
const WEIGHTS = { questions: 3, ideas: 2, exitTickets: 2, votes: 1, likes: 1, paceTaps: 0.5, strokes: 0.2 } as const;

interface Row {
  studentId: string;
  name: string;
  email: string | null;
  attended: number;
  hiddenName: number; // sessions in which the student ticked "hide my name"
  questions: number;
  votes: number;
  paceTaps: number;
  ideas: number;
  strokes: number;
  likes: number;
  exitTickets: number;
  avgRating: number | null;
  score: number;
}

/**
 * GET ?sectionId=&sessionId=(optional)&format=csv
 * Per-student participation, counted from the real student_id stored with every interaction —
 * including posts the student made with "hide my name" ticked (classmates never saw the name).
 */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(["INSTRUCTOR"]);
  const url = new URL(req.url);
  const sectionId = url.searchParams.get("sectionId") ?? "";
  const sessionId = url.searchParams.get("sessionId");
  const section = await assertSectionAccess(user, sectionId);

  const sessions = await prisma.classSession.findMany({
    where: { sectionId, ...(sessionId ? { id: sessionId } : {}) },
    select: { id: true, sessionTitle: true, startedAt: true },
    orderBy: { startedAt: "desc" },
  });
  if (sessionId && sessions.length === 0) throw new HttpError(404, "Session not found");
  const ids = sessions.map((s) => s.id);
  if (ids.length === 0) return json({ sessions: [], rows: [], weights: WEIGHTS, totals: null });

  type C = { student_id: string; n: bigint | number };
  const count = (sql: string) => prisma.$queryRawUnsafe<C[]>(sql, ids);
  const [att, hidden, qs, votes, pace, ideas, strokes, likes, tickets, ratings, enrolled] = await Promise.all([
    count(`SELECT student_id, COUNT(*) n FROM session_attendances WHERE session_id = ANY($1::uuid[]) GROUP BY 1`),
    count(`SELECT student_id, COUNT(*) n FROM session_attendances WHERE session_id = ANY($1::uuid[]) AND is_anonymous GROUP BY 1`),
    count(`SELECT student_id, COUNT(*) n FROM questions WHERE session_id = ANY($1::uuid[]) AND NOT is_flagged_inappropriate GROUP BY 1`),
    // votes on other people's questions (the automatic "own question" vote is excluded)
    count(`SELECT u.student_id, COUNT(*) n FROM question_upvotes u JOIN questions q ON q.id = u.question_id
            WHERE q.session_id = ANY($1::uuid[]) AND q.student_id <> u.student_id GROUP BY 1`),
    count(`SELECT student_id, COUNT(*) n FROM pace_signals WHERE session_id = ANY($1::uuid[]) GROUP BY 1`),
    count(`SELECT student_id, COUNT(*) n FROM class_board_items WHERE session_id = ANY($1::uuid[]) AND item_type = 'STICKY_NOTE' GROUP BY 1`),
    count(`SELECT student_id, COUNT(*) n FROM class_board_items WHERE session_id = ANY($1::uuid[]) AND item_type = 'DRAWING_PATH' GROUP BY 1`),
    count(`SELECT l.v AS student_id, COUNT(*) n FROM class_board_items b,
            LATERAL jsonb_array_elements_text(COALESCE(b.payload_json->'likedBy','[]'::jsonb)) AS l(v)
            WHERE b.session_id = ANY($1::uuid[]) GROUP BY 1`),
    count(`SELECT student_id, COUNT(*) n FROM muddiest_feedbacks WHERE session_id = ANY($1::uuid[]) GROUP BY 1`),
    prisma.$queryRawUnsafe<{ student_id: string; avg: number }[]>(
      `SELECT student_id, AVG(comprehension_rating)::float avg FROM muddiest_feedbacks WHERE session_id = ANY($1::uuid[]) GROUP BY 1`, ids),
    prisma.enrollment.findMany({ where: { sectionId }, include: { studentUser: true } }),
  ]);

  const m = (rows: C[]) => new Map(rows.map((r) => [r.student_id, Number(r.n)]));
  const A = m(att), H = m(hidden), Q = m(qs), V = m(votes), P = m(pace), I = m(ideas), S = m(strokes), L = m(likes), T = m(tickets);
  const R = new Map(ratings.map((r) => [r.student_id, r.avg]));

  // everyone enrolled + anyone who interacted without being enrolled
  const all = new Map<string, { name: string; email: string | null }>();
  enrolled.forEach((e) => all.set(e.studentId, { name: e.studentUser?.fullName ?? e.studentId, email: e.studentUser?.email ?? null }));
  const extra = [...A.keys()].filter((k) => !all.has(k) && k !== "STAFF");
  if (extra.length) {
    const users = await prisma.user.findMany({ where: { studentId: { in: extra } } });
    extra.forEach((id) => { const u = users.find((x) => x.studentId === id); all.set(id, { name: u?.fullName ?? id, email: u?.email ?? null }); });
  }

  const rows: Row[] = [...all.entries()].map(([studentId, u]) => {
    const r: Row = {
      studentId, name: u.name, email: u.email,
      attended: A.get(studentId) ?? 0, hiddenName: H.get(studentId) ?? 0,
      questions: Q.get(studentId) ?? 0, votes: V.get(studentId) ?? 0, paceTaps: P.get(studentId) ?? 0,
      ideas: I.get(studentId) ?? 0, strokes: S.get(studentId) ?? 0, likes: L.get(studentId) ?? 0,
      exitTickets: T.get(studentId) ?? 0, avgRating: R.has(studentId) ? Math.round(R.get(studentId)! * 100) / 100 : null,
      score: 0,
    };
    r.score = Math.round(
      (r.questions * WEIGHTS.questions + r.ideas * WEIGHTS.ideas + r.exitTickets * WEIGHTS.exitTickets + r.votes * WEIGHTS.votes +
        r.likes * WEIGHTS.likes + r.paceTaps * WEIGHTS.paceTaps + Math.min(r.strokes, 25) * WEIGHTS.strokes) * 10
    ) / 10;
    return r;
  }).sort((a, b) => b.score - a.score || b.attended - a.attended || a.name.localeCompare(b.name));

  if (url.searchParams.get("format") === "csv") {
    const head = ["student_id", "name", "email", "sessions_attended", "sessions_name_hidden", "questions", "votes_given", "pace_taps", "ideas_notes", "drawing_strokes", "likes_given", "exit_tickets", "avg_rating", "participation_score"];
    const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [head.join(","), ...rows.map((r) => [r.studentId, r.name, r.email, r.attended, r.hiddenName, r.questions, r.votes, r.paceTaps, r.ideas, r.strokes, r.likes, r.exitTickets, r.avgRating, r.score].map(esc).join(","))];
    const scope = sessionId ? sessions[0].sessionTitle.replace(/[^\w-]+/g, "_") : "all-sessions";
    return new Response("﻿" + lines.join("\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="participation-${section.course.courseCode}-S${section.sectionNumber}-${scope}.csv"` },
    });
  }

  const active = rows.filter((r) => r.score > 0).length;
  return json({
    sessions: sessions.map((s) => ({ id: s.id, title: s.sessionTitle, startedAt: s.startedAt })),
    weights: WEIGHTS,
    totals: {
      students: rows.length,
      active,
      silent: rows.filter((r) => r.attended > 0 && r.score === 0).length,
      usedHideName: rows.filter((r) => r.hiddenName > 0).length,
      questions: rows.reduce((a, r) => a + r.questions, 0),
      ideas: rows.reduce((a, r) => a + r.ideas, 0),
    },
    rows,
  });
});
