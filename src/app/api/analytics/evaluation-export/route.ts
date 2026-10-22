import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { assertSectionAccess } from "@/lib/access";
import { recalculateTeachingEvaluation } from "@/lib/evaluation";

export const dynamic = "force-dynamic";

async function buildPayload(sectionId: string) {
  const m = await recalculateTeachingEvaluation(sectionId);
  const section = await prisma.courseSection.findUniqueOrThrow({ where: { id: sectionId }, include: { course: true } });
  const sessions = await prisma.classSession.findMany({
    where: { sectionId, status: "ENDED" },
    orderBy: { startedAt: "asc" },
    include: { aiSummary: true, _count: { select: { attendances: true, feedbacks: true } } },
  });
  return {
    metric: m,
    payload: {
      schema: "mfu.teaching-evaluation.v1",
      generatedAt: new Date().toISOString(),
      course: { code: section.course.courseCode, nameEn: section.course.courseNameEn, semester: section.course.semester, section: section.sectionNumber },
      instructorEmail: m.instructorEmail,
      totalSessionsHeld: m.totalSessionsHeld,
      clarityIndex: Number(m.clarityIndex),
      responsivenessIndex: Number(m.responsivenessIndex),
      emiDeliveryScore: Number(m.emiDeliveryScore),
      topStrengths: m.topStrengths,
      actionableImprovements: m.actionableImprovements,
      frameworks: ["TQF5 (มคอ.5)", "AUN-QA Criterion 2", "AUN-QA Criterion 3"],
      sessions: sessions.map((s) => ({
        date: s.startedAt.toISOString().slice(0, 10),
        title: s.sessionTitle,
        attended: s._count.attendances,
        exitTickets: s._count.feedbacks,
        avgComprehension: s.aiSummary?.avgComprehension ? Number(s.aiSummary.avgComprehension) : null,
        topMuddiestTopics: s.aiSummary?.topMuddiestTopics ?? [],
      })),
    },
  };
}

/** POST { sectionId } → recalculates, pushes to MFU Central Evaluation webhook, returns metrics. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(["INSTRUCTOR"]);
  const { sectionId } = z.object({ sectionId: z.string().uuid() }).parse(await req.json());
  await assertSectionAccess(user, sectionId);
  const { metric, payload } = await buildPayload(sectionId);

  let synced = false;
  let syncMessage = "";
  if (env.demoMode && env.evalWebhookUrl.includes("eval-api.mfu.ac.th")) {
    synced = true;
    syncMessage = "Demo mode: payload validated (not sent to the real MFU endpoint).";
  } else if (env.evalWebhookUrl) {
    try {
      const r = await fetch(env.evalWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": env.evalApiKey },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      synced = r.ok;
      syncMessage = r.ok ? "Synced to MFU Central Evaluation." : `Central evaluation API responded ${r.status}.`;
    } catch (e) {
      syncMessage = `Could not reach MFU Central Evaluation: ${(e as Error).message}`;
    }
  } else syncMessage = "MFU_CENTRAL_EVAL_WEBHOOK_URL is not configured.";

  if (synced) await prisma.teachingEvaluationMetric.update({ where: { id: metric.id }, data: { syncedToCentralEval: true, syncedAt: new Date() } });
  return json({ ok: true, synced, syncMessage, payload, pdfUrl: `/api/analytics/evaluation-export?sectionId=${sectionId}&format=pdf` });
});

/** GET ?sectionId=&format=pdf → TQF 5 / AUN-QA appendix PDF (format=json returns the payload). */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(["INSTRUCTOR", "ADVISOR"]);
  const url = new URL(req.url);
  const sectionId = url.searchParams.get("sectionId") ?? "";
  await assertSectionAccess(user, sectionId);
  const { payload } = await buildPayload(sectionId);
  if (url.searchParams.get("format") === "json") return json(payload);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 790;
  const crimson = rgb(0.6, 0, 0), slate = rgb(0.2, 0.25, 0.33);
  const text = (t: string, o: { size?: number; b?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {}) => {
    const size = o.size ?? 10.5;
    const f = o.b ? bold : font;
    const maxW = 595 - (o.x ?? 50) - 50;
    const words = t.replace(/[^\x20-\x7E]/g, "").split(" ");
    let line = "";
    const flush = () => {
      if (y < 60) { page = pdf.addPage([595, 842]); y = 790; }
      page.drawText(line, { x: o.x ?? 50, y, size, font: f, color: o.color ?? slate });
      y -= size + 5;
      line = "";
    };
    for (const w of words) {
      const tryLine = line ? line + " " + w : w;
      if (f.widthOfTextAtSize(tryLine, size) > maxW && line) { flush(); line = w; } else line = tryLine;
    }
    if (line) flush();
  };
  page.drawRectangle({ x: 0, y: 822, width: 595, height: 20, color: crimson });
  text("Mae Fah Luang University - iLecture MFU", { size: 9, b: true, color: crimson });
  text("Appendix: Continuous Teaching Evaluation (TQF 5 / AUN-QA Criterion 2 & 3)", { size: 14, b: true, color: rgb(0.06, 0.09, 0.16) });
  y -= 4;
  text(`Course: ${payload.course.code} ${payload.course.nameEn}  |  Section ${payload.course.section}  |  Semester ${payload.course.semester}`);
  text(`Instructor: ${payload.instructorEmail}  |  Generated: ${payload.generatedAt.slice(0, 16).replace("T", " ")} UTC`);
  y -= 8;
  text("1. Summary Indicators", { size: 12, b: true });
  text(`Sessions held: ${payload.totalSessionsHeld}`, { x: 64 });
  text(`Clarity Index: ${payload.clarityIndex.toFixed(2)} / 5.00  (average exit-ticket comprehension)`, { x: 64 });
  text(`Responsiveness Index: ${payload.responsivenessIndex.toFixed(1)}%  (root questions answered / asked)`, { x: 64 });
  text(`EMI Delivery Score: ${payload.emiDeliveryScore.toFixed(2)} / 5.00  (share of 'Clear' pace signals)`, { x: 64 });
  y -= 8;
  text("2. Strengths", { size: 12, b: true });
  ((payload.topStrengths as string[]) ?? []).forEach((s) => text(`- ${s}`, { x: 64 }));
  if (!(payload.topStrengths as string[])?.length) text("- (not enough data yet)", { x: 64 });
  y -= 8;
  text("3. Actionable Improvements (for next semester's TQF 3 revision)", { size: 12, b: true });
  ((payload.actionableImprovements as string[]) ?? []).forEach((s) => text(`- ${s}`, { x: 64 }));
  if (!(payload.actionableImprovements as string[])?.length) text("- (none identified)", { x: 64 });
  y -= 8;
  text("4. Session Log", { size: 12, b: true });
  payload.sessions.forEach((s) => {
    const topics = (s.topMuddiestTopics as { topic: string; percentage: number }[]).map((t) => `${t.topic} (${t.percentage}%)`).join(", ");
    text(`${s.date}  ${s.title}  - attended ${s.attended}, exit tickets ${s.exitTickets}, comprehension ${s.avgComprehension ?? "-"}`, { x: 64, b: true, size: 9.5 });
    if (topics) text(`Muddiest: ${topics}`, { x: 76, size: 9.5 });
  });
  y -= 10;
  text("Data source: anonymous in-class signals and exit tickets collected by iLecture MFU. Individual student identities are not included.", { size: 8.5 });
  const bytes = await pdf.save();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="TQF5-${payload.course.code}-S${payload.course.section}.pdf"`,
    },
  });
});
