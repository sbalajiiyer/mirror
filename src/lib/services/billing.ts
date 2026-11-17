import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { paymentProvider } from "@/lib/billing/provider";
import { COACH_CLIENT_LIMIT, FREE_PULSES_PER_SURVEY, FREE_RATER_CAP, PRODUCTS, type PlanKey, type ProductKey } from "@/lib/billing/catalog";

/*
 * Plans, purchases and entitlements (Phase 9). Payments are stubbed until Stripe is configured
 * (owner decision). Limits are enforced on the server unless BILLING_ENFORCED=false (tests, local).
 * Everything created before plans existed was grandfathered as unlocked by the migration.
 */

export const billingEnforced = () => process.env.BILLING_ENFORCED !== "false";

export class UpgradeRequired extends DomainError {
  constructor(message: string, public readonly product: ProductKey) {
    super(`${message} See Billing for options.`, "upgrade_required");
  }
}

async function activeSubs(userId: string) {
  return db.subscription.findMany({ where: { userId, status: { in: ["ACTIVE", "CANCELED"] }, currentPeriodEnd: { gt: new Date() } } });
}

export async function userPlan(userId: string): Promise<"FREE" | "PRO"> {
  return (await activeSubs(userId)).some((s) => s.plan === "PRO") ? "PRO" : "FREE";
}

export async function coachPlan(userId: string): Promise<"COACH_FREE" | "COACH_STARTER" | "COACH_PRO"> {
  const plans = (await activeSubs(userId)).map((s) => s.plan);
  return plans.includes("COACH_PRO") ? "COACH_PRO" : plans.includes("COACH_STARTER") ? "COACH_STARTER" : "COACH_FREE";
}

/** Use one prepaid full-360 unlock if the person has one (bought or gifted by their coach). */
async function consumeFull360(tx: Prisma.TransactionClient, userId: string) {
  const e = await tx.entitlement.findFirst({ where: { userId, kind: "full_360", remaining: { gt: 0 } }, orderBy: { createdAt: "asc" } });
  if (!e) return false;
  const r = await tx.entitlement.updateMany({ where: { id: e.id, remaining: { gt: 0 } }, data: { remaining: { decrement: 1 } } });
  return r.count === 1;
}

/**
 * Rater limit for a 360 on the free plan. Returns whether the 360 should be marked unlocked
 * (Pro, an org round, already unlocked, or a prepaid unlock was used).
 */
export async function checkRaterCap(tx: Prisma.TransactionClient, userId: string, raters: number, opts: { unlocked?: boolean; orgCampaign?: boolean } = {}): Promise<boolean> {
  if (opts.unlocked || opts.orgCampaign) return true;
  if ((await userPlan(userId)) === "PRO") return true;
  if (raters <= FREE_RATER_CAP || !billingEnforced()) return false;
  if (await consumeFull360(tx, userId)) return true;
  throw new UpgradeRequired(`Free 360s include up to ${FREE_RATER_CAP} raters (you added ${raters}). Unlock a full 360 or go Pro to invite more.`, "full_360");
}

export async function isUnlocked(userId: string, a: { unlockedAt: Date | null; orgCampaignId: string | null }) {
  return !!a.unlockedAt || !!a.orgCampaignId || !billingEnforced() || (await userPlan(userId)) === "PRO";
}

export async function assertPulseAllowed(userId: string, rootId: string) {
  if (!billingEnforced() || (await userPlan(userId)) === "PRO") return;
  const root = await db.assessment.findUnique({ where: { id: rootId }, select: { orgCampaignId: true } });
  if (root?.orgCampaignId) return;
  const pulses = await db.assessment.count({ where: { rootAssessmentId: rootId, type: "PULSE" } });
  if (pulses >= FREE_PULSES_PER_SURVEY) throw new UpgradeRequired(`The free plan includes ${FREE_PULSES_PER_SURVEY} pulse check per survey. Go Pro for unlimited pulses.`, "pro_yearly");
}

export async function chatFeature(userId: string): Promise<"chat" | "chat_pro"> {
  return (await userPlan(userId)) === "PRO" ? "chat_pro" : "chat";
}

export async function assertCoachCapacity(coachId: string) {
  if (!billingEnforced()) return;
  const plan = await coachPlan(coachId);
  const limit = COACH_CLIENT_LIMIT[plan];
  const used = await db.coachClientLink.count({ where: { coachId, status: { in: ["ACTIVE", "PENDING"] } } });
  if (used >= limit) throw new UpgradeRequired(`Your ${plan === "COACH_FREE" ? "free coach plan" : "plan"} covers ${limit} clients (including pending invitations). Upgrade to add more.`, plan === "COACH_FREE" ? "coach_starter_month" : "coach_pro_month");
}

