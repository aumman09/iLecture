/**
 * Demo seed — 1001101 Introduction to Computing (MFU), C-pointer slides (pre-scanned),
 * 36 students with 6 weeks of history (4 at-risk), and a LIVE session "LEC789" with clustered questions.
 *   npm run db:seed
 */
import "../src/server/load-env";
import { prisma } from "../src/lib/db";
import { saveFile } from "../src/lib/storage";
import { buildDemoDeck, C_POINTERS_DECK } from "../src/lib/demo-pdf";
import { generatePseudonym } from "../src/lib/pseudonym";
import { hashedEmbedding, heuristicMuddiest } from "../src/lib/ai-service";
import { recalculateSectionRisk } from "../src/lib/risk-engine";
import { recalculateTeachingEvaluation } from "../src/lib/evaluation";

// deterministic RNG so every reset produces the same demo
let seed = 20261022;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const vec = (t: string) => `[${hashedEmbedding(t).map((x) => x.toFixed(6)).join(",")}]`;

const FIRST = ["Natthapong", "Pimchanok", "Kittipat", "Chanidapa", "Thanakorn", "Siriporn", "Phurin", "Kanokwan", "Jirayu", "Ploypailin", "Weerapat", "Nattanicha", "Sorawit", "Thitima", "Pakorn", "Arisa", "Tanawat", "Benjamas", "Krit", "Wanwisa", "Apisit", "Rattikarn", "Chayut", "Sasithorn", "Panupong", "Kamonchanok", "Teerawat", "Jutamas", "Nuttawut", "Supitcha", "Ekkachai", "Lalita", "Phongsakorn", "Matana", "Warut", "Yada"];
const LAST = ["Srisuk", "Wongsawat", "Chaiyaporn", "Kaewmanee", "Boonmee", "Thongdee", "Rattanakul", "Phromma", "Saengthong", "Inthasorn", "Jantarat", "Suwannarat"];

const PAST_TITLES = [
  "Week 1 - Computing Fundamentals", "Week 2 - Variables & Data Types", "Week 3 - Control Flow",
  "Week 4 - Loops", "Week 5 - Functions", "Week 6 - Arrays & Strings",
];
const MUDDY = [
  "difference between pointer and address", "why we need & before scanf variable", "dereference operator * confusing",
  "when to use malloc vs normal array", "how free works", "nested loops index", "function parameters pass by value",
  "array index starting at 0", "string null terminator", "scope of variables inside functions", "for loop vs while loop",
];

