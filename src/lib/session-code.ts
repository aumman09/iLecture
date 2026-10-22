import { randomInt } from "crypto";
import { prisma } from "./db";

// Human-friendly room code, e.g. "LEC789". Avoids ambiguous letters (I, O).
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export async function generateSessionCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code =
      Array.from({ length: 3 }, () => LETTERS[randomInt(LETTERS.length)]).join("") +
      String(randomInt(100, 1000));
    const exists = await prisma.classSession.findUnique({ where: { sessionCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error("Could not allocate a session code");
}

export const normalizeCode = (code: string) => code.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10);