export async function coachHasBranding(coachId: string) {
  return !billingEnforced() || (await coachPlan(coachId)) !== "COACH_FREE";
}

/** Seats for an org round; atomic so two admins can't overspend. */
export async function consumeOrgSeats(tx: Prisma.TransactionClient, orgId: string, n: number) {
  if (!billingEnforced() || n === 0) return;
  const r = await tx.organization.updateMany({ where: { id: orgId, seats: { gte: n } }, data: { seats: { decrement: n } } });
  if (r.count !== 1) {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: orgId } });
    throw new UpgradeRequired(`This round needs ${n} seats and the organization has ${org.seats}. Buy seats to continue.`, "org_seats_25");
  }
}

// ------------------------------------------------------------------ checkout

export async function startCheckout(userId: string, product: ProductKey, context: { assessmentId?: string; orgId?: string } = {}) {
  const p = PRODUCTS[product];
  if (!p) throw new DomainError("Unknown product");
  if (product === "full_360" && context.assessmentId) {
    const a = await db.assessment.findFirst({ where: { id: context.assessmentId, subjectId: userId } });
    if (!a) throw new DomainError("Not found", "not_found");
    if (a.unlockedAt) throw new DomainError("This 360 is already unlocked.");
  }
  if (product.startsWith("org_seats")) {
    if (!context.orgId) throw new DomainError("Pick an organization.");
    const m = await db.orgMember.findFirst({ where: { orgId: context.orgId, userId, role: "OWNER", status: "ACTIVE" } });
    if (!m) throw new DomainError("Only organization owners can buy seats.");
  }
  if (product.startsWith("coach_") && !(await db.coachProfile.findUnique({ where: { userId } }))) throw new DomainError("Set up your coach workspace first.");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const provider = paymentProvider();
  const pay = await db.payment.create({ data: { userId, product, amountCents: p.amountCents, provider: provider.name, context: context as Prisma.InputJsonValue } });
  const { url, providerRef } = await provider.createCheckout({ paymentId: pay.id, label: p.label, amountCents: p.amountCents, currency: "usd", email: user.email });
  if (providerRef) await db.payment.update({ where: { id: pay.id }, data: { providerRef } });
  await audit(userId, "billing.checkout", "Payment", pay.id, { product });
  return { paymentId: pay.id, url };
}

/** The stub's "Pay" / "Cancel" buttons. Only for stub payments, only by their owner. */
export async function completeStubPayment(userId: string, paymentId: string, pay: boolean) {
  const p = await db.payment.findFirst({ where: { id: paymentId, userId } });
  if (!p || p.provider !== "stub") throw new DomainError("Not found", "not_found");
  if (p.status !== "PENDING") return p.status;
  await db.payment.update({ where: { id: p.id }, data: pay ? { status: "PAID", paidAt: new Date() } : { status: "CANCELED" } });
  if (pay) await fulfill(p.id);
  return pay ? "PAID" : "CANCELED";
}

/** Mark a provider-confirmed payment paid (Stripe webhook) and fulfil it. */
export async function markPaid(paymentId: string, providerRef?: string) {
  await db.payment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: { status: "PAID", paidAt: new Date(), ...(providerRef ? { providerRef } : {}) } });
  await fulfill(paymentId);
}

async function extendSubscription(tx: Prisma.TransactionClient, userId: string, plan: PlanKey, days: number, provider: string, ref: string) {
  const current = await tx.subscription.findFirst({ where: { userId, plan, status: { in: ["ACTIVE", "CANCELED"] }, currentPeriodEnd: { gt: new Date() } }, orderBy: { currentPeriodEnd: "desc" } });
  const from = current ? current.currentPeriodEnd : new Date();
  const end = new Date(from.getTime() + days * 86400000);
  if (current) await tx.subscription.update({ where: { id: current.id }, data: { currentPeriodEnd: end, status: "ACTIVE", canceledAt: null } });
  else await tx.subscription.create({ data: { userId, plan, currentPeriodEnd: end, provider, providerRef: ref } });
}

