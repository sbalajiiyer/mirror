import "server-only";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { ReportData } from "@/lib/report/compute";
import { goalProgress, toSeriesPoint, trendRows, type SeriesPoint } from "@/lib/progress";
import { groupableSessions } from "@/lib/services/sessions";
import { benchmarkForReport } from "@/lib/services/benchmarks";
import { crossClientAnalytics, portfolio } from "@/lib/services/coach";
import { compareCohorts, orgOverview, teamAnalytics } from "@/lib/services/org";
import { sessionKind } from "@/lib/survey";
import { WIDGETS, widgetLabel, type Scope, type Widget, type WidgetData } from "./widgets";

/*
 * Widget data. Each widget calls the same service the matching page uses, as the dashboard's owner,
 * so access checks and privacy thresholds (≥ 5 people, consent for names) apply unchanged.
 */

export type DashboardCtx = { userId: string; scope: Scope; orgId: string | null };

async function latestVisible(userId: string) {
  const a = await db.assessment.findMany({ where: { subjectId: userId, status: "CLOSED" }, orderBy: { closedAt: "desc" }, include: { reports: { orderBy: { generatedAt: "desc" }, take: 1 } }, take: 20 });
  for (const x of a) {
    const d = x.reports[0]?.data as unknown as ReportData | undefined;
    if (d?.anonymity.available) return { a: x, d };
  }
  return null;
}

async function seriesPoints(userId: string, rootId: string): Promise<SeriesPoint[]> {
  const members = await db.assessment.findMany({ where: { subjectId: userId, OR: [{ id: rootId }, { rootAssessmentId: rootId }], status: "CLOSED" }, include: { reports: { orderBy: { generatedAt: "desc" }, take: 1 } } });
  return members
    .map((m) => (m.closedAt && m.reports[0] ? toSeriesPoint({ id: m.id, title: m.title, type: m.type, closedAt: m.closedAt, sessionNumber: m.sessionNumber, sessionLabel: m.sessionLabel }, m.reports[0].data as unknown as ReportData) : null))
    .filter((p): p is SeriesPoint => !!p);
}

const r2 = (x: number | null | undefined) => (x == null ? null : Math.round(x * 100) / 100);

