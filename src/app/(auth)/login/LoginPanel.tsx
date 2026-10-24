"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { GraduationCap, Presentation, Sparkles, UserRound } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";

const ERRORS: Record<string, string> = {
  domain: "Please use your MFU Google account (@mfu.ac.th or @lamduan.mfu.ac.th).",
  "use-student": "Students: please use the “I'm a student” button.",
  CredentialsSignin: "Demo login failed — is the database seeded?",
  AccessDenied: "Access denied for this account.",
};

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function LoginPanel(props: {
  callbackUrl?: string; error?: string; googleEnabled: boolean; demoMode: boolean; studentFlow: boolean;
  studentDomain: string; staffDomain: string; demoStudents: { email: string; name: string; studentId: string }[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const studentCb = props.callbackUrl ?? "/join";
  const staffCb = props.callbackUrl ?? "/dashboard";

  const demo = (email: string, name = "", cb = staffCb) => {
    setBusy(email);
    signIn("demo", { email, name, callbackUrl: cb });
  };
  const randomStudent = () => {
    const id = `6831${String(Math.floor(100000 + Math.random() * 899999))}`;
    demo(`${id}@${props.studentDomain}`, `Guest-${id.slice(-4)}`, studentCb);
  };

  return (
    <main className="min-h-dvh-screen flex flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="text-2xl" />
          <p className="mt-3 text-sm text-slate-500">สอบใช้ iProctor • บรรยายใช้ iLecture</p>
        </div>

        {props.error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{ERRORS[props.error] ?? "Sign-in failed. Please try again."}</div>
        )}

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {props.googleEnabled ? (
            <>
              <Button size="xl" className="w-full" onClick={() => { setBusy("student"); signIn("google-student", { callbackUrl: studentCb }); }} loading={busy === "student"}>
                <GraduationCap className="h-6 w-6" /> I&apos;m a student
              </Button>
              <p className="-mt-1 text-center text-xs text-slate-400">@{props.studentDomain} · one tap, no extra permissions</p>
              {!props.studentFlow && (
                <Button size="lg" variant="secondary" className="w-full" onClick={() => { setBusy("staff"); signIn("google", { callbackUrl: staffCb }); }} loading={busy === "staff"}>
                  <GoogleG /> Instructor / Advisor sign in
                </Button>
              )}
            </>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Google OAuth is not configured yet (set GOOGLE_CLIENT_ID / SECRET). Use the demo accounts below.
            </p>
          )}
        </div>

        {props.demoMode && (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Sparkles className="h-3.5 w-3.5 text-amber-600" /> Demo mode
            </div>
            <div className="space-y-2">
              <Button size="lg" className="w-full" onClick={randomStudent} loading={busy?.startsWith("68")}>
                <GraduationCap className="h-5 w-5" /> Join as a new demo student
              </Button>
              {!props.studentFlow && (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => demo(`instructor@${props.staffDomain}`)} loading={busy === `instructor@${props.staffDomain}`}>
                    <Presentation className="h-4 w-4" /> Instructor
                  </Button>
                  <Button variant="secondary" onClick={() => demo(`advisor@${props.staffDomain}`)} loading={busy === `advisor@${props.staffDomain}`}>
                    <UserRound className="h-4 w-4" /> Advisor
                  </Button>
                </div>
              )}
              {props.demoStudents.length > 0 && (
                <details className="pt-1">
                  <summary className="cursor-pointer text-xs text-slate-500">Seeded students</summary>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {props.demoStudents.map((s) => (
                      <button key={s.email} onClick={() => demo(s.email, s.name, studentCb)} className="truncate rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-xs hover:bg-slate-50">
                        <span className="font-mono text-slate-500">{s.studentId}</span>
                        <br />
                        {s.name}
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        )}
        <p className="mt-6 text-center text-xs text-slate-400">Mae Fah Luang University · English Medium of Instruction</p>
      </div>
    </main>
  );
}
