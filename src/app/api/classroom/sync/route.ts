import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isMockMode, listTeacherCourses, syncCourse } from "@/lib/google-classroom";

export const dynamic = "force-dynamic";

/** GET → list the instructor's active Google Classroom courses (for the picker). */
export const GET = handle(async () => {
  const user = await requireUser(["INSTRUCTOR"]);
  const [courses, mock] = await Promise.all([listTeacherCourses(user.id), isMockMode(user.id)]);
  return json({ courses, mock });
});

/** POST { courseId } → sync course + PDF/Slides materials, enqueue AI slide scan. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(["INSTRUCTOR"]);
  const { courseId } = z.object({ courseId: z.string().min(1) }).parse(await req.json());
  const result = await syncCourse(user.id, courseId);
  return json({ ok: true, ...result, mock: await isMockMode(user.id) });
});
