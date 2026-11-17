import "server-only";
import { regionForAssessment } from "@/lib/services/residency";
import { withAiWorkspace, workspaceOfAssessment } from "@/lib/ai/context";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { CORE_360 } from "@/lib/frameworks/core-360";
import { aiCatalog } from "@/lib/ai/models";
import { generateAISummary, type AISummary } from "@/lib/ai/features/summary";
import { generatePlan, type StoredPlan } from "@/lib/ai/features/plan";
import { recommendFramework } from "@/lib/ai/features/framework";
import { draftInviteMessage } from "@/lib/ai/features/invite";
import { getReportForOwner } from "@/lib/services/reports";
import { DomainError } from "@/lib/errors";
import { firstName } from "@/lib/utils";

export type StoredAISummary = AISummary & { modelId: string; generatedBy: "ai" | "mock" | "template"; generatedAt: string };

async function profileOf(userId: string) {
  const p = await db.subjectProfile.findUnique({ where: { userId } });
  if (!p) throw new DomainError("Finish onboarding first.");
  return p;
}

async function closedReport(userId: string, assessmentId: string) {
  const r = await getReportForOwner(userId, assessmentId);
  if (r.status !== "ok") throw new DomainError("The report isn't ready yet.", "not_ready");
  if (!r.report.anonymity.available) throw new DomainError("Not enough responses to analyse.", "not_ready");
  return r.report;
}

/** Write (or rewrite) the AI summary for a closed report. Only anonymised aggregates are sent. */
export async function createAISummary(userId: string, assessmentId: string) {
  const report = await closedReport(userId, assessmentId);
  const profile = await profileOf(userId);
  const res = await withAiWorkspace(await workspaceOfAssessment(assessmentId), async () =>
    generateAISummary({ region: await regionForAssessment(assessmentId), report, userId, modelChoice: profile.aiModel, tone: profile.feedbackTone, role: profile.jobTitle }),
  );
  const stored: StoredAISummary = res.ok
    ? { ...res.data, modelId: res.modelId, generatedBy: res.generatedBy, generatedAt: new Date().toISOString() }
    : { ...res.fallback, modelId: "template", generatedBy: "template", generatedAt: new Date().toISOString() };
  const latest = await db.report.findFirstOrThrow({ where: { assessmentId }, orderBy: { generatedAt: "desc" } });
  await db.report.update({ where: { id: latest.id }, data: { aiSummary: stored as unknown as Prisma.InputJsonValue } });
  await audit(userId, "ai.summary", "Assessment", assessmentId, { generatedBy: stored.generatedBy });
  return { summary: stored, warning: res.ok ? null : res.error };
}

export async function createDevelopmentPlan(userId: string, assessmentId: string, learningStyle?: string | null) {
  const report = await closedReport(userId, assessmentId);
  let profile = await profileOf(userId);
  if (learningStyle !== undefined && learningStyle !== profile.learningStyle) {
    profile = await db.subjectProfile.update({ where: { userId }, data: { learningStyle: learningStyle || null } });
  }
  const res = await withAiWorkspace(await workspaceOfAssessment(assessmentId), async () =>
    generatePlan({ region: await regionForAssessment(assessmentId), report, userId, modelChoice: profile.aiModel, tone: profile.feedbackTone, profile }),
  );
  const plan = await db.developmentPlan.create({
    data: { assessmentId, userId, data: res.plan as unknown as Prisma.InputJsonValue, modelId: res.modelId },
  });
  await audit(userId, "ai.plan", "Assessment", assessmentId, { generatedBy: res.plan.generatedBy });
  return { plan, warning: res.ok ? null : res.error };
}

export async function latestPlan(userId: string, assessmentId: string) {
  const plan = await db.developmentPlan.findFirst({ where: { assessmentId, userId }, orderBy: { createdAt: "desc" } });
  return plan ? { ...plan, data: plan.data as unknown as StoredPlan } : null;
}

export async function setPlanActionDone(userId: string, planId: string, actionId: string, done: boolean) {
  const plan = await db.developmentPlan.findFirst({ where: { id: planId, userId } });
  if (!plan) throw new DomainError("Not found", "not_found");
  const data = plan.data as unknown as StoredPlan;
  let found = false;
  for (const a of data.areas) for (const x of a.actions) if (x.id === actionId) { x.done = done; found = true; }
  if (!found) throw new DomainError("Unknown action");
  await db.developmentPlan.update({ where: { id: plan.id }, data: { data: data as unknown as Prisma.InputJsonValue } });
}

export async function recommendFrameworkFor(userId: string, goal: string) {
  const profile = await profileOf(userId);
  return recommendFramework({
    userId,
    modelChoice: profile.aiModel,
    goal,
    profile,
    options: [{ slug: CORE_360.slug, name: CORE_360.name, competencies: CORE_360.competencies.map((c) => ({ key: c.key, name: c.name, description: c.description })) }],
  });
}

export async function draftInviteFor(userId: string, goal: string, minRaters: number) {
  const profile = await profileOf(userId);
  return draftInviteMessage({ userId, modelChoice: profile.aiModel, firstName: firstName(profile.displayName), goal, tone: profile.feedbackTone, minRaters });
}

export async function updateAISettings(userId: string, input: { aiModel: string; learningStyle: string | null; feedbackTone: string }) {
  const entry = aiCatalog().find((m) => m.id === input.aiModel);
  if (!entry || !entry.available) throw new DomainError("That model isn't available.");
  if (!["direct", "balanced", "gentle"].includes(input.feedbackTone)) throw new DomainError("Invalid tone");
  if (input.learningStyle && !["reading", "video", "practice", "conversation"].includes(input.learningStyle)) throw new DomainError("Invalid learning style");
  await db.subjectProfile.update({ where: { userId }, data: { aiModel: entry.id, learningStyle: input.learningStyle, feedbackTone: input.feedbackTone } });
}

/** This calendar month's AI usage for the settings page (premium cost is metered, billed from Phase 9). */
export async function monthlyUsage(userId: string) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await db.aIInteractionLog.groupBy({
    by: ["tier"],
    where: { userId, createdAt: { gte: start }, status: "ok" },
    _count: { _all: true },
    _sum: { costMicros: true },
  });
  return {
    calls: rows.reduce((s, r) => s + r._count._all, 0),
    premiumCalls: rows.filter((r) => r.tier === "premium").reduce((s, r) => s + r._count._all, 0),
    costUsd: rows.reduce((s, r) => s + (r._sum.costMicros ?? 0), 0) / 1_000_000,
  };
}