async function main() {
  console.log("Seeding iLecture MFU demo data…");
  await prisma.$executeRawUnsafe(`TRUNCATE users, courses, course_sections, enrollments, slide_decks, slide_metadata, class_sessions,
    questions, question_upvotes, pace_signals, class_board_items, muddiest_feedbacks, session_ai_summaries,
    student_risk_metrics, teaching_evaluation_metrics, session_attendances CASCADE`);

  const instructor = await prisma.user.create({ data: { email: "instructor@mfu.ac.th", fullName: "Aj. Somchai Rakdee (Demo)", role: "INSTRUCTOR" } });
  const advisor = await prisma.user.create({ data: { email: "advisor@mfu.ac.th", fullName: "Aj. Malee Jaidee (Advisor)", role: "ADVISOR" } });
  await prisma.user.create({ data: { email: "instructor2@mfu.ac.th", fullName: "Aj. Second Instructor (Demo)", role: "INSTRUCTOR" } });

  const course = await prisma.course.create({
    data: { googleClassroomId: "mock-course-1001101", courseCode: "1001101", courseNameEn: "Introduction to Computing", semester: "1/2026", instructorId: instructor.id },
  });
  const section = await prisma.courseSection.create({ data: { courseId: course.id, sectionNumber: 1, instructorId: instructor.id } });

  // slide deck (generated PDF) + AI pre-scanned metadata
  const pdf = await buildDemoDeck("1001101 · Introduction to Computing", C_POINTERS_DECK);
  const deck = await prisma.slideDeck.create({
    data: { courseId: course.id, googleDriveFileId: "mock-drive-c-pointers", title: "Week 7 - C Pointers & Memory", fileUrl: "pending", totalPages: C_POINTERS_DECK.length, isProcessed: true },
  });
  await saveFile(`decks/${deck.id}.pdf`, pdf);
  await prisma.slideDeck.update({ where: { id: deck.id }, data: { fileUrl: `storage:decks/${deck.id}.pdf` } });
  await prisma.slideMetadata.createMany({
    data: [
      { slideDeckId: deck.id, pageNumber: 1, category: "Concept Overview", summary: "Introduces pointers as variables that store memory addresses, with the & and * operators.", difficultyLevel: 3, keyTerms: ["pointer", "address-of (&)", "dereference (*)"] },
      { slideDeckId: deck.id, pageNumber: 2, category: "Code Implementation", summary: "Shows dynamic allocation on the heap with malloc() and releasing it with free().", difficultyLevel: 4, keyTerms: ["malloc", "free", "heap", "NULL check"] },
      { slideDeckId: deck.id, pageNumber: 3, category: "Common Pitfalls", summary: "Explains dangling pointers, memory leaks and double free, and how to avoid them.", difficultyLevel: 5, keyTerms: ["dangling pointer", "memory leak", "double free"] },
    ],
  });

  // students
  const students: { id: string; studentId: string; profile: "good" | "ok" | "critical" | "moderate" }[] = [];
  for (let i = 0; i < 36; i++) {
    const studentId = `673150${String(1001 + i)}`;
    const name = `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`;
    const u = await prisma.user.create({ data: { email: `${studentId}@lamduan.mfu.ac.th`, fullName: name, role: "STUDENT", studentId } });
    await prisma.enrollment.create({ data: { createdAt: new Date(Date.now() - 60 * 86400000), sectionId: section.id, studentId, studentUserId: u.id, advisorEmail: i % 3 === 0 ? advisor.email : "advisor2@mfu.ac.th" } });
    // 4 at-risk students: #3 & #9 critical, #15 & #21 moderate
    const profile = i === 3 || i === 9 ? "critical" : i === 15 || i === 21 ? "moderate" : i % 4 === 0 ? "ok" : "good";
    students.push({ id: u.id, studentId, profile });
  }

  // 6 past (ENDED) sessions
  const now = Date.now();
  for (let w = 0; w < PAST_TITLES.length; w++) {
    const started = new Date(now - (PAST_TITLES.length - w) * 7 * 86400000);
    const s = await prisma.classSession.create({
      data: {
        sectionId: section.id, sessionTitle: PAST_TITLES[w], sessionCode: `W${w + 1}${String(100 + w * 37).slice(0, 3)}`,
        status: "ENDED", startedAt: started, endedAt: new Date(started.getTime() + 90 * 60000), currentSlidePage: 3,
      },
    });
    const muddyTexts: string[] = [];
    for (const st of students) {
      const attendP = st.profile === "ok" ? 0.88 : 0.97;
      const attends = st.profile === "critical" ? [0, 2, 4, 5].includes(w) : st.profile === "moderate" ? w !== 3 : rnd() <= attendP;
      if (!attends) continue;
      await prisma.sessionAttendance.create({ data: { sessionId: s.id, studentId: st.studentId, joinedAt: started } });
      const engaged = st.profile === "critical" ? w !== 2 : st.profile === "moderate" ? true : rnd() < 0.9;
      if (!engaged) continue;
      for (let page = 1; page <= 3; page++) {
        if (st.profile !== "critical" && rnd() < 0.5) continue;
        const sig = st.profile === "critical" ? "CONFUSED" : st.profile === "moderate" ? (rnd() < 0.5 ? "CONFUSED" : "TOO_FAST") : rnd() < 0.75 ? "CLEAR" : rnd() < 0.5 ? "TOO_FAST" : "CONFUSED";
        await prisma.paceSignal.create({ data: { sessionId: s.id, slidePage: page, studentId: st.studentId, signalType: sig as "CLEAR" } });
      }
      const rating = st.profile === "critical" ? 1 : st.profile === "moderate" ? (w >= 4 ? 2 : 3) : st.profile === "ok" ? 3 + Math.round(rnd()) : 4 + Math.round(rnd());
      const txt = rnd() < 0.3 ? "Nothing — all clear" : pick(MUDDY);
      muddyTexts.push(txt);
      await prisma.muddiestFeedback.create({ data: { sessionId: s.id, studentId: st.studentId, comprehensionRating: rating, muddiestText: txt, extractedTopic: txt.startsWith("Nothing") ? null : txt } });
    }
    // a few questions per past session (most answered)
    for (let k = 0; k < 4; k++) {
      const st = pick(students);
      const content = pick(["Could you explain the difference between a pointer and an address?", "Why do we start array indexes at zero?", "Can you give another example of a nested loop?", "What happens if we forget the return statement?", "Is there a limit to recursion depth?"]);
      await prisma.question.create({
        data: { sessionId: s.id, slidePage: 1 + (k % 3), studentId: st.studentId, displayPseudonym: generatePseudonym(s.id, st.studentId), rawContent: content, polishedContent: content, isAnswered: rnd() < 0.8, upvoteCount: 1 + Math.floor(rnd() * 12) },
      });
    }
    const topics = heuristicMuddiest(muddyTexts.filter((t) => !t.startsWith("Nothing")));
    const fb = await prisma.muddiestFeedback.aggregate({ where: { sessionId: s.id }, _avg: { comprehensionRating: true } });
    await prisma.sessionAiSummary.create({
      data: { sessionId: s.id, topMuddiestTopics: topics as object[], mostConfusingSlidePage: 1 + (w % 3), avgComprehension: Math.round((fb._avg.comprehensionRating ?? 0) * 100) / 100 },
    });
  }

  // LIVE session with clustered questions
  const live = await prisma.classSession.create({
    data: { sectionId: section.id, slideDeckId: deck.id, sessionTitle: "Week 7 - C Pointers & Memory", sessionCode: "LEC789", status: "LIVE", currentSlidePage: 1 },
  });
  const liveQs: { text: string; raw?: string; page: number; dupes: string[]; votes: number }[] = [
    { text: "What is the difference between *p and &p?", raw: "*p กับ &p ต่างกันยังไงครับ", page: 1, dupes: ["What is the difference between &p and *p?", "How are *p and &p different?"], votes: 9 },
    { text: "Why do we need to check if malloc returns NULL?", page: 2, dupes: ["Why must we check malloc for NULL?"], votes: 5 },
    { text: "Could you give an example of a memory leak in a real program?", page: 3, dupes: [], votes: 3 },
  ];
  let si = 0;
  for (const q of liveQs) {
    const author = students[si++ % students.length];
    await prisma.sessionAttendance.upsert({ where: { sessionId_studentId: { sessionId: live.id, studentId: author.studentId } }, create: { sessionId: live.id, studentId: author.studentId }, update: {} });
    const root = await prisma.question.create({
      data: {
        sessionId: live.id, slideDeckId: deck.id, slidePage: q.page, studentId: author.studentId, displayPseudonym: generatePseudonym(live.id, author.studentId),
        rawContent: q.raw ?? q.text, polishedContent: q.text, clusterSize: 1 + q.dupes.length, upvoteCount: q.votes,
      },
    });
    await prisma.$executeRawUnsafe(`UPDATE questions SET embedding = $1::vector WHERE id = $2::uuid`, vec(q.text), root.id);
    await prisma.questionUpvote.create({ data: { questionId: root.id, studentId: author.studentId } });
    for (const d of q.dupes) {
      const st = students[si++ % students.length];
      const child = await prisma.question.create({
        data: { sessionId: live.id, slideDeckId: deck.id, slidePage: q.page, studentId: st.studentId, displayPseudonym: generatePseudonym(live.id, st.studentId), rawContent: d, polishedContent: d, parentClusterId: root.id, upvoteCount: 0 },
      });
      await prisma.$executeRawUnsafe(`UPDATE questions SET embedding = $1::vector WHERE id = $2::uuid`, vec(d), child.id);
      await prisma.questionUpvote.create({ data: { questionId: root.id, studentId: st.studentId } });
    }
  }

  await recalculateSectionRisk(section.id);
  await recalculateTeachingEvaluation(section.id);
  const risk = await prisma.studentRiskMetric.groupBy({ by: ["riskLevel"], where: { sectionId: section.id }, _count: true });

  console.log("✔ Seed complete");
  console.log("  Instructor : instructor@mfu.ac.th   (demo login)");
  console.log("  Advisor    : advisor@mfu.ac.th");
  console.log("  Students   : 6731501001 … 6731501036 @lamduan.mfu.ac.th");
  console.log("  Live room  : LEC789  → /join/LEC789");
  console.log("  Risk levels:", Object.fromEntries(risk.map((r) => [r.riskLevel, r._count])));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
