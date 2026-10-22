import type { NextAuthOptions, Session } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./db";
import { env, googleConfigured } from "./env";
import type { Role } from "@/types";

export const INSTRUCTOR_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

/** Map an e-mail address to a role. Returns null when the domain is not allowed. */
export function roleForEmail(email: string): { role: Role; studentId: string | null } | null {
  const e = email.toLowerCase();
  if (e.endsWith("@" + env.studentDomain)) {
    const local = e.split("@")[0];
    return { role: "STUDENT", studentId: local.replace(/[^a-z0-9]/g, "").slice(0, 20) };
  }
  if (e.endsWith("@" + env.staffDomain)) {
    if (env.adminEmails.includes(e)) return { role: "ADMIN", studentId: null };
    if (env.advisorEmails.includes(e)) return { role: "ADVISOR", studentId: null };
    return { role: "INSTRUCTOR", studentId: null };
  }
  return null;
}

async function upsertUser(email: string, name: string, tokens?: { access?: string | null; refresh?: string | null }) {
  const mapped = roleForEmail(email);
  if (!mapped) return null;
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        fullName: name || existing.fullName,
        ...(tokens?.access ? { googleAccessToken: tokens.access } : {}),
        ...(tokens?.refresh ? { googleRefreshToken: tokens.refresh } : {}),
      },
    });
  }
  return prisma.user.create({
    data: {
      email: email.toLowerCase(),
      fullName: name || email.split("@")[0],
      role: mapped.role,
      studentId: mapped.studentId,
      googleAccessToken: tokens?.access ?? null,
      googleRefreshToken: tokens?.refresh ?? null,
    },
  });
}

const providers: NextAuthOptions["providers"] = [];

if (googleConfigured()) {
  // Staff: requests Classroom + Drive read-only scopes for slide auto-sync.
  providers.push(
    GoogleProvider({
      id: "google",
      name: "MFU Google (Staff)",
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      authorization: { params: { scope: INSTRUCTOR_SCOPES, access_type: "offline", prompt: "consent", hd: env.staffDomain } },
    })
  );
  // Students: basic profile only — no extra consent screens, one tap.
  providers.push(
    GoogleProvider({
      id: "google-student",
      name: "MFU Google (Student)",
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      authorization: { params: { scope: "openid email profile", hd: env.studentDomain, prompt: "select_account" } },
    })
  );
}

if (env.demoMode) {
  providers.push(
    CredentialsProvider({
      id: "demo",
      name: "Demo login",
      credentials: { email: { label: "Email", type: "email" }, name: { label: "Name", type: "text" } },
      async authorize(creds) {
        const email = String(creds?.email || "").trim().toLowerCase();
        if (!email || !roleForEmail(email)) return null;
        const user = await upsertUser(email, String(creds?.name || ""));
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.fullName };
      },
    })
  );
}

export const authOptions: NextAuthOptions = {
  secret: env.nextAuthSecret,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 120 }, // one semester — students should never need to log in twice
  pages: { signIn: "/login", error: "/login" },
  providers,
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      if (account?.provider === "demo") return true;
      const mapped = roleForEmail(user.email);
      if (!mapped) return "/login?error=domain";
      if (account?.provider === "google" && mapped.role === "STUDENT") return "/login?error=use-student";
      await upsertUser(user.email, user.name || "", { access: account?.access_token, refresh: account?.refresh_token });
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email || !token.uid) {
        const email = (user?.email || token.email || "").toLowerCase();
        if (email) {
          const u = await prisma.user.findUnique({ where: { email } });
          if (u) {
            token.uid = u.id;
            token.role = u.role;
            token.studentId = u.studentId;
            token.name = u.fullName;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as Role;
        session.user.studentId = (token.studentId as string | null) ?? null;
      }
      return session;
    },
  },
};

export type AppUser = { id: string; email: string; name: string; role: Role; studentId: string | null };

export async function getCurrentUser(): Promise<AppUser | null> {
  const s = (await getServerSession(authOptions)) as Session | null;
  if (!s?.user?.id) return null;
  return { id: s.user.id, email: s.user.email!, name: s.user.name ?? "", role: s.user.role, studentId: s.user.studentId };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireUser(roles?: Role[]): Promise<AppUser> {
  const u = await getCurrentUser();
  if (!u) throw new HttpError(401, "Not signed in");
  if (roles && !roles.includes(u.role) && u.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  return u;
}

export const STAFF_ROLES: Role[] = ["INSTRUCTOR", "ADVISOR", "ADMIN"];
