import "server-only";
import { extendPlatform } from "@/lib/org/platform";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { paymentProvider } from "@/lib/billing/provider";
import {
  COACH_CLIENT_LIMIT,
  PRODUCTS,
  type PlanKey,
  type ProductKey,
} from "@/lib/billing/catalog";
import { discounted, topUpPrice } from "@/lib/billing/pricing";
import { getPolicy, orgDiscount, userDiscount } from "@/lib/services/pricing";
import {
  addCredits,
  companyWorkspaceId,
  ledger,
  personalWorkspaceId,
  spendCredits,
} from "@/lib/services/credits";

/*
 * Plans, purchases and entitlements (Phase 9). Payments are stubbed until Stripe is configured
 * (owner decision). Limits are enforced on the server unless BILLING_ENFORCED=false (tests, local).
 * Everything created before plans existed was grandfathered as unlocked by the migration.
 */

export const billingEnforced = () => process.env.BILLING_ENFORCED !== "false";

export class UpgradeRequired extends DomainError {
  constructor(
    message: string,
    public readonly product: ProductKey,
  ) {
    super(`${message} See Billing for options.`, "upgrade_required");
  }
}

async function activeSubs(userId: string) {
  return db.subscription.findMany({
    where: {
      userId,
      status: { in: ["ACTIVE", "CANCELED"] },
      currentPeriodEnd: { gt: new Date() },
    },
  });
}

export async function userPlan(userId: string): Promise<"FREE" | "PRO"> {
  return (await activeSubs(userId)).some((s) => s.plan === "PRO")
    ? "PRO"
    : "FREE";
}

export async function coachPlan(
  userId: string,
): Promise<"COACH_FREE" | "COACH_STARTER" | "COACH_PRO"> {
  const plans = (await activeSubs(userId)).map((s) => s.plan);
  return plans.includes("COACH_PRO")
    ? "COACH_PRO"
    : plans.includes("COACH_STARTER")
      ? "COACH_STARTER"
      : "COACH_FREE";
}

/** A coach-gifted 360 waiting to be used (Entitlement kind full_360, source coach_gift). */
async function findVoucher(tx: Tx | typeof db, userId: string) {
  return tx.entitlement.findFirst({
    where: { userId, kind: "full_360", remaining: { gt: 0 } },
    orderBy: { createdAt: "asc" },
  });
}

type Tx = Prisma.TransactionClient;

export type LaunchQuote =
  | {
      kind: "round" | "free" | "pro" | "voucher" | "unbilled" | "already";
      price: 0;
      listPrice: number;
      discount: 0;
      wallet: "personal" | "company";
      balance: number;
      enough: true;
      orgName?: string;
      what: string;
    }
  | {
      kind: "paid";
      price: number;
      listPrice: number;
      discount: number;
      wallet: "personal" | "company";
      balance: number;
      enough: boolean;
      orgName?: string;
      what: string;
    };

const WHAT = {
  survey: "A 360 survey",
  follow_up: "A follow-up session",
  pulse: "A pulse check",
} as const;

/**
 * What launching this session will cost, and from which wallet. Pure read; chargeForLaunch applies it.
 * Order: company round (prepaid) → free survey → active Pro (grandfathered) → coach-gifted 360 → credits.
 */
export async function launchQuote(
  assessmentId: string,
  tx: Tx | typeof db = db,
  now = new Date(),
): Promise<
  LaunchQuote & {
    reason: "survey" | "follow_up" | "pulse";
    workspaceId: string;
    orgId: string | null;
    subjectId: string;
  }