export async function widgetData(ctx: DashboardCtx, w: Widget): Promise<WidgetData> {
  const def = WIDGETS.find((x) => x.type === w.type);
  if (!def || def.scope !== ctx.scope) throw new DomainError("This widget isn't available on this dashboard.");
  const title = widgetLabel(w.type);
  switch (w.type) {
    case "latest_scores": {
      const l = await latestVisible(ctx.userId);
      if (!l) return { title, columns: [], rows: [], locked: "No closed report with results yet." };
      return {
        title,
        note: `${l.a.title} · S${l.a.sessionNumber} · ${l.d.anonymity.othersN} raters`,
        columns: ["Competency", "Others", "Self", "Gap"],
        rows: l.d.competencies.map((c) => [c.name, r2(c.others.mean), r2(c.self), r2(c.gap)]),
        bar: 1,
        max: l.d.assessment.scaleMax,
      };
    }
    case "trend": {
      const rootId = w.config.surveyId ?? (await latestVisible(ctx.userId))?.a.rootAssessmentId ?? (await latestVisible(ctx.userId))?.a.id;
      if (!rootId) return { title, columns: [], rows: [], locked: "No closed report with results yet." };
      const root = await db.assessment.findFirst({ where: { id: rootId, subjectId: ctx.userId } });
      if (!root) throw new DomainError("Not found", "not_found");
      const t = trendRows(await seriesPoints(ctx.userId, rootId));
      return {
        title: `${title}: ${root.title}`,
        note: "Others' average, like-for-like statements per competency",
        columns: ["Competency", ...t.rows.map((r) => String(r.label))],
        rows: t.competencies.filter((c) => c.measured).map((c) => [c.name, ...t.rows.map((r) => r2(r[`${c.key}:others`] as number | null))]),
      };
    }
    case "goals": {
      const goals = await db.goal.findMany({ where: { userId: ctx.userId, status: { not: "ARCHIVED" } }, orderBy: { createdAt: "asc" } });
      const rows = [];
      for (const g of goals) {
        const p = goalProgress(g, await seriesPoints(ctx.userId, g.assessmentId));
        rows.push([g.title, r2(p.baselineNow), r2(p.latest), g.target, p.pct]);
      }
      return { title, columns: ["Goal", "Start", "Latest", "Target", "% there"], rows, bar: 4, max: 100, ...(rows.length ? {} : { locked: "No goals yet. Set one from your Progress page." }) };
    }
    case "benchmarks": {
      const l = await latestVisible(ctx.userId);
      if (!l) return { title, columns: [], rows: [], locked: "No closed report with results yet." };
      const prof = await db.subjectProfile.findUnique({ where: { userId: ctx.userId } });
      const b = await benchmarkForReport(l.d, prof?.seniority);
      if (!b.available) return { title, columns: [], rows: [], locked: "Benchmarks appear once at least 30 people have results on the built-in questionnaire." };
      return { title, note: `Anonymous norms: ${b.rows[0].norm.label}, ${b.rows[0].norm.n} people`, columns: ["Competency", "You (others' avg)", "Median", "Percentile", "Band"], rows: b.rows.map((r) => [r.name, r2(r.you), r.norm.p50, r.percentile, r.band]), bar: 3, max: 100 };
    }
    case "sessions": {
      const all = await groupableSessions(ctx.userId);
      const counts = await db.raterInvite.groupBy({ by: ["assessmentId", "status"], where: { assessment: { subjectId: ctx.userId } }, _count: true });
      const resp = (id: string) => {
        const c = counts.filter((x) => x.assessmentId === id);
        return `${c.filter((x) => x.status === "SUBMITTED").reduce((n, x) => n + x._count, 0)}/${c.reduce((n, x) => n + x._count, 0)}`;
      };
      return {
        title,
        columns: ["Survey", "Session", "Status", "Responded", "Others' avg", "Date"],
        rows: all.sort((a, b) => b.date.localeCompare(a.date)).map((s) => [s.surveyTitle, `S${s.sessionNumber} · ${sessionKind(s.type)}${s.label ? ` · ${s.label}` : ""}`, s.status, resp(s.id), r2(s.score), s.date.slice(0, 10)]),
      };
    }
    case "clients": {
      const p = await portfolio(ctx.userId);
      return {
        title,
        columns: ["Client", "Current or latest session", "Status", "Responded", "Score", "Next coaching session"],
        rows: p.clients.map((c) => [
          c.name,
          c.openSession?.name ?? c.latest?.name ?? "–",
          c.openSession?.status ?? (c.latest ? "CLOSED" : "–"),
          c.openSession?.responses ? `${c.openSession.responses.done}/${c.openSession.responses.total}` : "–",
          r2(c.latest?.score),
          c.nextMeeting ? c.nextMeeting.at.toISOString().slice(0, 10) : "–",
        ]),
      };
    }
    case "client_patterns": {
      const a = await crossClientAnalytics(ctx.userId);
      if (!a.available) return { title, columns: [], rows: [], locked: `Unlocks at 5 clients sharing reports (${a.clients} so far).` };
      return {
        title,
        note: `${a.clients} clients · blind spots: ${a.blindSpots.slice(0, 3).map((b) => `${b.name} (${b.clients})`).join(", ") || "none"}`,
        columns: ["Competency", "Mean", "Lowest", "Highest", "Clients"],
        rows: a.distribution.map((d) => [d.name, d.mean, r2(d.min), r2(d.max), d.clients]),
        bar: 1,
        max: 5,
      };
    }
    case "org_participation": {
      const o = await orgOverview(ctx.userId, ctx.orgId!);
      return {
        title,
        columns: ["Round", "Who", "Taking part", "Started", "Closed", "Rater responses"],
        rows: o.campaigns.map((c) => [c.name, c.group, c.stats.invited, c.stats.started, c.stats.closed, c.stats.raterInvites ? `${Math.round((c.stats.raterResponses / c.stats.raterInvites) * 100)}%` : "–"]),
      };
    }
    case "org_strengths": {
      const o = await orgOverview(ctx.userId, ctx.orgId!);
      if (!o.profile.available) return { title, columns: [], rows: [], locked: `Appears once ${o.min} people have a completed org 360.` };
      return { title, note: `${o.profile.people} people`, columns: ["Competency", "Org average", "Spread"], rows: [...o.profile.competencies].sort((a, b) => b.others - a.others).map((c) => [c.name, c.others, c.spread]), bar: 1, max: 5 };
    }
    case "team_profile": {
      if (!w.config.groupId) return { title, columns: [], rows: [], locked: "Choose a team for this widget." };
      const t = await teamAnalytics(ctx.userId, ctx.orgId!, w.config.groupId);
      if (!t.profile.available) return { title: `${title}: ${t.group.name}`, columns: [], rows: [], locked: `${t.withResults} of ${t.members} people have results; needs ${t.min}.` };
      return {
        title: `${title}: ${t.group.name}`,
        note: `${t.withResults} people`,
        columns: ["Competency", "Team", "Org", "Spread"],
        rows: t.profile.competencies.map((c) => [c.name, c.others, t.orgProfile.competencies.find((x) => x.key === c.key)?.others ?? null, c.spread]),
        bar: 1,
        max: 5,
      };
    }
    case "cohort_compare": {
      const c = await compareCohorts(ctx.userId, ctx.orgId!, { groupId: w.config.aGroupId ?? null, campaignId: w.config.aRoundId ?? null }, { groupId: w.config.bGroupId ?? null, campaignId: w.config.bRoundId ?? null });
      if (!c.available) return { title, columns: [], rows: [], locked: `Each side needs 5 people (${c.a.label}: ${c.a.people}; ${c.b.label}: ${c.b.people}).` };
      return { title, note: `${c.a.label} (${c.a.people}) → ${c.b.label} (${c.b.people})`, columns: ["Competency", "A", "B", "Change"], rows: c.rows.map((r) => [r.name, r.a, r.b, r.delta]) };
    }
  }
}
