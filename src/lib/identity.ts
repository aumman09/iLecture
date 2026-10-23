import { prisma } from "./db";
import { generatePseudonym } from "./pseudonym";

/**
 * How a student appears to classmates and on the projector.
 *  - default: real name, shortened ("Natthapong S.")
 *  - "hide my name" ticked: anonymous pseudonym ("Curious Otter")
 * The real student_id is always stored with every question / vote / board item, so the
 * instructor's Participation analytics stay complete either way.
 */
export interface Identity {
  label: string;
  isAnonymous: boolean;
}

export const STAFF_ID = "STAFF";

export function shortName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Student";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

export async function identityMap(sessionId: string, studentIds: string[]): Promise<Map<string, Identity>> {
  const ids = [...new Set(studentIds.filter((s) => s && s !== STAFF_ID))];
  const out = new Map<string, Identity>();
  out.set(STAFF_ID, { label: "Instructor", isAnonymous: false });
  if (ids.length === 0) return out;
  const [att, users] = await Promise.all([
    prisma.sessionAttendance.findMany({ where: { sessionId, studentId: { in: ids } }, select: { studentId: true, isAnonymous: true } }),
    prisma.user.findMany({ where: { studentId: { in: ids } }, select: { studentId: true, fullName: true, prefersAnonymous: true } }),
  ]);
  const anon = new Map(att.map((a) => [a.studentId, a.isAnonymous]));
  const names = new Map(users.map((u) => [u.studentId!, u]));
  for (const id of ids) {
    const u = names.get(id);
    const isAnonymous = anon.get(id) ?? u?.prefersAnonymous ?? false;
    out.set(id, isAnonymous ? { label: generatePseudonym(sessionId, id), isAnonymous } : { label: u ? shortName(u.fullName) : id, isAnonymous });
  }
  return out;
}

export async function identityOf(sessionId: string, studentId: string): Promise<Identity> {
  return (await identityMap(sessionId, [studentId])).get(studentId) ?? { label: generatePseudonym(sessionId, studentId), isAnonymous: true };
}