> {
  const a = await tx.assessment.findUniqueOrThrow({
    where: { id: assessmentId },
    select: {
      id: true,
      type: true,
      rootAssessmentId: true,
      orgCampaignId: true,
      billing: true,
      subjectId: true,
      workspaceId: true,
      workspace: {
        select: {
          kind: true,
          credits: true,
          orgId: true,
          org: { select: { name: true } },
        },
      },
    },
  });
  const policy = await getPolicy();
  const reason: "survey" | "follow_up" | "pulse" =
    a.type === "PULSE" ? "pulse" : a.rootAssessmentId ? "follow_up" : "survey";
  const company = a.workspace.kind === "COMPANY" && !!a.workspace.orgId;
  const base = {
    reason,
    workspaceId: a.workspaceId,
    orgId: company ? a.workspace.orgId : null,
    subjectId: a.subjectId,
    wallet: company ? ("company" as const) : ("personal" as const),
    balance: a.workspace.credits,
    orgName: company ? a.workspace.org?.name : undefined,
    what: WHAT[reason],
  };
  const listPrice =
    reason === "pulse"
      ? policy.pulse
      : company
        ? policy.companyParticipant
        : reason === "follow_up"
          ? policy.followUp
          : policy.survey360;
  const free = (
    kind: "round" | "free" | "pro" | "voucher" | "unbilled" | "already",
  ) => ({
    ...base,
    kind,
    price: 0 as const,
    listPrice,
    discount: 0 as const,
    enough: true as const,
  });
  if (a.billing) return free("already");
  if (a.orgCampaignId) return free("round");
  if (!billingEnforced()) return free("unbilled");
  if (!company) {
    if (reason === "survey") {
      const used = await tx.assessment.count({
        where: { subjectId: a.subjectId, billing: "FREE", id: { not: a.id } },
      });
      if (used < policy.freeSurveys) return free("free");
    }
    if ((await userPlan(a.subjectId)) === "PRO") return free("pro");
    if (reason !== "pulse" && (await findVoucher(tx, a.subjectId)))
      return free("voucher");
  }
  const discount = company
    ? await orgDiscount(a.workspace.orgId!, "SURVEYS", now)
    : await userDiscount(a.subjectId, "SURVEYS", now);
  const price = discounted(listPrice, discount);
  return {
    ...base,
    kind: "paid",
    price,
    listPrice,
    discount,
    enough: a.workspace.credits >= price,
  };
}

const BILLING_OF = {
  round: "ROUND",
  free: "FREE",
  pro: "PRO",
  voucher: "VOUCHER",
  paid: "PAID",
} as const;

/** Charge a session when it launches (invites first go out). Exactly once; throws CreditsRequired. */
export async function chargeForLaunch(
  tx: Tx,
  assessmentId: string,
  actorId: string,
) {
  const q = await launchQuote(assessmentId, tx);
  if (q.kind === "already" || q.kind === "unbilled") return q;
  if (q.kind === "voucher") {
    const v = await findVoucher(tx, q.subjectId);
    const r = v
      ? await tx.entitlement.updateMany({
          where: { id: v.id, remaining: { gt: 0 } },
          data: { remaining: { decrement: 1 } },
        })
      : { count: 0 };
    if (r.count !== 1) throw new DomainError("Please try again.");
  }
  if (q.kind === "paid")
    await spendCredits(tx, {
      workspaceId: q.workspaceId,
      userId: actorId,
      orgId: q.orgId,
      amount: q.price,
      reason: q.reason,
      ref: assessmentId,
      what: q.what,
    });
  const claimed = await tx.assessment.updateMany({
    where: { id: assessmentId, billing: null },
    data: {
      billing: BILLING_OF[q.kind],
      chargedCredits: q.price,
      chargedAt: new Date(),
    },
  });
  if (claimed.count !== 1)
    throw new DomainError("This session was already launched.");
  return q;
}

/** What a company round will cost: one participant price per person, less the company's discount. */
export async function roundQuote(
  orgId: string,
  participants: number,
  now = new Date(),
) {
  const policy = await getPolicy();
  const discount = await orgDiscount(orgId, "SURVEYS", now);
  const each = discounted(policy.companyParticipant, discount);
  const ws = await db.workspace.findUniqueOrThrow({
    where: { orgId },
    select: { id: true, credits: true },
  });
  return {
    each,
    listEach: policy.companyParticipant,
    discount,
    total: each * participants,
    balance: ws.credits,
    enough: !billingEnforced() || ws.credits >= each * participants,
    workspaceId: ws.id,
  };
}

