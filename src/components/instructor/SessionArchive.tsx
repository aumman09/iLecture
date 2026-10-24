"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, CalendarDays, CheckCircle2, ChevronUp, Clock, Download, Layers, Lightbulb, MessagesSquare, PenLine, Pin, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { FreeBoard } from "@/components/shared/FreeBoard";
import { BoardSurface, STICKY_STYLES, type BoardStroke } from "@/components/shared/BoardSurface";
import { PdfSlide } from "@/components/shared/PdfSlide";
import { AuthorTag } from "@/components/student/Identity";
import { cn } from "@/lib/cn";
import { SessionReport } from "./SessionReport";
import { ParticipationTable } from "./ParticipationTable";
import type { QuestionDTO, StickyNote } from "@/types";

interface Archive {
  session: {
    id: string; title: string; code: string; status: string; startedAt: string; endedAt: string | null;
    course: { code: string; name: string; section: number; semester: string };
    sectionId: string; slideDeckId: string | null; slideDeckTitle: string | null; totalPages: number;
    counts: { attendances: number; feedbacks: number; questions: number; boardItems: number };
  };
  questions: QuestionDTO[];
  ideaPages: { page: number; prompt: string | null; strokes: BoardStroke[]; stickies: StickyNote[] }[];
  slideBoards: { slide: number; strokes: BoardStroke[]; stickies: StickyNote[] }[];
}

type Tab = "overview" | "questions" | "ideas" | "drawings" | "participation";

