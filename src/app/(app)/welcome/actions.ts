"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { LEGAL } from "@/lib/legal";
import { AGE_BLOCK_COOKIE, isOldEnough } from "@/lib/age";
import { requireSignedIn } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";

const schema = z.object({
  year: z.number().int().min(1900).max(2100),
  month: z.number().int().min(1).max(12),
  terms: z.literal(true, { message: "Please agree to the terms and privacy policy to continue." }),
});

/**
 * The age check. Under the minimum age: the account is deleted right away (we keep nothing but an
 * anonymous audit entry) and this browser can't retry for a year. Otherwise only the outcome is saved.
 */
export async function confirmAgeAction(raw: unknown): Promise<ActionResult<{ blocked: boolean }>> {
  try {
    const userId = await requireSignedIn("/welcome");
    const jar = await cookies();
    const input = schema.parse(raw);
    const blockedBefore = jar.get(AGE_BLOCK_COOKIE)?.value === "blocked";
    if (blockedBefore || !isOldEnough(input.year, input.month, LEGAL.minimumAge)) {
      jar.set(AGE_BLOCK_COOKIE, "blocked", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 365 * 86400, path: "/" });
      await db.user.delete({ where: { id: userId } }).catch(() => {});
      await audit(null, "account.age_blocked", "User");
      return { ok: true, data: { blocked: true } };
    }
    const now = new Date();
    await db.user.update({ where: { id: userId }, data: { ageConfirmedAt: now, termsAcceptedAt: now } });
    await audit(userId, "account.age_confirmed", "User", userId, undefined, { subjectId: userId });
    return { ok: true, data: { blocked: false } };
  } catch (e) {
    return toActionError(e);
  }
}
