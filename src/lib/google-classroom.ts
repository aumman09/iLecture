import { google, type classroom_v1 } from "googleapis";
import { PDFDocument } from "pdf-lib";
import { prisma } from "./db";
import { env, googleConfigured } from "./env";
import { saveFile } from "./storage";
import { enqueue } from "./queue";
import { buildDemoDeck, MOCK_DECKS } from "./demo-pdf";

/**
 * Module A — Google Classroom & Drive service.
 * Falls back to a mock Classroom (with generated PDFs) when Google OAuth is not configured
 * or the instructor signed in through the demo login.
 */

export interface ClassroomCourse {
  googleClassroomId: string;
  name: string;
  section?: string | null;
}
export interface ClassroomMaterial {
  fileId: string;
  title: string;
  mimeType: string;
}

const PDF = "application/pdf";
const GSLIDES = "application/vnd.google-apps.presentation";

async function authClientFor(userId: string) {
  if (!googleConfigured()) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.googleAccessToken && !user?.googleRefreshToken) return null;
  const oauth = new google.auth.OAuth2(env.googleClientId, env.googleClientSecret);
  oauth.setCredentials({ access_token: user.googleAccessToken ?? undefined, refresh_token: user.googleRefreshToken ?? undefined });
  oauth.on("tokens", async (t) => {
    if (t.access_token) await prisma.user.update({ where: { id: userId }, data: { googleAccessToken: t.access_token } });
  });
  return oauth;
}

export async function isMockMode(userId: string) {
  return (await authClientFor(userId)) === null;
}

export async function listTeacherCourses(userId: string): Promise<ClassroomCourse[]> {
  const auth = await authClientFor(userId);
  if (!auth) return [{ googleClassroomId: "mock-course-1001101", name: "1001101 Introduction to Computing", section: "Section 1" }];
  const classroom = google.classroom({ version: "v1", auth });
  const out: ClassroomCourse[] = [];
  let pageToken: string | undefined;
  do {
    const r = await classroom.courses.list({ teacherId: "me", courseStates: ["ACTIVE"], pageSize: 50, pageToken });
    (r.data.courses ?? []).forEach((c: classroom_v1.Schema$Course) => out.push({ googleClassroomId: c.id!, name: c.name ?? "Untitled", section: c.section }));
    pageToken = r.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

export async function listSlideMaterials(userId: string, googleCourseId: string): Promise<ClassroomMaterial[]> {
  const auth = await authClientFor(userId);
  if (!auth) return MOCK_DECKS.map((d) => ({ fileId: d.fileId, title: d.title, mimeType: PDF }));
  const classroom = google.classroom({ version: "v1", auth });
  const r = await classroom.courses.courseWorkMaterials.list({ courseId: googleCourseId, pageSize: 100 });
  const out: ClassroomMaterial[] = [];
  for (const m of r.data.courseWorkMaterial ?? []) {
    for (const a of m.materials ?? []) {
      const f = a.driveFile?.driveFile;
      if (!f?.id) continue;
      out.push({ fileId: f.id, title: f.title ?? m.title ?? "Slides", mimeType: "" });
    }
  }
  // Resolve mime types via Drive and keep only PDFs / Google Slides.
  const drive = google.drive({ version: "v3", auth });
  const resolved: ClassroomMaterial[] = [];
  for (const m of out) {
    try {
      const f = await drive.files.get({ fileId: m.fileId, fields: "id,name,mimeType" });
      if (f.data.mimeType === PDF || f.data.mimeType === GSLIDES) resolved.push({ ...m, title: f.data.name ?? m.title, mimeType: f.data.mimeType! });
    } catch (e) {
      console.warn("[classroom] cannot read drive file", m.fileId, (e as Error).message);
    }
  }
  return resolved;
}

async function downloadAsPdf(userId: string, m: ClassroomMaterial): Promise<Buffer> {
  const auth = await authClientFor(userId);
  if (!auth) {
    const mock = MOCK_DECKS.find((d) => d.fileId === m.fileId) ?? MOCK_DECKS[0];
    return Buffer.from(await buildDemoDeck("1001101 · Introduction to Computing", mock.slides));
  }
  const drive = google.drive({ version: "v3", auth });
  if (m.mimeType === GSLIDES) {
    const r = await drive.files.export({ fileId: m.fileId, mimeType: PDF }, { responseType: "arraybuffer" });
    return Buffer.from(r.data as ArrayBuffer);
  }
  const r = await drive.files.get({ fileId: m.fileId, alt: "media" }, { responseType: "arraybuffer" });
  return Buffer.from(r.data as ArrayBuffer);
}

export function parseCourseCode(name: string): { code: string; title: string } {
  const m = name.match(/^\s*([A-Z]{2,4}\s?\d{3,4}|\d{5,7})\s*[-:·]?\s*(.*)$/i);
  if (m) return { code: m[1].replace(/\s/g, "").toUpperCase(), title: m[2] || name };
  return { code: name.slice(0, 20).toUpperCase(), title: name };
}

export function currentSemester(d = new Date()) {
  // MFU: semester 1 ≈ Jul–Nov, semester 2 ≈ Dec–Apr, summer ≈ May–Jun (academic year starts in July)
  const m = d.getMonth() + 1;
  const ay = m >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  const sem = m >= 7 && m <= 11 ? 1 : m === 12 || m <= 4 ? 2 : 3;
  return `${sem}/${ay}`;
}

/** Sync one Classroom course: upsert course + section, download PDFs, enqueue AI slide scan. */
export async function syncCourse(userId: string, googleCourseId: string) {
  const courses = await listTeacherCourses(userId);
  const gc = courses.find((c) => c.googleClassroomId === googleCourseId);
  if (!gc) throw new Error("Course not found in your Google Classroom");
  const { code, title } = parseCourseCode(gc.name);
  const course = await prisma.course.upsert({
    where: { googleClassroomId: googleCourseId },
    create: { googleClassroomId: googleCourseId, courseCode: code, courseNameEn: title, semester: currentSemester(), instructorId: userId },
    update: { courseCode: code, courseNameEn: title },
  });
  const secNum = Number(gc.section?.match(/\d+/)?.[0] ?? 1);
  await prisma.courseSection.upsert({
    where: { courseId_sectionNumber: { courseId: course.id, sectionNumber: secNum } },
    create: { courseId: course.id, sectionNumber: secNum, instructorId: userId },
    update: {},
  });

  const materials = await listSlideMaterials(userId, googleCourseId);
  const synced: { id: string; title: string; totalPages: number; isNew: boolean }[] = [];
  for (const m of materials) {
    const existing = await prisma.slideDeck.findUnique({ where: { googleDriveFileId: m.fileId } });
    if (existing) {
      synced.push({ id: existing.id, title: existing.title, totalPages: existing.totalPages, isNew: false });
      continue;
    }
    const bytes = await downloadAsPdf(userId, m);
    let totalPages = 1;
    try {
      totalPages = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
    } catch { /* keep 1 */ }
    const deck = await prisma.slideDeck.create({
      data: { courseId: course.id, googleDriveFileId: m.fileId, title: m.title.replace(/\.pdf$/i, ""), fileUrl: "pending", totalPages },
    });
    const key = `decks/${deck.id}.pdf`;
    await saveFile(key, bytes);
    await prisma.slideDeck.update({ where: { id: deck.id }, data: { fileUrl: `storage:${key}` } });
    await enqueue("scan-slide-deck", { slideDeckId: deck.id });
    synced.push({ id: deck.id, title: deck.title, totalPages, isNew: true });
  }
  return { courseId: course.id, courseCode: code, decks: synced };
}
