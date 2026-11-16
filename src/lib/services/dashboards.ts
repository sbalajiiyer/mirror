import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Dashboard, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/url";
import { getCoachProfile } from "@/lib/services/coach";
import { requireAdmin } from "@/lib/services/org";
import { questionToWidget } from "@/lib/ai/features/nl-query";
import { widgetData } from "@/lib/dashboards/data";
import { toText, WIDGETS, type Scope, type Widget, type WidgetData } from "@/lib/dashboards/widgets";

const MAX_WIDGETS = 12;

export const dashboardSchema = z.object({
  name: z.string().trim().min(2, "Give the dashboard a name").max(60),
  scope: z.enum(["PERSONAL", "COACH", "ORG"]),
  orgId: z.string().nullable().optional(),
});

const widgetSchema = z.object({
  type: z.enum(WIDGETS.map((w) => w.type) as [Widget["type"], ...Widget["type"][]]),
  config: z
    .object({ surveyId: z.string().optional(), groupId: z.string().optional(), aGroupId: z.string().optional(), aRoundId: z.string().optional(), bGroupId: z.string().optional(), bRoundId: z.string().optional() })
    .default({}),
});

async function assertScope(userId: string, scope: Scope, orgId?: string | null) {
  if (scope === "COACH" && !(await getCoachProfile(userId))) throw new DomainError("Set up your coach workspace first.");
  if (scope === "ORG") {
    if (!orgId) throw new DomainError("Pick an organization.");
    await requireAdmin(userId, orgId);
  }
}

export async function createDashboard(userId: string, raw: unknown) {
  const input = dashboardSchema.parse(raw);
  await assertScope(userId, input.scope, input.orgId);
  const starter: Record<Scope, Widget["type"][]> = { PERSONAL: ["latest_scores", "goals", "benchmarks"], COACH: ["clients", "client_patterns"], ORG: ["org_participation", "org_strengths"] };
  return db.dashboard.create({
    data: { ownerId: userId, name: input.name, scope: input.scope, orgId: input.scope === "ORG" ? input.orgId : null, widgets: starter[input.scope].map((type) => ({ id: randomUUID(), type, config: {} })) as unknown as Prisma.InputJsonValue },
  });
}

export async function listDashboards(userId: string) {
  return db.dashboard.findMany({ where: { ownerId: userId }, orderBy: { updatedAt: "desc" } });
}

export async function getDashboard(userId: string, id: string) {
  const d = await db.dashboard.findFirst({ where: { id, ownerId: userId } });
  if (!d) throw new DomainError("Not found", "not_found");
  return d;
}

const widgetsOf = (d: Dashboard) => (d.widgets as unknown as Widget[]) ?? [];
const save = (id: string, widgets: Widget[]) => db.dashboard.update({ where: { id }, data: { widgets: widgets as unknown as Prisma.InputJsonValue } });

export async function addWidget(userId: string, id: string, raw: unknown) {
  const d = await getDashboard(userId, id);
  const w = widgetSchema.parse(raw);
  if (WIDGETS.find((x) => x.type === w.type)!.scope !== d.scope) throw new DomainError("That widget doesn't fit this dashboard.");
  const list = widgetsOf(d);
  if (list.length >= MAX_WIDGETS) throw new DomainError(`A dashboard holds up to ${MAX_WIDGETS} widgets.`);
  const widget: Widget = { id: randomUUID(), type: w.type, config: w.config };
  await save(id, [...list, widget]);
  return widget;
}

export async function removeWidget(userId: string, id: string, widgetId: string) {
  const d = await getDashboard(userId, id);
  await save(id, widgetsOf(d).filter((w) => w.id !== widgetId));
}

