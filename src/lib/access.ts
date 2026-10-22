import { prisma } from "./db";
import { HttpError, type AppUser } from "./auth";
import { createHash } from "crypto";

/** Sections an instructor teaches (or every section for ADMIN). */
export async function sectionsForUser(user: AppUser) {
  const where =
    user.role === "ADMIN"
      ? {}
      : user.role === "ADVISOR"
        ? { enrollments: { some: { advisorEmail: user.email } } }
        : { OR: [{ instructorId: user.id }, { course: { instructorId: user.id } }] };
  return prisma.courseSection.findMany({
    where,
    include: { course: true, _count: { select: { enrollments: true, sessions: true } } },
    orderBy: [{ course: { courseCode: "asc" } }, { sectionNumber: "asc" }],
  });
}

export async function assertSectionAccess(user: AppUser, sectionId: string) {
  const s = await prisma.courseSection.findUnique({ where: { id: sectionId }, include: { course: true } });
  if (!s) throw new HttpError(404, "Section not found");
  if (user.role === "ADMIN") return s;
  if (user.role === "INSTRUCTOR" && (s.instructorId === user.id || s.course.instructorId === user.id)) return s;
  if (user.role === "ADVISOR") {
    const any = await prisma.enrollment.findFirst({ where: { sectionId, advisorEmail: user.email } });
    if (any) return s;
  }
  throw new HttpError(403, "You do not have access to this section");
}

/** Stable anonymous label used for LOW / MODERATE risk students. */
export function anonLabel(sectionId: string, studentId: string) {
  return "Student #" + createHash("sha256").update(`${sectionId}:${studentId}:${process.env.NEXTAUTH_SECRET ?? ""}`).digest("hex").slice(0, 5).toUpperCase();
}
