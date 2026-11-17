import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@/lib/db";
import { aiCatalog, resolveModel, type AIModelEntry } from "./models";

/**
 * Phase 11e: which workspace an AI call is made for. Services wrap AI work in `withAiWorkspace`, so
 * `runAI` can apply that company's AI rules (allowed models) and record usage against it, without
 * every AI feature taking another parameter.
 */
type AiScope = { workspaceId: string | null };
const store = new AsyncLocalStorage<AiScope>();

export function withAiWorkspace<T>(workspaceId: string | null | undefined, fn: () => T): T {
  return store.run({ workspaceId: workspaceId ?? null }, fn);
}

export const currentAiWorkspace = () => store.getStore()?.workspaceId ?? null;

/** The workspace an assessment lives in (null if unknown). */
export async function workspaceOfAssessment(assessmentId: string | null | undefined) {
  if (!assessmentId) return null;
  return (await db.assessment.findUnique({ where: { id: assessmentId }, select: { workspaceId: true } }))?.workspaceId ?? null;
}

/** Micro-dollars per cent (AIInteractionLog.costMicros is in micro-dollars). */
const MICROS_PER_CENT = 10_000;
export const monthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** Premium-AI spend this calendar month (UTC) in a workspace, in cents; optionally for one person. */
export async function premiumSpendCents(workspaceId: string, userId?: string | null, now = new Date()) {
  const r = await db.aIInteractionLog.aggregate({ where: { workspaceId, tier: "premium", createdAt: { gte: monthStart(now) }, ...(userId ? { userId } : {}) }, _sum: { costMicros: true } });
  return Math.ceil((r._sum.costMicros ?? 0) / MICROS_PER_CENT);
}

/**
 * The model to use: the user's choice, unless, in a company workspace, that premium model isn't
 * allowed or the company's monthly AI budget (overall, or this person's share) is used up. Then
 * the free model, so nobody is ever charged beyond the budget. Personal workspaces allow any
 * available model.
 */
export async function modelForWorkspace(choice: string | null | undefined, workspaceId: string | null = currentAiWorkspace(), userId?: string | null): Promise<AIModelEntry> {
  const picked = resolveModel(choice);
  if (!workspaceId || picked.tier === "free") return picked;
  const w = await db.workspace.findUnique({ where: { id: workspaceId }, select: { kind: true, org: { select: { allowedAiModels: true, aiBudgetCents: true, aiPerPersonCents: true } } } });
  if (w?.kind !== "COMPANY" || !w.org) return picked;
  const free = aiCatalog()[0];
  if (!w.org.allowedAiModels.includes(picked.id)) return free;
  if (w.org.aiBudgetCents != null && (await premiumSpendCents(workspaceId)) >= w.org.aiBudgetCents) return free;
  if (userId && w.org.aiPerPersonCents != null && (await premiumSpendCents(workspaceId, userId)) >= w.org.aiPerPersonCents) return free;
  return picked;
}
