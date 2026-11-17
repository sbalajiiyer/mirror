import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { creditsLabel, formatCredits } from "@/lib/billing/pricing";

/**
 * Credit wallets. Each workspace has one: a person's personal workspace holds their credits, a
 * company workspace holds the company's. Amounts are hundredths of a credit ($1 = 1 credit = 100).
 * Every change writes a CreditLedger row with the balance after it.
 */
type Tx = Prisma.TransactionClient;

export class CreditsRequired extends DomainError {
  constructor(
    message: string,
    public readonly need: number,
    public readonly has: number,
    public readonly orgId: string | null = null,
  ) {
    super(message, "credits_required");
  }
}

export async function personalWorkspaceId(
  userId: string,
  tx: Tx | typeof db = db,
) {
  const w = await tx.workspace.findUnique({
    where: { ownerId: userId },
    select: { id: true },
  });
  if (!w)
    throw new DomainError(
      "Your personal workspace is missing. Please sign out and in again.",
    );
  return w.id;
}

export async function companyWorkspaceId(
  orgId: string,
  tx: Tx | typeof db = db,
) {
  return (
    await tx.workspace.findUniqueOrThrow({
      where: { orgId },
      select: { id: true },
    })
  ).id;
}

export async function balance(workspaceId: string, tx: Tx | typeof db = db) {
  return (
    (
      await tx.workspace.findUnique({
        where: { id: workspaceId },
        select: { credits: true },
      })
    )?.credits ?? 0
  );
}

/** A person's personal balance in hundredths. */
export async function creditBalance(userId: string) {
  const w = await db.workspace.findUnique({
    where: { ownerId: userId },
    select: { credits: true },
  });
  return w?.credits ?? 0;
}

type Entry = {
  workspaceId: string;
  userId: string;
  orgId?: string | null;
  reason: string;
  ref?: string | null;
};

/** Add credits to a wallet. */
export async function addCredits(tx: Tx, e: Entry & { amount: number }) {
  if (!Number.isInteger(e.amount) || e.amount <= 0)
    throw new DomainError("Amount must be positive");
  const w = await tx.workspace.update({
    where: { id: e.workspaceId },
    data: { credits: { increment: e.amount } },
    select: { credits: true },
  });
  await tx.creditLedger.create({
    data: {
      workspaceId: e.workspaceId,
      userId: e.userId,
      orgId: e.orgId ?? null,
      delta: e.amount,
      reason: e.reason,
      ref: e.ref ?? null,
      balanceAfter: w.credits,
    },
  });
  return w.credits;
}

/**
 * Take credits from a wallet, all or nothing; atomic, so two tabs can't spend the same credits.
 * Throws CreditsRequired with what's missing.
 */
export async function spendCredits(
  tx: Tx,
  e: Entry & { amount: number; what: string },
) {
  if (e.amount <= 0) return balance(e.workspaceId, tx);
  const r = await tx.workspace.updateMany({
    where: { id: e.workspaceId, credits: { gte: e.amount } },
    data: { credits: { decrement: e.amount } },
  });
  if (r.count !== 1) {
    const has = await balance(e.workspaceId, tx);
    const who = e.orgId ? "The company has" : "You have";
    throw new CreditsRequired(
      `${e.what} costs ${creditsLabel(e.amount)}. ${who} ${formatCredits(has)}. Add credits on the Billing page to continue.`,
      e.amount,
      has,
      e.orgId ?? null,
    );
  }
  const after = await balance(e.workspaceId, tx);
  await tx.creditLedger.create({
    data: {
      workspaceId: e.workspaceId,
      userId: e.userId,
      orgId: e.orgId ?? null,
      delta: -e.amount,
      reason: e.reason,
      ref: e.ref ?? null,
      balanceAfter: after,
    },
  });
  return after;
}

/**
 * Take up to `amount`, never below zero (premium AI is charged after the reply, so the last request
 * may cost slightly more than what's left). Returns what was actually taken.
 */
export async function spendUpTo(e: Entry & { amount: number }) {
  if (e.amount <= 0) return 0;
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ before: number; credits: number }[]>`
      UPDATE "Workspace" w SET "credits" = w."credits" - LEAST(w."credits", ${e.amount})
      FROM (SELECT "id", "credits" AS before FROM "Workspace" WHERE "id" = ${e.workspaceId} FOR UPDATE) old
      WHERE w."id" = old."id" RETURNING old.before, w."credits"`;
    const row = rows[0];
    if (!row) return 0;
    const taken = row.before - row.credits;
    if (taken > 0)
      await tx.creditLedger.create({
        data: {
          workspaceId: e.workspaceId,
          userId: e.userId,
          orgId: e.orgId ?? null,
          delta: -taken,
          reason: e.reason,
          ref: e.ref ?? null,
          balanceAfter: row.credits,
        },
      });
    return taken;
  });
}

/** Give a person credits (support, refunds, tests). `credits` is whole credits. */
export async function grantCredits(
  userId: string,
  credits: number,
  reason: "grant" | "purchase" | "refund" = "grant",
  ref?: string,
) {
  if (!Number.isInteger(credits) || credits <= 0)
    throw new DomainError("Amount must be a positive whole number");
  const workspaceId = await personalWorkspaceId(userId);
  return db.$transaction((tx) =>
    addCredits(tx, { workspaceId, userId, amount: credits * 100, reason, ref }),
  );
}

/** Give a company credits. `credits` is whole credits. */
export async function grantOrgCredits(
  orgId: string,
  actorId: string,
  credits: number,
  reason: "grant" | "purchase" | "refund" | "welcome" = "grant",
  ref?: string,
) {
  const workspaceId = await companyWorkspaceId(orgId);
  return db.$transaction((tx) =>
    addCredits(tx, {
      workspaceId,
      userId: actorId,
      orgId,
      amount: Math.round(credits * 100),
      reason,
      ref,
    }),
  );
}

export const LEDGER_REASON: Record<string, string> = {
  purchase: "Bought credits",
  grant: "Credits added by Mirror",
  welcome: "Welcome credits",
  refund: "Refund",
  conversion: "Converted from earlier plan",
  survey: "360 survey",
  follow_up: "Follow-up session",
  pulse: "Pulse check",
  round: "Company 360 round",
  coach_gift: "Gifted a 360 to a client",
  ai_premium: "Premium AI",
  ai_questionnaire: "AI questionnaire (earlier plan)",
  ai_chat: "Premium conversation (earlier plan)",
};

export async function ledger(workspaceId: string, take = 30) {
  return db.creditLedger.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
