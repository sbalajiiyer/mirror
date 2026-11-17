import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { normalizeEmail } from "@/lib/email-address";
import { sendEmail } from "@/lib/email";
import { personalEmailVerifyEmail } from "@/lib/email/templates";
import { hashToken, newToken } from "@/lib/tokens";
import { appUrl } from "@/lib/url";
import { ssoRequiredFor } from "@/lib/services/sso";

/**
 * Phase 11e: a personal sign-in email. Once verified, an email link to it signs in to this same
 * account, even when the work email's company requires single sign-on. That keeps the Personal
 * space reachable after leaving a company.
 */
const HOURS = 24;

export async function requestPersonalEmail(userId: string, raw: string, now = new Date()) {
  const email = normalizeEmail(raw);
  if (!email) throw new DomainError("Enter a valid email address.");
  const me = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (email === me.email) throw new DomainError("That's already your sign-in email. Add a different, personal address.");
  if (email === me.personalEmail) throw new DomainError("That address is already your personal sign-in email.");
  if (await ssoRequiredFor(email)) throw new DomainError("That address belongs to a company that requires its own sign-in. Use a personal address.");
  // Don't reveal whether another account uses it: just refuse.
  const taken = await db.user.findFirst({ where: { id: { not: userId }, OR: [{ email }, { personalEmail: email }] }, select: { id: true } });
  if (taken) throw new DomainError("That address can't be used. Try another one.");
  const token = newToken();
  await db.user.update({ where: { id: userId }, data: { personalEmailPending: email, personalEmailTokenHash: hashToken(token), personalEmailTokenExp: new Date(now.getTime() + HOURS * 3600_000) } });
  await sendEmail(personalEmailVerifyEmail({ to: email, link: appUrl(`/settings/personal-email/${token}`) }));
  await audit(userId, "account.personal_email_requested", "User", userId, undefined, { subjectId: userId });
}

/** Completes verification. The link only works for the account that asked for it. */
export async function verifyPersonalEmail(userId: string, token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) throw new DomainError("This link isn't valid.", "not_found");
  const u = await db.user.findUnique({ where: { personalEmailTokenHash: hashToken(token) } });
  if (!u || u.id !== userId || !u.personalEmailPending || !u.personalEmailTokenExp || u.personalEmailTokenExp < now) throw new DomainError("This link isn't valid or has expired. Add the address again.", "not_found");
  const email = u.personalEmailPending;
  const taken = await db.user.findFirst({ where: { id: { not: userId }, OR: [{ email }, { personalEmail: email }] }, select: { id: true } });
  if (taken) throw new DomainError("That address can't be used. Try another one.");
  await db.user.update({ where: { id: userId }, data: { personalEmail: email, personalEmailPending: null, personalEmailTokenHash: null, personalEmailTokenExp: null } });
  await audit(userId, "account.personal_email_verified", "User", userId, undefined, { subjectId: userId });
  return email;
}

export async function removePersonalEmail(userId: string) {
  await db.user.update({ where: { id: userId }, data: { personalEmail: null, personalEmailPending: null, personalEmailTokenHash: null, personalEmailTokenExp: null } });
  await audit(userId, "account.personal_email_removed", "User", userId, undefined, { subjectId: userId });
}