/** Charge the company for a round; atomic so two admins can't overspend. */
export async function chargeRound(
  tx: Tx,
  orgId: string,
  actorId: string,
  participants: number,
  ref?: string,
) {
  if (!billingEnforced() || participants === 0) return 0;
  const q = await roundQuote(orgId, participants);
  await spendCredits(tx, {
    workspaceId: q.workspaceId,
    userId: actorId,
    orgId,
    amount: q.total,
    reason: "round",
    ref,
    what: `A round for ${participants} ${participants === 1 ? "person" : "people"}`,
  });
  return q.total;
}

export async function chatFeature(
  userId: string,
): Promise<"chat" | "chat_pro"> {
  return (await userPlan(userId)) === "PRO" ? "chat_pro" : "chat";
}

export async function assertCoachCapacity(coachId: string) {
  if (!billingEnforced()) return;
  const plan = await coachPlan(coachId);
  const limit = COACH_CLIENT_LIMIT[plan];
  // Company-paid clients (Phase 11e) don't count against the coach's own plan.
  const used = await db.coachClientLink.count({
    where: { coachId, orgId: null, status: { in: ["ACTIVE", "PENDING"] } },
  });
  if (used >= limit)
    throw new UpgradeRequired(
      `Your ${plan === "COACH_FREE" ? "free coach plan" : "plan"} covers ${limit} clients (including pending invitations). Upgrade to add more.`,
      plan === "COACH_FREE" ? "coach_starter_month" : "coach_pro_month",
    );
}

export async function coachHasBranding(coachId: string) {
  return !billingEnforced() || (await coachPlan(coachId)) !== "COACH_FREE";
}

// ------------------------------------------------------------------ checkout

export type CheckoutContext = { orgId?: string; credits?: number };

/** Start a checkout: credits (any whole number, buyer pays fees) or a subscription. */
export async function startCheckout(
  userId: string,
  product: ProductKey,
  context: CheckoutContext = {},
) {
  const p = PRODUCTS[product];
  if (!p || p.retired)
    throw new DomainError("This item is no longer sold. Buy credits instead.");
  if (context.orgId) {
    const m = await db.orgMember.findFirst({
      where: { orgId: context.orgId, userId, role: "OWNER", status: "ACTIVE" },
    });
    if (!m)
      throw new DomainError(
        product === "company_platform_month"
          ? "Only organization owners can pay for the company plan."
          : "Only organization owners can buy company credits.",
      );
  } else if (product === "company_platform_month")
    throw new DomainError("Pick an organization.");
  if (
    product.startsWith("coach_") &&
    !(await db.coachProfile.findUnique({ where: { userId } }))
  )
    throw new DomainError("Set up your coach workspace first.");
  let amountCents = p.amountCents;
  let label = p.label;
  let ctx: Record<string, unknown> = {
    ...(context.orgId ? { orgId: context.orgId } : {}),
  };
  if (product === "credits") {
    const policy = await getPolicy();
    const n = context.credits;
    if (!Number.isInteger(n) || n! < policy.minTopUp || n! > policy.maxTopUp)
      throw new DomainError(
        `Choose a whole number of credits from ${policy.minTopUp} to ${policy.maxTopUp.toLocaleString("en-US")}.`,
      );
    const price = topUpPrice(n!, policy);
    amountCents = price.totalCents;
    label = `${n!.toLocaleString("en-US")} Mirror credits`;
    ctx = { ...ctx, credits: n, feeCents: price.feeCents };
  }
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const provider = paymentProvider();
  const pay = await db.payment.create({
    data: {
      userId,
      product,
      amountCents,
      provider: provider.name,
      context: ctx as Prisma.InputJsonValue,
    },
  });
  const { url, providerRef } = await provider.createCheckout({
    paymentId: pay.id,
    label,
    amountCents,
    currency: "usd",
    email: user.email,
  });
  if (providerRef)
    await db.payment.update({ where: { id: pay.id }, data: { providerRef } });
  await audit(
    userId,
    "billing.checkout",
    "Payment",
    pay.id,
    { product, ...(ctx.credits ? { credits: ctx.credits as number } : {}) },
    context.orgId ? { orgId: context.orgId } : {},
  );
  return { paymentId: pay.id, url };
}

