"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { AlertTriangle, BarChart3, BookOpen, CheckCircle2, HandHeart, ClipboardCheck, FileText, Loader2, LogOut, Play, Radio, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { RetentionTable } from "./RetentionTable";
import { EvalSummary } from "./EvalSummary";
import { SessionReport } from "./SessionReport";
import { ParticipationTable } from "./ParticipationTable";

export interface SectionVM { id: string; courseId: string; courseCode: string; courseName: string; semester: string; sectionNumber: number; googleClassroomId: string | null; students: number; sessionsHeld: number; critical: number; moderate: number }
export interface DeckVM { id: string; courseId: string; title: string; totalPages: number; isProcessed: boolean; syncedAt: string }
export interface SessionVM { id: string; sectionId: string; code: string; title: string; status: string; startedAt: string; attended: number; feedbacks: number; questions: number; avgComprehension: number | null; topTopic: string | null }

type Tab = "teach" | "warning" | "participation" | "evaluation" | "reports";

export function Dashboard({ user, sections, decks, sessions, mockClassroom, initialTab, initialSession }: {
  user: { name: string; email: string; role: string }; sections: SectionVM[]; decks: DeckVM[]; sessions: SessionVM[];
  mockClassroom: boolean; initialTab?: string; initialSession?: string;
}) {
  const router = useRouter();
  const isAdvisor = user.role === "ADVISOR";
  const [tab, setTab] = useState<Tab>(isAdvisor ? "warning" : ((initialTab as Tab) ?? "teach"));
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [starting, setStarting] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [reportId, setReportId] = useState<string | null>(initialSession ?? null);
  const section = sections.find((s) => s.id === sectionId);
  const liveSessions = sessions.filter((s) => s.status !== "ENDED");

  const start = async (deckId: string | null) => {
    if (!section) return;
    setStarting(deckId ?? "blank");
    const r = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionId: section.id, slideDeckId: deckId }) });
    const j = await r.json();
    if (r.ok) router.push(`/live/${j.sessionId}`);
    else { setStarting(null); alert(j.error ?? "Could not start session"); }
  };

  const tabs: { key: Tab; label: string; icon: React.ElementType; hidden?: boolean; badge?: number }[] = [
    { key: "teach", label: "Teach", icon: Play, hidden: isAdvisor },
    { key: "warning", label: "Early Warning", icon: ShieldAlert, badge: sections.reduce((a, s) => a + s.critical, 0) },
    { key: "participation", label: "Participation", icon: HandHeart, hidden: isAdvisor },
    { key: "evaluation", label: "Teaching Evaluation", icon: ClipboardCheck, hidden: isAdvisor },
    { key: "reports", label: "Session Reports", icon: BarChart3, hidden: isAdvisor },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <span className="hidden text-xs text-slate-400 sm:inline">สอบใช้ iProctor • บรรยายใช้ iLecture</span>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium text-slate-800">{user.name}</div>
              <div className="text-[11px] text-slate-500">{user.email} · {user.role.toLowerCase()}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => signOut({ callbackUrl: "/login" })} title="Sign out"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 no-scrollbar sm:px-6">
          {tabs.filter((t) => !t.hidden).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={cn("flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium", tab === t.key ? "border-mfu text-mfu" : "border-transparent text-slate-500 hover:text-slate-800")}>
              <t.icon className="h-4 w-4" />{t.label}
              {!!t.badge && <span className="rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white">{t.badge}</span>}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {sections.length === 0 ? (
          <Card className="p-10 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 text-lg font-semibold">No courses yet</h2>
            <p className="mt-1 text-sm text-slate-500">{isAdvisor ? "None of your advisees are enrolled in an iLecture course yet." : "Sync your Google Classroom to import courses and slides."}</p>
            {!isAdvisor && <Button className="mt-5" onClick={() => setSyncOpen(true)}><RefreshCw className="h-4 w-4" /> Sync Google Classroom</Button>}
          </Card>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium shadow-sm">
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.courseCode} {s.courseName} · Sec {s.sectionNumber} ({s.semester})</option>
                ))}
              </select>
              {section && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Users className="h-4 w-4" />{section.students} students · {section.sessionsHeld} sessions
                  {section.critical > 0 && <Badge tone="red"><AlertTriangle className="h-3 w-3" />{section.critical} critical</Badge>}
                  {section.moderate > 0 && <Badge tone="amber">{section.moderate} moderate</Badge>}
                </div>
              )}
              {!isAdvisor && <Button variant="secondary" className="ml-auto" onClick={() => setSyncOpen(true)}><RefreshCw className="h-4 w-4" /> Sync Google Classroom</Button>}
            </div>

            {tab === "teach" && section && (
              <div className="space-y-6">
                {liveSessions.filter((s) => s.sectionId === section.id).map((s) => (
                  <Card key={s.id} className="flex flex-wrap items-center gap-4 border-emerald-200 bg-emerald-50/50 p-4">
                    <Radio className="h-5 w-5 text-emerald-600" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900">{s.title}</div>
                      <div className="text-sm text-slate-500">PIN <span className="font-mono font-semibold text-slate-700">{s.code}</span> · {s.status === "LIVE" ? "Live now" : "Exit ticket open"} · {s.attended} joined</div>
                    </div>
                    <Button variant="success" onClick={() => router.push(`/live/${s.id}`)}><Play className="h-4 w-4" /> Resume console</Button>
                  </Card>
                ))}

                <div>
                  <h2 className="mb-3 text-base font-semibold text-slate-900">Start a class — pick today&apos;s slides</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {decks.filter((d) => d.courseId === section.courseId).map((d) => (
                      <Card key={d.id} className="flex flex-col p-5">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mfu/10"><FileText className="h-5 w-5 text-mfu" /></div>
                          <div className="min-w-0">
                            <div className="font-semibold leading-snug text-slate-900">{d.title}</div>
                            <div className="mt-0.5 text-xs text-slate-500">{d.totalPages} slides · synced {new Date(d.syncedAt).toLocaleDateString()}</div>
                          </div>
                        </div>
                        <div className="mt-3">{d.isProcessed ? <Badge tone="green"><CheckCircle2 className="h-3 w-3" />AI pre-scanned</Badge> : <Badge tone="amber"><Loader2 className="h-3 w-3 animate-spin" />Scanning slides…</Badge>}</div>
                        <Button className="mt-4 w-full" size="lg" loading={starting === d.id} onClick={() => start(d.id)}><Play className="h-4 w-4" /> Start live class</Button>
                      </Card>
                    ))}
                    <Card className="flex flex-col items-center justify-center border-dashed p-5 text-center">
                      <p className="text-sm text-slate-500">No slides today?</p>
                      <Button variant="secondary" className="mt-3" loading={starting === "blank"} onClick={() => start(null)}>Start without slides</Button>
                    </Card>
                  </div>
                </div>
              </div>
            )}

            {tab === "warning" && section && <RetentionTable sectionId={section.id} isAdvisor={isAdvisor} />}
            {tab === "participation" && section && <ParticipationTable sectionId={section.id} />}
            {tab === "evaluation" && section && <EvalSummary sectionId={section.id} />}
            {tab === "reports" && section && (
              <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
                <Card className="divide-y divide-slate-100 self-start">
                  {sessions.filter((s) => s.sectionId === section.id).map((s) => (
                    <button key={s.id} onClick={() => setReportId(s.id)} className={cn("block w-full px-4 py-3 text-left hover:bg-slate-50", reportId === s.id && "bg-slate-50")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">{s.title}</span>
                        <Badge tone={s.status === "ENDED" ? "slate" : "green"}>{s.status === "ENDED" ? new Date(s.startedAt).toLocaleDateString() : "live"}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {s.attended} attended · {s.questions} Q · {s.avgComprehension ? `★ ${s.avgComprehension.toFixed(2)}` : "no ratings"}
                        {s.topTopic && <> · muddiest: <span className="text-slate-700">{s.topTopic}</span></>}
                      </div>
                    </button>
                  ))}
                </Card>
                <div>{reportId ? <SessionReport sessionId={reportId} /> : <Card className="p-10 text-center text-sm text-slate-500">Select a session to see its report.</Card>}</div>
              </div>
            )}
          </>
        )}
      </main>

      <SyncModal open={syncOpen} onClose={() => setSyncOpen(false)} mock={mockClassroom} onDone={() => router.refresh()} />
    </div>
  );
}

