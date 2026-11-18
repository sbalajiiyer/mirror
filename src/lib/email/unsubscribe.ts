import { db } from "@/lib/db";
import { signPayload, verifySignedPayload } from "@/lib/tokens";
import { appUrl } from "@/lib/url";
import { mailPostalAddress } from "@/lib/legal";

/**
 * Unsubscribe (CAN-SPAM, RFC 8058). Every email except the ones a person directly asked for
 * (sign-in links, email confirmations) carries a working unsubscribe link and our postal address.
 * Unsubscribing adds the address to EmailSuppression; sendEmail then skips it.
 */
export const ESSENTIAL_TEMPLATES = new Set(["magic-link", "personal-email-verify"]);

const FIVE_YEARS = 5 * 365 * 86400;
const norm = (email: string) => email.trim().toLowerCase();

export function unsubscribeToken(email: string) {
  return signPayload(`unsub:${norm(email)}`, FIVE_YEARS);
}

/** The email address a token unsubscribes, or null if it isn't valid. */
export function emailFromUnsubscribeToken(token: string) {
  const p = verifySignedPayload(token);
  return p?.startsWith("unsub:") ? p.slice("unsub:".length) : null;
}

export const unsubscribePageUrl = (email: string) => appUrl(`/u/${encodeURIComponent(unsubscribeToken(email))}`);
/** One-click endpoint for mail clients (List-Unsubscribe-Post). */
export const unsubscribeOneClickUrl = (email: string) => appUrl(`/api/unsubscribe?t=${encodeURIComponent(unsubscribeToken(email))}`);

export async function isSuppressed(email: string) {
  return !!(await db.emailSuppression.findUnique({ where: { email: norm(email) } }));
}

export async function suppress(email: string, source: "link" | "one-click" | "admin" = "link") {
  await db.emailSuppression.upsert({ where: { email: norm(email) }, create: { email: norm(email), source }, update: {} });
}

export async function resubscribe(email: string) {
  await db.emailSuppression.deleteMany({ where: { email: norm(email) } });
}

/** Text footer: who we are, where we are, and how to stop these emails. */
export function emailFooter(email: string) {
  return `\n\n--\nMirror · ${mailPostalAddress()}\nDon't want emails from Mirror? Unsubscribe: ${unsubscribePageUrl(email)}`;
}