/** The stub's "Pay" / "Cancel" buttons. Only for stub payments, only by their owner. */
export async function completeStubPayment(
  userId: string,
  paymentId: string,
  pay: boolean,
) {
  const p = await db.payment.findFirst({ where: { id: paymentId, userId } });
  if (!p || p.provider !== "stub")
    throw new DomainError("Not found", "not_found");
  if (p.status !== "PENDING") return p.status;
  await db.payment.update({
    where: { id: p.id },
    data: pay ? { status: "PAID", paidAt: new Date() } : { status: "CANCELED" },
  });
  if (pay) await fulfill(p.id);
  return pay ? "PAID" : "CANCELED";
}

/** Mark a provider-confirmed payment paid (Stripe webhook) and fulfil it. */
export async function markPaid(paymentId: string, providerRef?: string) {
  await db.payment.updateMany({
    where: { id: paymentId, status: "PENDING" },
    data: {
      status: "PAID",
      paidAt: new Date(),
      ...(providerRef ? { providerRef } : {}),
    },
  });
  await fulfill(paymentId);
}

async function extendSubscription(
  tx: Prisma.TransactionClient,
  userId: string,
  plan: PlanKey,
  days: number,
  provider: string,
  ref: string,
) {
  const current = await tx.subscription.findFirst({
    where: {
      userId,
      plan,
      status: { in: ["ACTIVE", "CANCELED"] },
      currentPeriodEnd: { gt: new Date() },
    },
    orderBy: { currentPeriodEnd: "desc" },
  });
  const from = current ? current.currentPeriodEnd : new Date();
  const end = new Date(from.getTime() + days * 86400000);
  if (current)
    await tx.subscription.update({
      where: { id: current.id },
      data: { currentPeriodEnd: end, status: "ACTIVE", canceledAt: null },
    });
  else
    await tx.subscription.create({
      data: { userId, plan, currentPeriodEnd: end, provider, providerRef: ref },
    });
}

/** Deliver what was bought, exactly once per payment. */
export async function fulfill(paymentId: string) {
  return db.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: paymentId, status: "PAID", fulfilledAt: null },
      data: { fulfilledAt: new Date() },
    });
    if (claimed.count !== 1) return false;
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const ctx = p.context as { orgId?: string; credits?: number };
    const product = p.product as ProductKey;
    const def = PRODUCTS[product];
    const wallet = async () =>
      ctx.orgId
        ? companyWorkspaceId(ctx.orgId, tx)
        : personalWorkspaceId(p.userId, tx);
    switch (product) {
      case "credits":
        await addCredits(tx, {
          workspaceId: await wallet(),
          userId: p.userId,
          orgId: ctx.orgId ?? null,
          amount: ctx.credits! * 100,
          reason: "purchase",
          ref: p.id,
        });
        break;
      case "pro_yearly":
        await extendSubscription(
          tx,
          p.userId,
          "PRO",
          def.days!,
          p.provider,
          p.id,
        );
        break;
      case "coach_starter_month":
      case "coach_pro_month":
        await extendSubscription(
          tx,
          p.userId,
          def.plan!,
          def.days!,
          p.provider,
          p.id,
        );
        break;
      case "company_platform_month": {
        const org = await tx.organization.findUniqueOrThrow({
          where: { id: ctx.orgId! },
          select: { createdAt: true, platformPaidUntil: true },
        });
        await tx.organization.update({
          where: { id: ctx.orgId! },
          data: { platformPaidUntil: extendPlatform(org, def.days!) },
        });
        break;
      }
      default:
        // A retired product paid after credits launched: give its price as credits.
        await addCredits(tx, {
          workspaceId: await wallet(),
          userId: p.userId,
          orgId: ctx.orgId ?? null,
          amount: p.amountCents,
          reason: "purchase",
          ref: p.id,
        });
    }
    await tx.auditLog.create({
      data: {
        actorId: p.userId,
        action: "billing.fulfilled",
        entity: "Payment",
        entityId: p.id,
        meta: { product },
      },
    });
    return true;
  });
}