/** Deliver what was bought, exactly once per payment. */
export async function fulfill(paymentId: string) {
  return db.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({ where: { id: paymentId, status: "PAID", fulfilledAt: null }, data: { fulfilledAt: new Date() } });
    if (claimed.count !== 1) return false;
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const ctx = p.context as { assessmentId?: string; orgId?: string };
    const product = p.product as ProductKey;
    const def = PRODUCTS[product];
    switch (product) {
      case "full_360":
        if (ctx.assessmentId) await tx.assessment.updateMany({ where: { id: ctx.assessmentId, subjectId: p.userId }, data: { unlockedAt: new Date() } });
        else await tx.entitlement.create({ data: { userId: p.userId, kind: "full_360", remaining: 1, source: "purchase", ref: p.id } });
        break;
      case "pro_yearly":
        await extendSubscription(tx, p.userId, "PRO", def.days!, p.provider, p.id);
        await tx.subjectProfile.updateMany({ where: { userId: p.userId }, data: { aiCredits: { increment: 3 } } });
        await tx.creditLedger.create({ data: { userId: p.userId, delta: 3, reason: "purchase", ref: p.id } });
        break;
      case "ai_credits_5":
        await tx.subjectProfile.updateMany({ where: { userId: p.userId }, data: { aiCredits: { increment: 5 } } });
        await tx.creditLedger.create({ data: { userId: p.userId, delta: 5, reason: "purchase", ref: p.id } });
        break;
      case "coach_starter_month":
      case "coach_pro_month":
        await extendSubscription(tx, p.userId, def.plan!, def.days!, p.provider, p.id);
        break;
      case "coach_report_credits_5":
        await tx.entitlement.create({ data: { userId: p.userId, kind: "coach_report_credit", remaining: 5, source: "purchase", ref: p.id } });
        break;
      case "org_seats_25":
      case "org_seats_100":
        await tx.organization.update({ where: { id: ctx.orgId! }, data: { seats: { increment: product === "org_seats_25" ? 25 : 100 } } });
        break;
    }
    await tx.auditLog.create({ data: { actorId: p.userId, action: "billing.fulfilled", entity: "Payment", entityId: p.id, meta: { product } } });
    return true;
  });
}

export async function cancelSubscription(userId: string, id: string) {
  const s = await db.subscription.findFirst({ where: { id, userId, status: "ACTIVE" } });
  if (!s) throw new DomainError("Not found", "not_found");
  await db.subscription.update({ where: { id }, data: { status: "CANCELED", canceledAt: new Date() } });
}

/** A coach gives one of their wholesale credits to a client as a full-360 unlock. */
export async function giftFull360(coachId: string, clientId: string) {
  const link = await db.coachClientLink.findFirst({ where: { coachId, clientId, status: "ACTIVE" } });
  if (!link) throw new DomainError("Not found", "not_found");
  await db.$transaction(async (tx) => {
    const credit = await tx.entitlement.findFirst({ where: { userId: coachId, kind: "coach_report_credit", remaining: { gt: 0 } }, orderBy: { createdAt: "asc" } });
    if (!credit) throw new UpgradeRequired("You have no client report credits left.", "coach_report_credits_5");
    const r = await tx.entitlement.updateMany({ where: { id: credit.id, remaining: { gt: 0 } }, data: { remaining: { decrement: 1 } } });
    if (r.count !== 1) throw new DomainError("Please try again.");
    await tx.entitlement.create({ data: { userId: clientId, kind: "full_360", remaining: 1, source: "coach_gift", ref: coachId } });
  });
  await audit(coachId, "billing.gift_full_360", "User", clientId);
}

export async function billingOverview(userId: string) {
  const [plan, cPlan, subs, ents, payments, profile, coach] = await Promise.all([
    userPlan(userId),
    coachPlan(userId),
    activeSubs(userId),
    db.entitlement.findMany({ where: { userId, remaining: { gt: 0 } } }),
    db.payment.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.subjectProfile.findUnique({ where: { userId } }),
    db.coachProfile.findUnique({ where: { userId } }),
  ]);
  const count = (k: string) => ents.filter((e) => e.kind === k).reduce((n, e) => n + e.remaining, 0);
  const adminOrgs = await db.orgMember.findMany({ where: { userId, role: "OWNER", status: "ACTIVE" }, include: { org: true } });
  return {
    plan,
    coachPlan: coach ? cPlan : null,
    subscriptions: subs,
    credits: profile?.aiCredits ?? 0,
    full360Unlocks: count("full_360"),
    reportCredits: count("coach_report_credit"),
    payments,
    orgs: adminOrgs.map((m) => ({ id: m.orgId, name: m.org.name, seats: m.org.seats })),
    activeClients: coach ? await db.coachClientLink.count({ where: { coachId: userId, status: { in: ["ACTIVE", "PENDING"] } } }) : 0,
  };
}