/** Read-only record of one class: everything that happened, kept for every week of the course. */
export function SessionArchive({ sessionId, canExport }: { sessionId: string; canExport: boolean }) {
  const [data, setData] = useState<Archive | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [ideaPage, setIdeaPage] = useState(1);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}/archive`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) setError(j.error ?? "Could not load"); else setData(j);
    });
  }, [sessionId]);

  if (error) return <div className="flex min-h-screen items-center justify-center text-slate-600">{error}</div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-mfu" /></div>;

  const s = data.session;
  const start = new Date(s.startedAt);
  const mins = s.endedAt ? Math.round((new Date(s.endedAt).getTime() - start.getTime()) / 60000) : null;
  const ideaCount = data.ideaPages.reduce((a, p) => a + p.stickies.length, 0);
  const tabs: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "questions", label: "Questions", icon: MessagesSquare, count: data.questions.length },
    { key: "ideas", label: "Idea Board", icon: Lightbulb, count: ideaCount },
    { key: "drawings", label: "Slide drawings", icon: PenLine, count: data.slideBoards.length },
    ...(canExport ? [{ key: "participation" as Tab, label: "Participation", icon: Users }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2"><ArrowLeft className="h-4 w-4 text-slate-400" /><Logo /></Link>
          <span className="text-xs text-slate-400">Class archive · ประวัติการสอน</span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <Card className="p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-mfu">{s.course.code} {s.course.name} · Sec {s.course.section} · {s.course.semester}</div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{s.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
            <span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" />{start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
            <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}{mins !== null && ` · ${mins} min`}</span>
            <span>PIN <span className="font-mono font-semibold text-slate-700">{s.code}</span></span>
            {s.slideDeckTitle && <span>Slides: {s.slideDeckTitle}</span>}
            <Badge tone={s.status === "ENDED" ? "slate" : "green"}>{s.status === "ENDED" ? "Ended" : "Live"}</Badge>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Mini label="Attended" value={s.counts.attendances} />
            <Mini label="Questions" value={s.counts.questions} />
            <Mini label="Ideas" value={ideaCount} />
            <Mini label="Board items" value={s.counts.boardItems} />
            <Mini label="Exit tickets" value={s.counts.feedbacks} />
          </div>
        </Card>

        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 no-scrollbar">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={cn("flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium", tab === t.key ? "border-mfu text-mfu" : "border-transparent text-slate-500 hover:text-slate-800")}>
              <t.icon className="h-4 w-4" />{t.label}{t.count !== undefined && <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{t.count}</span>}
            </button>
          ))}
        </nav>

        {tab === "overview" && <SessionReport sessionId={s.id} />}

        {tab === "questions" && (
          <Card className="divide-y divide-slate-100">
            {data.questions.length === 0 && <p className="p-8 text-center text-sm text-slate-400">No questions in this class.</p>}
            {data.questions.map((q) => (
              <div key={q.id} className="flex gap-4 p-4">
                <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-slate-50 py-1.5 text-slate-700"><ChevronUp className="h-4 w-4" /><span className="text-sm font-bold">{q.upvoteCount}</span></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] text-slate-900">{q.polishedContent}</p>
                  {q.rawContent && q.rawContent !== q.polishedContent && <p className="mt-0.5 text-xs italic text-slate-400">Original: {q.rawContent}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">Slide {q.slidePage}</span>
                    <AuthorTag name={q.displayPseudonym} isAnonymous={q.isAnonymous} />
                    {q.clusterSize > 1 && <span className="flex items-center gap-0.5 text-amber-700"><Layers className="h-3 w-3" />{q.clusterSize} merged</span>}
                    {q.isPinned && <span className="flex items-center gap-0.5 text-amber-700"><Pin className="h-3 w-3" />Pinned</span>}
                    {q.isAnswered ? <span className="flex items-center gap-0.5 text-emerald-600"><CheckCircle2 className="h-3 w-3" />Answered</span> : <Badge tone="amber">Unanswered</Badge>}
                  </div>
                  {(q.variants?.length ?? 0) > 0 && (
                    <ul className="mt-2 space-y-0.5 border-l-2 border-amber-200 pl-2 text-xs text-slate-500">{q.variants!.map((v, i) => <li key={i}>“{v}”</li>)}</ul>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}

        {tab === "ideas" && <IdeasArchive pages={data.ideaPages} page={ideaPage} setPage={setIdeaPage} />}

        {tab === "drawings" && (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.slideBoards.length === 0 && <Card className="p-8 text-center text-sm text-slate-400 lg:col-span-2">Nobody drew on the slides in this class.</Card>}
            {data.slideBoards.map((b) => (
              <Card key={b.slide} className="p-3">
                <div className="mb-2 flex items-center justify-between px-1 text-sm"><span className="font-semibold text-slate-800">Slide {b.slide}</span><span className="text-xs text-slate-500">{b.stickies.length} notes · {b.strokes.length} strokes</span></div>
                <div className="aspect-video">
                  <BoardSurface strokes={b.strokes} stickies={b.stickies} enabled={false} color="#000" width={0.004} showNames
                    background={s.slideDeckId ? <div className="h-full w-full opacity-70"><PdfSlide url={`/api/slides/${s.slideDeckId}/file`} page={b.slide} /></div> : undefined} />
                </div>
              </Card>
            ))}
          </div>
        )}

        {tab === "participation" && canExport && <ParticipationTable sectionId={s.sectionId} fixedSessionId={s.id} />}
      </main>
    </div>
  );
}

function IdeasArchive({ pages, page, setPage }: { pages: Archive["ideaPages"]; page: number; setPage: (n: number) => void }) {
  const [view, setView] = useState<"board" | "list">("board");
  const current = pages.find((p) => p.page === page) ?? pages[0];
  const sorted = useMemo(() => [...(current?.stickies ?? [])].sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0)), [current]);
  if (!current) return <Card className="p-8 text-center text-sm text-slate-400">The Idea Board was not used in this class.</Card>;

  const exportCsv = () => {
    const esc = (v: unknown) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const rows = [["page", "question", "idea", "author", "likes", "created_at"], ...pages.flatMap((p) => p.stickies.map((n) => [p.page, p.prompt ?? "", n.text, n.displayPseudonym, n.likeCount ?? 0, n.createdAt ?? ""]))];
    const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "idea-board.csv";
    a.click();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {pages.map((p) => (
          <button key={p.page} onClick={() => setPage(p.page)} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", current.page === p.page ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>
            Page {p.page} <span className="opacity-60">· {p.stickies.length}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
            <button onClick={() => setView("board")} className={cn("rounded-md px-2.5 py-1.5 font-medium", view === "board" ? "bg-white shadow-sm" : "text-slate-500")}>Board</button>
            <button onClick={() => setView("list")} className={cn("rounded-md px-2.5 py-1.5 font-medium", view === "list" ? "bg-white shadow-sm" : "text-slate-500")}>List</button>
          </div>
          <Button variant="secondary" size="sm" onClick={exportCsv}><Download className="h-3.5 w-3.5" />Export ideas (CSV)</Button>
        </div>
      </div>
      {current.prompt && <Card className="px-5 py-3 text-lg font-semibold text-slate-900"><span className="mr-2 text-xs font-semibold uppercase tracking-wide text-mfu">Question</span>{current.prompt}</Card>}
      {view === "board" ? (
        <div className="h-[70vh] rounded-2xl bg-slate-200/50 p-2">
          <FreeBoard strokes={current.strokes} notes={current.stickies} tool="move" color="#000" canEdit={false}
            onStroke={() => undefined} onPlace={() => undefined} onMove={() => undefined} onLike={() => undefined} onDelete={() => undefined}
            canMove={() => false} canDelete={() => false} />
        </div>
      ) : (
        <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">
          {sorted.map((n) => (
            <div key={n.id} className={cn("mb-3 break-inside-avoid rounded-xl border-2 p-4", STICKY_STYLES[n.color])}>
              <p className="whitespace-pre-wrap break-words font-medium">{n.text}</p>
              <div className="mt-2 flex items-center justify-between text-xs opacity-70"><AuthorTag name={n.displayPseudonym} isAnonymous={n.isAnonymous} /><span>♥ {n.likeCount ?? 0}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="font-mono text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
