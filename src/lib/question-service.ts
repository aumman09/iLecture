import { prisma } from "./db";
import { embed, moderate } from "./ai-service";
import { env } from "./env";
import { generatePseudonym } from "./pseudonym";
import { emitTo, roomAll, roomInstructor } from "@/server/realtime";
import type { QuestionDTO } from "@/types";

const toVector = (v: number[]) => `[${v.map((x) => x.toFixed(6)).join(",")}]`;

export type SubmitResult =
  | { status: "rejected"; reason: string }
  | { status: "new"; question: QuestionDTO }
  | { status: "clustered"; parentQuestionId: string; clusterSize: number; upvoteCount: number; parentContent: string };

/**
 * Module B.3 — moderation → embedding → pgvector nearest root → merge (≥ threshold) or new root.
 */
export async function submitQuestion(input: {
  sessionId: string;
  sessionCode: string;
  slideDeckId: string | null;
  slidePage: number;
  studentId: string;
  rawContent: string;
  polishedContent: string;
}): Promise<SubmitResult> {
  const pseudonym = generatePseudonym(input.sessionId, input.studentId);
  const mod = await moderate(`${input.rawContent}\n${input.polishedContent}`);
  if (mod.flagged) {
    await prisma.question.create({
      data: {
        sessionId: input.sessionId, slideDeckId: input.slideDeckId, slidePage: input.slidePage, studentId: input.studentId,
        displayPseudonym: pseudonym, rawContent: input.rawContent, polishedContent: input.polishedContent, isFlaggedInappropriate: true,
      },
    });
    return { status: "rejected", reason: "Your question was not posted because it may contain inappropriate language." };
  }

  const { vector } = await embed(input.polishedContent);
  const vec = toVector(vector);

  const match = await prisma.$queryRawUnsafe<{ id: string; polished_content: string; similarity: number }[]>(
    `SELECT id, polished_content, (1 - (embedding <=> $1::vector)) AS similarity
       FROM questions
      WHERE session_id = $2::uuid AND parent_cluster_id IS NULL AND is_flagged_inappropriate = FALSE
        AND is_answered = FALSE AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector ASC
      LIMIT 1`,
    vec,
    input.sessionId
  );
  const best = match[0];

  if (best && Number(best.similarity) >= env.clusterThreshold) {
    const result = await prisma.$transaction(async (tx) => {
      const child = await tx.question.create({
        data: {
          sessionId: input.sessionId, slideDeckId: input.slideDeckId, slidePage: input.slidePage, studentId: input.studentId,
          displayPseudonym: pseudonym, rawContent: input.rawContent, polishedContent: input.polishedContent, parentClusterId: best.id,
          upvoteCount: 0,
        },
      });
      await tx.$executeRawUnsafe(`UPDATE questions SET embedding = $1::vector WHERE id = $2::uuid`, vec, child.id);
      // Asking a similar question counts as a vote — but only once per student.
      const inserted = await tx.$executeRawUnsafe(
        `INSERT INTO question_upvotes (question_id, student_id) VALUES ($1::uuid, $2) ON CONFLICT DO NOTHING`,
        best.id, input.studentId
      );
      return tx.question.update({
        where: { id: best.id },
        data: { clusterSize: { increment: 1 }, ...(inserted > 0 ? { upvoteCount: { increment: 1 } } : {}) },
      });
    });
    const payload = { parentQuestionId: result.id, clusterSize: result.clusterSize, upvoteCount: result.upvoteCount };
    await emitTo(roomAll(input.sessionCode), "question:clustered", payload);
    await emitTo(roomInstructor(input.sessionCode), "question:variant", { parentQuestionId: result.id, polishedContent: input.polishedContent });
    return { status: "clustered", ...payload, parentContent: result.polishedContent };
  }

  const q = await prisma.question.create({
    data: {
      sessionId: input.sessionId, slideDeckId: input.slideDeckId, slidePage: input.slidePage, studentId: input.studentId,
      displayPseudonym: pseudonym, rawContent: input.rawContent, polishedContent: input.polishedContent,
    },
  });
  await prisma.$executeRawUnsafe(`UPDATE questions SET embedding = $1::vector WHERE id = $2::uuid`, vec, q.id);
  await prisma.questionUpvote.create({ data: { questionId: q.id, studentId: input.studentId } });

  const dto: QuestionDTO = {
    id: q.id, slidePage: q.slidePage, displayPseudonym: q.displayPseudonym, polishedContent: q.polishedContent,
    upvoteCount: q.upvoteCount, clusterSize: q.clusterSize, isPinned: false, isAnswered: false, createdAt: q.createdAt.toISOString(),
  };
  await emitTo(roomAll(input.sessionCode), "question:new", dto);
  return { status: "new", question: { ...dto, mine: true, votedByMe: true } };
}

/** Atomic upvote (one per student). Returns the new count or null if already voted. */
export async function upvoteQuestion(questionId: string, studentId: string) {
  return prisma.$transaction(async (tx) => {
    const inserted = await tx.$executeRawUnsafe(
      `INSERT INTO question_upvotes (question_id, student_id) VALUES ($1::uuid, $2) ON CONFLICT DO NOTHING`,
      questionId, studentId
    );
    if (inserted === 0) return null;
    const q = await tx.question.update({ where: { id: questionId }, data: { upvoteCount: { increment: 1 } }, select: { upvoteCount: true } });
    return q.upvoteCount;
  });
}

export async function removeUpvote(questionId: string, studentId: string) {
  return prisma.$transaction(async (tx) => {
    const deleted = await tx.questionUpvote.deleteMany({ where: { questionId, studentId } });
    if (deleted.count === 0) return null;
    const q = await tx.question.update({ where: { id: questionId }, data: { upvoteCount: { decrement: 1 } }, select: { upvoteCount: true } });
    return q.upvoteCount;
  });
}
