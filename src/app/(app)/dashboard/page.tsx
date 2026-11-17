import Link from "next/link";
import { Activity, Building2, Plus, Repeat, TrendingUp } from "lucide-react";
import type { AssessmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { goalLabel } from "@/lib/constants";
import { requireOnboardedUser } from "@/lib/session";
import { sessionKind, surveyCode } from "@/lib/survey";
import {
  GROUP_BYS,
  GROUP_BY_LABEL,
  NO_COMPANY,
  filterSessions,
  groupSessions,
  toGroupableSession,
  type GroupBy,
  type GroupableSession,
  type SessionFilters,
} from "@/lib/session-groups";
import { memberTasks } from "@/lib/services/org";
import { activeWorkspace } from "@/lib/workspace";
import { StatusBadge } from "@/components/assessment/status-badge";
import { Alert } from "@/components/ui/alert";
import { recentlyCancelledDeletion } from "@/lib/services/my-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const metadata = { title: "My 360s" };

const OPEN: AssessmentStatus[] = ["DRAFT", "READY", "COLLECTING"];
const selectCls = "h-10 rounded-md border border-input bg-background px-3 text-sm";

type Search = { deleted?: string; group?: string; company?: string; tag?: string; year?: string; min?: string; max?: string };

function parseFilters(sp: Search): { by: GroupBy; filters: SessionFilters; active: boolean } {
  const by = (GROUP_BYS as readonly string[]).includes(sp.group ?? "") ? (sp.group as GroupBy) : "survey";
  const num = (v?: string) => (v && !Number.isNaN(Number(v)) ? Number(v) : undefined);
  const filters: SessionFilters = { company: sp.company || undefined, tag: sp.tag || undefined, year: sp.year || undefined, minScore: num(sp.min), maxScore: num(sp.max) };
  return { by, filters, active: Object.values(filters).some((v) => v !== undefined) };
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireOnboardedUser("/dashboard");
  const sp = await searchParams;
  const { by, filters, active } = parseFilters(sp);
  const ws = await activeWorkspace(user.id);
  const company = ws.kind === "COMPANY";
  const assessments = await db.assessment.findMany({
    where: { subjectId: user.id, workspaceId: ws.id },
    orderBy: [{ sessionNumber: "desc" }, { createdAt: "desc" }],
    include: { invites: { select: { status: true } }, reports: { orderBy: { version: "desc" }, take: 1, select: { data: true } } },
  });
  // Round invitations show in their company workspace, and as a reminder in Personal.
  const orgTasks = (await memberTasks(user.id)).filter((t) => !company || t.orgId === ws.orgId);
  const byId = new Map(assessments.map((a) => [a.id, a]));
  const rootTitle = (a: (typeof assessments)[number]) => byId.get(a.rootAssessmentId ?? a.id)?.title ?? a.title;
  const all = assessments.map((a) => toGroupableSession(a, rootTitle(a)));
  const shown = filterSessions(all, filters);
  const shownIds = new Set(shown.map((s) => s.id));

  // Options for the filters, from every session (not just the filtered ones).
  const companies = [...new Set(all.map((s) => s.company).filter((c): c is string => !!c))].sort();
  const tags = [...new Set(all.flatMap((s) => s.tags))].sort();
  const years = [...new Set(all.map((s) => String(new Date(s.date).getUTCFullYear())))].sort().reverse();

  // A survey = the original 360 (root) + all its later sessions.
  const surveys = new Map<string, typeof assessments>();
  for (const a of assessments) {
    const root = a.rootAssessmentId ?? a.id;
    surveys.set(root, [...(surveys.get(root) ?? []), a]);
  }
  const list = [...surveys.entries()]
    .map(([rootId, sessions]) => ({ rootId, root: sessions.find((s) => s.id === rootId) ?? sessions[sessions.length - 1], sessions }))
    .filter(({ sessions }) => sessions.some((s) => shownIds.has(s.id)))
    .sort((a, b) => +b.sessions[0].createdAt - +a.sessions[0].createdAt);

  const row = (s: (typeof assessments)[number], showSurvey = false) => {
    const total = s.invites.length;
    const done = s.invites.filter((i) => i.status === "SUBMITTED").length;
    const g = all.find((x) => x.id === s.id)!;
    return (
      <li key={s.id}>
        <Link
          href={s.status === "CLOSED" ? `/assessments/${s.id}/report` : `/assessments/${s.id}`}
          className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent/50 sm:grid-cols-[auto_1fr_10rem_auto]"
          data-testid="session-row"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold" title={`Session ${s.sessionNumber}`}>
            S{s.sessionNumber}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {showSurvey && <span className="text-muted-foreground">{rootTitle(s)} · </span>}
              {sessionKind(s.type)}
              {s.sessionLabel ? ` · ${s.sessionLabel}` : ""}
            </span>
            <span className="block text-xs text-muted-foreground">
              {s.closedAt ? `Closed ${s.closedAt.toLocaleDateString()}` : s.dueAt && s.status === "COLLECTING" ? `Due ${s.dueAt.toLocaleDateString()}` : `Created ${s.createdAt.toLocaleDateString()}`}
              {" · "}
              {done}/{total} responded
              {g.score != null && ` · others' avg ${g.score.toFixed(1)}`}
              {s.company && ` · ${s.company}`}
              {s.tags.length > 0 && ` · ${s.tags.map((t) => `#${t}`).join(" ")}`}
            </span>
          </span>
          <span className="hidden sm:block">
            <Progress value={total ? (done / total) * 100 : 0} aria-label={`Session ${s.sessionNumber} responses`} />
          </span>
          <StatusBadge status={s.status} />
        </Link>
      </li>
    );
  };

  const cancelled = await recentlyCancelledDeletion(user.id);
  return (
    <div className="space-y-6">
      {sp.deleted && <Alert tone="success">Deleted. Its responses, reports and links are gone.</Alert>}
      {cancelled && <Alert tone="info" data-testid="deletion-cancelled">Welcome back. You signed in, so your account deletion has been cancelled.</Alert>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hi {user.profile.displayName.split(" ")[0]}</h1>
          <p className="text-muted-foreground">
            {company ? `Your 360s in ${ws.name} rounds. Your reports are yours; ${ws.name} sees only group results unless you share.` : "Your surveys and every session you've run of them."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/progress">Progress</Link>
          </Button>
          {!company && (
            <Button asChild>
              <Link href="/assessments/new">
                <Plus /> New 360
              </Link>
            </Button>
          )}
        </div>
      </div>

      {orgTasks.map((t) => (
        <Alert key={t.campaignId} tone="info" className="flex flex-wrap items-center justify-between gap-2" data-testid="org-task-banner">
          <span>
            {t.orgName} started “{t.name}”. Set up your 360{t.dueAt ? ` by ${t.dueAt.toLocaleDateString()}` : ""}.
          </span>
          <Button asChild size="sm">
            <Link href={`/assessments/new?campaign=${t.campaignId}`}>Set up my 360</Link>
          </Button>
        </Alert>
      ))}

      {all.length > 0 && (
        <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border p-3" aria-label="Group and filter sessions" data-testid="session-filters">
          <label className="grid gap-1 text-xs font-medium">
            Group by
            <select name="group" defaultValue={by} className={selectCls}>
              {GROUP_BYS.map((g) => (
                <option key={g} value={g}>
                  {GROUP_BY_LABEL[g]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Company
            <select name="company" defaultValue={filters.company ?? ""} className={selectCls}>
              <option value="">Any</option>
              {companies.map((c) => (
                <option key={c}>{c}</option>
              ))}
              <option value={NO_COMPANY}>{NO_COMPANY}</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Year
            <select name="year" defaultValue={filters.year ?? ""} className={selectCls}>
              <option value="">Any</option>
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          {tags.length > 0 && (
            <label className="grid gap-1 text-xs font-medium">
              Tag
              <select name="tag" defaultValue={filters.tag ?? ""} className={selectCls}>
                <option value="">Any</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-xs font-medium">
            Score from
            <input name="min" type="number" step="0.1" min="1" max="10" defaultValue={sp.min ?? ""} className={`${selectCls} w-20`} />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            to
            <input name="max" type="number" step="0.1" min="1" max="10" defaultValue={sp.max ?? ""} className={`${selectCls} w-20`} />
          </label>
          <Button type="submit">
            Apply
          </Button>
          {(active || by !== "survey") && (
            <Button asChild variant="ghost">
              <Link href="/dashboard">Clear</Link>
            </Button>
          )}
          <p className="w-full text-xs text-muted-foreground" aria-live="polite">
            Showing {shown.length} of {all.length} session{all.length === 1 ? "" : "s"}. Scores are others&apos; overall average and only appear once a report has
            enough responses. Add a company or tags from any session&apos;s header.
          </p>
        </form>
      )}

      {all.length === 0 && company ? (
        <Card data-testid="company-empty">
          <CardHeader>
            <CardTitle>No round 360s yet</CardTitle>
            <CardDescription>When {ws.name} starts a 360 round that includes you, it appears here. Personal 360s stay in your Personal space.</CardDescription>
          </CardHeader>
        </Card>
      ) : all.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Start your first 360</CardTitle>
            <CardDescription>It takes about 5 minutes to set up. You&apos;ll rate yourself first, then invite the people around you.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/assessments/new">Set up a 360</Link>
            </Button>
          </CardContent>
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground sm:pt-6">No sessions match these filters.</CardContent>
        </Card>
      ) : by === "survey" ? (
        <div className="space-y-4">
          {list.map(({ rootId, root, sessions }) => {
            const latestClosed = sessions.find((s) => s.status === "CLOSED");
            const hasOpen = sessions.some((s) => OPEN.includes(s.status));
            const visible = sessions.filter((s) => shownIds.has(s.id));
            return (
              <Card key={rootId} data-testid="survey">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base leading-snug">
                        <Link className="hover:underline" href={latestClosed ? `/assessments/${latestClosed.id}/report` : `/assessments/${sessions[0].id}`}>
                          {root.title}
                        </Link>
                      </CardTitle>
                      <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono" title="Survey ID">
                          {surveyCode(rootId)}
                        </Badge>
                        <span>Goal: {goalLabel(root.goal)}</span>
                        <span>
                          · {sessions.length} session{sessions.length === 1 ? "" : "s"}
                          {visible.length < sessions.length && ` (${visible.length} shown)`}
                        </span>
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {latestClosed && !hasOpen && (
                        <>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/assessments/${latestClosed.id}/rerun`}>
                              <Repeat /> Run again
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/assessments/${latestClosed.id}/pulse/new`}>
                              <Activity /> Pulse check
                            </Link>
                          </Button>
                        </>
                      )}
                      {latestClosed && (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/progress?series=${rootId}`}>
                            <TrendingUp /> Trends
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y rounded-lg border">{visible.map((s) => row(s))}</ul>
                  {hasOpen && <p className="mt-2 text-xs text-muted-foreground">Finish the session in progress before running this survey again.</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {by === "theme" && (
            <p className="text-xs text-muted-foreground">
              Themes come from your tags (#), the most-mentioned comment themes and the strengths and growth areas in each report. A session can appear under several themes.
            </p>
          )}
          {groupSessions(shown, by).map((g) => (
            <GroupCard key={g.key} label={g.label} sessions={g.sessions} avgScore={g.avgScore} by={by}>
              <ul className="divide-y rounded-lg border">{g.sessions.map((s) => row(byId.get(s.id)!, true))}</ul>
            </GroupCard>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupCard({ label, sessions, avgScore, by, children }: { label: string; sessions: GroupableSession[]; avgScore: number | null; by: GroupBy; children: React.ReactNode }) {
  const surveys = new Set(sessions.map((s) => s.rootId)).size;
  return (
    <Card data-testid="session-group">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {by === "company" && <Building2 className="size-4 text-muted-foreground" aria-hidden />}
          {label}
        </CardTitle>
        <CardDescription>
          {sessions.length} session{sessions.length === 1 ? "" : "s"} from {surveys} survey{surveys === 1 ? "" : "s"}
          {avgScore != null && ` · others' average ${avgScore.toFixed(1)}`}
        </CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