function SyncModal({ open, onClose, mock, onDone }: { open: boolean; onClose: () => void; mock: boolean; onDone: () => void }) {
  const [courses, setCourses] = useState<{ googleClassroomId: string; name: string; section?: string | null }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMsg(null); setErr(null); setCourses(null);
    fetch("/api/classroom/sync").then(async (r) => {
      const j = await r.json();
      if (r.ok) setCourses(j.courses); else setErr(j.error ?? "Could not reach Google Classroom");
    });
  }, [open]);

  const sync = async (id: string) => {
    setBusy(id); setMsg(null); setErr(null);
    const r = await fetch("/api/classroom/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: id }) });
    const j = await r.json();
    setBusy(null);
    if (!r.ok) return setErr(j.error ?? "Sync failed");
    const added = j.decks.filter((d: { isNew: boolean }) => d.isNew).length;
    setMsg(`${j.courseCode}: ${j.decks.length} slide decks (${added} new). AI is pre-scanning new slides in the background.`);
    onDone();
  };

  return (
    <Modal open={open} onClose={onClose} title="Google Classroom sync">
      {mock && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Demo / mock Classroom — sign in with your MFU Google account to import real courses.</p>}
      {!courses && !err && <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <div className="space-y-2">
        {courses?.map((c) => (
          <div key={c.googleClassroomId} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
            <BookOpen className="h-5 w-5 text-mfu" />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{c.name}</div><div className="text-xs text-slate-500">{c.section}</div></div>
            <Button size="sm" loading={busy === c.googleClassroomId} onClick={() => sync(c.googleClassroomId)}><RefreshCw className="h-3.5 w-3.5" />Sync</Button>
          </div>
        ))}
        {courses?.length === 0 && <p className="text-sm text-slate-500">No active courses where you are a teacher.</p>}
      </div>
      {msg && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}
    </Modal>
  );
}
