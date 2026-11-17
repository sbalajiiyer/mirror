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

/**
 * Premium-AI spend this calendar month (UTC) in a workspace, in cents; optionally for one person.
 * Credits: this is what was charged ($1 = 1 credit, so cents = hundredths of a credit). Requests
 * from before credits launched count at their provider cost.
 */
export async function premiumSpendCents(workspaceId: string, userId?: string | null, now = new Date()) {
  const where = { workspaceId, tier: "premium", createdAt: { gte: monthStart(now) }, ...(userId ? { userId } : {}) };
  const [charged, legacy] = await Promise.all([
    db.aIInteractionLog.aggregate({ where: { ...where, charged: { gt: 0 } }, _sum: { charged: true } }),
    db.aIInteractionLog.aggregate({ where: { ...where, charged: 0 }, _sum: { costMicros: true } }),
  ]);
  return (charged._sum.charged ?? 0) + Math.ceil((legacy._sum.costMicros ?? 0) / MICROS_PER_CENT);
}

const billingOn = () => process.env.BILLING_ENFORCED !== "false";

/** Whose credits pay for premium AI here: the company's in a company workspace, else the person's. */
export async function premiumPayer(workspaceId: string | null, userId?: string | null) {
  const select = { id: true, kind: true, ownerId: true, orgId: true, credits: true } as const;
  const w = workspaceId
    ? await db.workspace.findUnique({ where: { id: workspaceId }, select })
    : userId
      ? await db.workspace.findUnique({ where: { ownerId: userId }, select })
      : null;
  if (!w) return null;
  const company = w.kind === "COMPANY" && !!w.orgId;
  return { workspaceId: w.id, orgId: company ? w.orgId : null, userId: company ? (userId ?? null) : w.ownerId, credits: w.credits };
}

/** Charge one premium request: provider cost x markup, less discounts. Never below zero. */
export async function chargePremiumAI(opts: { workspaceId: string | null; userId?: string | null; costMicros: number; feature: string }) {
  if (!billingOn() || opts.costMicros <= 0) return 0;
  const payer = await premiumPayer(opts.workspaceId, opts.userId);
  // The ledger needs a person; company requests without one (none today) aren't charged.
  if (!payer?.userId) return 0;
  const { getPolicy, orgDiscount, userDiscount } = await import("@/lib/services/pricing");
  const { spendUpTo } = await import("@/lib/services/credits");
  const { premiumCharge } = await import("@/lib/billing/pricing");
  const policy = await getPolicy();
  const discount = payer.orgId ? await orgDiscount(payer.orgId, "AI") : await userDiscount(payer.userId, "AI");
  const amount = premiumCharge(opts.costMicros, policy.premiumMarkupPct, discount);
  return spendUpTo({ workspaceId: payer.workspaceId, userId: payer.userId, orgId: payer.orgId, amount, reason: "ai_premium", ref: opts.feature });
}

/**
 * The model to use: the user's choice, unless the paying wallet has no credits, or, in a company
 * workspace, that premium model isn't allowed or the company's monthly AI budget (overall, or this
 * person's share) is used up. Then the free model, so nobody is ever charged beyond the budget.
 */
export async function modelForWorkspace(choice: string | null | undefined, workspaceId: string | null = currentAiWorkspace(), userId?: string | null): Promise<AIModelEntry> {
  const picked = resolveModel(choice);
  if (picked.tier === "free") return picked;
  const free = aiCatalog()[0];
  // Credits: premium models need credits in the paying wallet; otherwise the free model is used.
  if (billingOn()) {
    const payer = await premiumPayer(workspaceId, userId);
    if (!payer || payer.credits <= 0) return free;
  }
  if (!workspaceId) return picked;
  const w = await db.workspace.findUnique({ where: { id: workspaceId }, select: { kind: true, org: { select: { allowedAiModels: true, aiBudgetCents: true, aiPerPersonCents: true } } } });
  if (w?.kind !== "COMPANY" || !w.org) return picked;
  if (!w.org.allowedAiModels.includes(picked.id)) return free;
  if (w.org.aiBudgetCents != null && (await premiumSpendCents(workspaceId)) >= w.org.aiBudgetCents) return free;
  if (userId && w.org.aiPerPersonCents != null && (await premiumSpendCents(workspaceId, userId)) >= w.org.aiPerPersonCents) return free;
  return picked;
}
