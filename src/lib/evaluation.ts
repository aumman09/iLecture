import { prisma } from "./db";

/**
 * Module F — Continuous Teaching Evaluation.
 *  Clarity Index (0–5)          = average exit-ticket comprehension rating across all held sessions
 *  Responsiveness Index (0–100) = answered root questions / root questions asked × 100
 *  EMI Delivery Score (0–5)     = CLEAR / (CLEAR + TOO_FAST + CONFUSED) × 5
 */
export async function recalculateTeachingEvaluation(sectionId: string) {
  const section = await prisma.courseSection.findUnique({
    where: { id: sectionId },
    include: { instructor: true, course: { include: { instructor: true } } },
  });
  if (!section) throw new Error("Section not found");
  const sessions = await prisma.classSession.findMany({
    where: { sectionId, status: { in: ["ENDED", "EXIT_TICKET"] } },
    select: { id: true },
  });
  const ids = sessions.map((s) => s.id);

  const [ratingAgg, rootAsked, rootAnswered, paceGroups, summaries] = await Promise.all([
    prisma.muddiestFeedback.aggregate({ where: { sessionId: { in: ids } }, _avg: { comprehensionRating: true }, _count: true }),
    prisma.question.count({ where: { sessionId: { in: ids }, parentClusterId: null, isFlaggedInappropriate: false } }),
    prisma.question.count({ where: { sessionId: { in: ids }, parentClusterId: null, isFlaggedInappropriate: false, isAnswered: true } }),
    prisma.paceSignal.groupBy({ by: ["signalType"], where: { sessionId: { in: ids } }, _count: true }),
    prisma.sessionAiSummary.findMany({ where: { sessionId: { in: ids } }, select: { topMuddiestTopics: true } }),
  ]);

  const clarity = ratingAgg._avg.comprehensionRating ?? 0;
  const responsiveness = rootAsked ? (rootAnswered / rootAsked) * 100 : 0;
  const pace = Object.fromEntries(paceGroups.map((p) => [p.signalType, p._count])) as Record<string, number>;
  const totalPace = (pace.CLEAR || 0) + (pace.TOO_FAST || 0) + (pace.CONFUSED || 0);
  const emi = totalPace ? ((pace.CLEAR || 0) / totalPace) * 5 : 0;

  const strengths: string[] = [];
  const improvements: string[] = [];
  if (clarity >= 4) strengths.push("Students consistently report high comprehension (Clarity ≥ 4.0).");
  else if (clarity > 0 && clarity < 3.5) improvements.push("Comprehension is below target — schedule a 5-minute recap of the top muddiest topic at the start of the next class.");
  if (responsiveness >= 80) strengths.push("Highly responsive to student questions (≥ 80% answered).");
  else if (rootAsked > 0) improvements.push(`Answer more live questions — ${rootAsked - rootAnswered} of ${rootAsked} were left unanswered. Try a 2-minute Q&A break every 15 minutes.`);
  if (emi >= 3.75) strengths.push("EMI delivery pace is well-received by students.");
  else if (totalPace > 0 && (pace.TOO_FAST || 0) >= (pace.CONFUSED || 0)) improvements.push("Many 'Too Fast' signals — slow down on dense slides and pause after key definitions.");
  else if (totalPace > 0) improvements.push("Frequent 'Confused' signals — add a worked example or a visual for abstract concepts.");

  // recurring muddy topics across sessions
  const topicFreq = new Map<string, number>();
  summaries.forEach((s) => (s.topMuddiestTopics as { topic: string }[] | null)?.forEach((t) => topicFreq.set(t.topic, (topicFreq.get(t.topic) || 0) + 1)));
  const recurring = [...topicFreq.entries()].filter(([, n]) => n >= 2).map(([t]) => t);
  if (recurring.length) improvements.push(`Recurring muddy topics: ${recurring.slice(0, 3).join(", ")} — consider a supplementary material or tutorial.`);

  const instructorEmail = section.instructor?.email ?? section.course.instructor?.email ?? "unknown@mfu.ac.th";
  const data = {
    instructorEmail,
    totalSessionsHeld: ids.length,
    clarityIndex: round2(clarity),
    responsivenessIndex: round2(responsiveness),
    emiDeliveryScore: round2(emi),
    topStrengths: strengths,
    actionableImprovements: improvements,
  };
  return prisma.teachingEvaluationMetric.upsert({
    where: { sectionId },
    create: { sectionId, ...data },
    update: { ...data },
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;
