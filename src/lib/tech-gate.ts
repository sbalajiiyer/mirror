import "server-only";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { signPayload, verifySignedPayload } from "@/lib/tokens";

/*
 * Password gate for the unlinked solution & tech page (/tech). Only a scrypt hash of the password is
 * configured (TECH_PAGE_PASSWORD_HASH), never the password itself. Without it, the page stays locked.
 * Make a hash: npm run tech:hash -- '<password>'
 */

export const TECH_COOKIE = "mirror_tech";

export function hashTechPassword(password: string, salt = randomBytes(16).toString("base64url")) {
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString("base64url")}`;
}

export function checkTechPassword(password: string, stored = process.env.TECH_PAGE_PASSWORD_HASH ?? "") {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash || !password) return false;
  const a = scryptSync(password, salt, 32);
  const b = Buffer.from(hash, "base64url");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const techGateConfigured = () => !!process.env.TECH_PAGE_PASSWORD_HASH;
export const techPass = () => signPayload("tech-page", 7 * 86400);
export const validTechPass = (v: string | undefined) => !!v && verifySignedPayload(v) === "tech-page";
