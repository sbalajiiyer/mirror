import "server-only";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";

export async function creditBalance(userId: string) {
  const p = await db.subjectProfile.findUnique({ where: { userId }, select: { aiCredits: true } });
  return p?.aiCredits ?? 0;
}

/** Add credits (manual grants now; Stripe purchases from Phase 9). */
export async function grantCredits(userId: string, amount: number, reason: "grant" | "purchase" | "refund" = "grant", ref?: string) {
  if (!Number.isInteger(amount) || amount <= 0) throw new DomainError("Amount must be a positive whole number");
  await db.$transaction([
    db.subjectProfile.update({ where: { userId }, data: { aiCredits: { increment: amount } } }),
    db.creditLedger.create({ data: { userId, delta: amount, reason, ref } }),
  ]);
}