export async function moveWidget(userId: string, id: string, widgetId: string, dir: -1 | 1) {
  const d = await getDashboard(userId, id);
  const list = [...widgetsOf(d)];
  const i = list.findIndex((w) => w.id === widgetId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await save(id, list);
}

export async function deleteDashboard(userId: string, id: string) {
  await getDashboard(userId, id);
  await db.dashboard.delete({ where: { id } });
}

export const scheduleSchema = z.object({ schedule: z.enum(["weekly", "monthly"]).nullable(), day: z.number().int().min(0).max(28).nullable() });

export async function setSchedule(userId: string, id: string, raw: unknown) {
  const s = scheduleSchema.parse(raw);
  await getDashboard(userId, id);
  if (s.schedule === "weekly" && (s.day == null || s.day > 6)) throw new DomainError("Pick a day of the week.");
  if (s.schedule === "monthly" && (s.day == null || s.day < 1)) throw new DomainError("Pick a day of the month (1–28).");
  await db.dashboard.update({ where: { id }, data: { schedule: s.schedule, scheduleDay: s.schedule ? s.day : null } });
}

export type RenderedWidget = { widget: Widget; data: WidgetData | null; error?: string };

export async function renderWidgets(d: Dashboard, only?: string): Promise<RenderedWidget[]> {
  const ctx = { userId: d.ownerId, scope: d.scope as Scope, orgId: d.orgId };
  const out: RenderedWidget[] = [];
  for (const w of widgetsOf(d)) {
    if (only && w.id !== only) continue;
    try {
      out.push({ widget: w, data: await widgetData(ctx, w) });
    } catch (e) {
      out.push({ widget: w, data: null, error: e instanceof DomainError ? e.message : "Couldn't load this widget." });
      if (!(e instanceof DomainError)) console.error(e);
    }
  }
  return out;
}

/** Options for widget config and natural-language questions. */
export async function dashboardOptions(d: Dashboard) {
  const surveys = d.scope === "PERSONAL" ? (await db.assessment.findMany({ where: { subjectId: d.ownerId, rootAssessmentId: null }, orderBy: { createdAt: "desc" }, select: { id: true, title: true } })) : [];
  const groups = d.scope === "ORG" && d.orgId ? await db.orgGroup.findMany({ where: { orgId: d.orgId }, select: { id: true, name: true, kind: true }, orderBy: { name: "asc" } }) : [];
  const rounds = d.scope === "ORG" && d.orgId ? await db.orgCampaign.findMany({ where: { orgId: d.orgId }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } }) : [];
  return { surveys, groups, rounds };
}

/** Answer a question in plain English with a widget (optionally saved to the dashboard). */
export async function askDashboard(userId: string, id: string, question: string) {
  const q = z.string().trim().min(3, "Ask a question first").max(300).parse(question);
  const d = await getDashboard(userId, id);
  const opts = await dashboardOptions(d);
  const pick = await questionToWidget({ userId, question: q, scope: d.scope as Scope, groups: opts.groups.map((g) => ({ id: g.id, name: g.name })), surveys: opts.surveys });
  const widget: Widget = { id: randomUUID(), type: pick.type, config: { ...(pick.groupId ? { groupId: pick.groupId } : {}), ...(pick.surveyId ? { surveyId: pick.surveyId } : {}) } };
  const [r] = await renderWidgets({ ...d, widgets: [widget] as unknown as Prisma.JsonValue });
  return { widget, data: r.data, error: r.error, explanation: pick.explanation };
}

/** Scheduled dashboard emails (opt-in per dashboard), sent by the daily cron. */
export async function runScheduledDashboards(now = new Date()) {
  const due = await db.dashboard.findMany({
    where: {
      OR: [
        { schedule: "weekly", scheduleDay: now.getUTCDay(), OR: [{ lastSentAt: null }, { lastSentAt: { lt: new Date(now.getTime() - 6 * 86400000) } }] },
        { schedule: "monthly", scheduleDay: now.getUTCDate(), OR: [{ lastSentAt: null }, { lastSentAt: { lt: new Date(now.getTime() - 27 * 86400000) } }] },
      ],
    },
    include: { owner: true },
  });
  let sent = 0;
  for (const d of due) {
    if (!d.owner.email) continue;
    const parts = (await renderWidgets(d)).map((r) => (r.data ? toText(r.data) : `${r.widget.type}\n  ${r.error}`));
    await sendEmail({
      to: d.owner.email,
      template: "scheduled-dashboard",
      subject: `${d.name} — your ${d.schedule} Mirror report`,
      text: `${d.name}\n\n${parts.join("\n\n")}\n\nOpen the dashboard: ${appUrl(`/dashboards/${d.id}`)}\nYou scheduled this report. Turn it off on the dashboard page.\n\n— Mirror`,
    });
    await db.dashboard.update({ where: { id: d.id }, data: { lastSentAt: now } });
    sent++;
  }
  return { due: due.length, sent };
}
