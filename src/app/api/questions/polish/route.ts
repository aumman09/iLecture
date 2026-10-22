import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { polishStudentQuestion } from "@/lib/ai-service";

export const dynamic = "force-dynamic";

/** POST { rawContent } → { polishedContent } (Thai / broken English → academic English) */
export const POST = handle(async (req: Request) => {
  await requireUser();
  const { rawContent } = z.object({ rawContent: z.string().min(1).max(600) }).parse(await req.json());
  const { polished, usedAI } = await polishStudentQuestion(rawContent);
  return json({ polishedContent: polished, usedAI });
});