export async function cancelSubscription(userId: string, id: string) {
  const s = await db.subscription.findFirst({
    where: { id, userId, status: "ACTIVE" },
  });
  if (!s) throw new DomainError("Not found", "not_found");
  await db.subscription.update({
    where: { id },
    data: { status: "CANCELED", canceledAt: new Date() },
  });
}

/** A coach gifts a client one 360, paid from the coach's credits at the coach gift price. */
export async function giftFull360(coachId: string, clientId: string) {
  const link = await db.coachClientLink.findFirst({
    where: { coachId, clientId, status: "ACTIVE" },
  });
  if (!link) throw new DomainError("Not found", "not_found");
  const price = await coachGiftPrice(coachId);
  const workspaceId = await personalWorkspaceId(coachId);
  await db.$transaction(async (tx) => {
    await spendCredits(tx, {
      workspaceId,
      userId: coachId,
      amount: price.price,
      reason: "coach_gift",
      ref: clientId,
      what: "Gifting a 360",
    });
    await tx.entitlement.create({
      data: {
        userId: clientId,
        kind: "full_360",
        remaining: 1,
        source: "coach_gift",
        ref: coachId,
      },
    });
  });
  await audit(coachId, "billing.gift_full_360", "User", clientId, {
    credits: price.price,
  });
}

export async function coachGiftPrice(coachId: string) {
  const policy = await getPolicy();
  const discount = await userDiscount(coachId, "SURVEYS");
  return {
    price: discounted(policy.coachGift, discount),
    listPrice: policy.coachGift,
    discount,
  };
}

/** What things cost this person (their discounts applied), for the Billing page. */
export async function personalPrices(userId: string) {
  const policy = await getPolicy();
  const [surveys, ai] = await Promise.all([
    userDiscount(userId, "SURVEYS"),
    userDiscount(userId, "AI"),
  ]);
  const usedFree = await db.assessment.count({
    where: { subjectId: userId, billing: "FREE" },
  });
  return {
    policy,
    surveyDiscount: surveys,
    aiDiscount: ai,
    survey360: discounted(policy.survey360, surveys),
    followUp: discounted(policy.followUp, surveys),
    pulse: discounted(policy.pulse, surveys),
    coachGift: discounted(policy.coachGift, surveys),
    freeLeft: Math.max(0, policy.freeSurveys - usedFree),
  };
}

export async function billingOverview(userId: string) {
  const workspaceId = await personalWorkspaceId(userId);
  const [plan, cPlan, subs, gifts, payments, coach, w, entries] =
    await Promise.all([
      userPlan(userId),
      coachPlan(userId),
      activeSubs(userId),
      db.entitlement.aggregate({
        where: { userId, kind: "full_360", remaining: { gt: 0 } },
        _sum: { remaining: true },
      }),
      db.payment.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      db.coachProfile.findUnique({ where: { userId } }),
      db.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { credits: true },
      }),
      ledger(workspaceId),
    ]);
  const adminOrgs = await db.orgMember.findMany({
    where: { userId, role: "OWNER", status: "ACTIVE" },
    include: { org: { include: { workspace: { select: { credits: true } } } } },
  });
  return {
    plan,
    coachPlan: coach ? cPlan : null,
    subscriptions: subs,
    balance: w.credits,
    giftedSurveys: gifts._sum.remaining ?? 0,
    ledger: entries,
    payments,
    orgs: adminOrgs.map((m) => ({
      id: m.orgId,
      name: m.org.name,
      credits: m.org.workspace?.credits ?? 0,
    })),
    activeClients: coach
      ? await db.coachClientLink.count({
          where: { coachId: userId, status: { in: ["ACTIVE", "PENDING"] } },
        })
      : 0,
  };
}
