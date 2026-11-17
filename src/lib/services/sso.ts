import "server-only";
import { resolveTxt } from "node:dns/promises";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { normalizeEmail } from "@/lib/email-address";
import { hashToken, newToken, signPayload, verifySignedPayload } from "@/lib/tokens";
import { appUrl } from "@/lib/url";
import { authorizationUrl, discover, exchangeCode, newAuthRequest, validIssuer } from "@/lib/sso/oidc";
import { requireOwner } from "@/lib/services/org";

/*
 * Enterprise SSO per organization (Phase 10, OIDC). An admin proves the email domain with a DNS
 * TXT record, then connects their identity provider. People with that domain can then sign in
 * through it; when "required", magic links and Google are refused for the domain.
 * Only the org's verified domain is trusted from its IdP, so one org can't sign in someone else.
 */

/** Consumer mail domains can never be claimed for SSO. */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "mail.com", "zoho.com", "yandex.com", "yandex.ru", "qq.com", "163.com", "126.com", "fastmail.com", "hey.com", "tutanota.com",
]);

export const SSO_CALLBACK_PATH = "/api/sso/callback";
export const SSO_COOKIE = "mirror_sso";
export const VERIFY_PREFIX = "mirror-verification=";

const domainOf = (email: string) => email.split("@")[1] ?? "";
const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Enter a domain like example.com");

/** The SSO organization for an email address, if its domain has SSO switched on. */
export async function ssoOrgForEmail(email: string) {
  const d = domainOf(email);
  if (!d) return null;
  const org = await db.organization.findUnique({ where: { ssoDomain: d } });
  return org && org.ssoEnabled && org.ssoDomainVerifiedAt ? org : null;
}

export async function ssoRequiredFor(email: string) {
  return !!(await ssoOrgForEmail(email))?.ssoRequired;
}

export async function ssoSettings(adminId: string, orgId: string) {
  await requireOwner(adminId, orgId);
  const o = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  return {
    domain: o.ssoDomain,
    verifyRecord: o.ssoDomain && o.ssoDomainToken ? `${VERIFY_PREFIX}${o.ssoDomainToken}` : null,
    verified: !!o.ssoDomainVerifiedAt,
    issuer: o.ssoIssuer,
    clientId: o.ssoClientId,
    hasSecret: !!o.ssoClientSecret,
    enabled: o.ssoEnabled,
    required: o.ssoRequired,
    redirectUri: appUrl(SSO_CALLBACK_PATH),
  };
}

export async function setSsoDomain(adminId: string, orgId: string, raw: string) {
  await requireOwner(adminId, orgId);
  const domain = domainSchema.parse(raw);
  if (PUBLIC_EMAIL_DOMAINS.has(domain)) throw new DomainError("Personal email domains can't be used for SSO.");
  const taken = await db.organization.findFirst({ where: { ssoDomain: domain, id: { not: orgId } } });
  if (taken) throw new DomainError("Another organization has already claimed this domain.");
  await db.organization.update({ where: { id: orgId }, data: { ssoDomain: domain, ssoDomainToken: newToken().slice(0, 32), ssoDomainVerifiedAt: null, ssoEnabled: false, ssoRequired: false } });
  await audit(adminId, "sso.domain", "Organization", orgId, { domain });
}

/** Look for the TXT record on the domain itself or on _mirror.<domain>. */
export async function verifySsoDomain(adminId: string, orgId: string, resolver: (host: string) => Promise<string[][]> = resolveTxt) {
  await requireOwner(adminId, orgId);
  const o = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  if (!o.ssoDomain || !o.ssoDomainToken) throw new DomainError("Add your domain first.");
  const want = `${VERIFY_PREFIX}${o.ssoDomainToken}`;
  let found = false;
  for (const host of [o.ssoDomain, `_mirror.${o.ssoDomain}`]) {
    try {
      found ||= (await resolver(host)).some((r) => r.join("").trim() === want);
    } catch {
      /* no record */
    }
  }
  if (!found) throw new DomainError(`We couldn't find the TXT record ${want} on ${o.ssoDomain} yet. DNS changes can take a while; try again later.`);
  await db.organization.update({ where: { id: orgId }, data: { ssoDomainVerifiedAt: new Date() } });
  await audit(adminId, "sso.domain_verified", "Organization", orgId, { domain: o.ssoDomain });
}

export const ssoConfigSchema = z.object({
  issuer: z.string().trim().min(1, "Enter the issuer URL"),
  clientId: z.string().trim().min(1, "Enter the client ID").max(200),
  clientSecret: z.string().trim().max(500).optional(),
  enabled: z.boolean(),
  required: z.boolean(),
});

export async function saveSsoConfig(adminId: string, orgId: string, raw: unknown, fetchImpl: typeof fetch = fetch) {
  await requireOwner(adminId, orgId);
  const input = ssoConfigSchema.parse(raw);
  const issuer = validIssuer(input.issuer);
  if (!issuer) throw new DomainError("The issuer must be an https URL, e.g. https://acme.okta.com");
  const o = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  if (input.enabled && !o.ssoDomainVerifiedAt) throw new DomainError("Verify your domain before switching SSO on.");
  if (!input.clientSecret && !o.ssoClientSecret) throw new DomainError("Enter the client secret.");
  try {
    await discover(issuer, fetchImpl);
  } catch (e) {
    throw new DomainError(`We couldn't read the identity provider's settings: ${e instanceof Error ? e.message : "unknown error"}.`);
  }
  await db.organization.update({
    where: { id: orgId },
    data: {
      ssoIssuer: issuer,
      ssoClientId: input.clientId,
      ...(input.clientSecret ? { ssoClientSecret: encryptSecret(input.clientSecret) } : {}),
      ssoEnabled: input.enabled,
      ssoRequired: input.enabled && input.required,
    },
  });
  await audit(adminId, "sso.config", "Organization", orgId, { issuer, enabled: input.enabled, required: input.enabled && input.required });
}

type SsoState = { s: string; n: string; v: string; o: string; c: string };

/** Start a sign-in: returns the IdP URL and the signed state to keep in a short-lived cookie. */
export async function beginSso(rawEmail: string, callbackUrl: string, fetchImpl: typeof fetch = fetch) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new DomainError("Enter a valid email address.");
  const org = await ssoOrgForEmail(email);
  if (!org) throw new DomainError("Single sign-on isn't set up for this email domain. Use an email link instead.", "no_sso");
  const meta = await discover(org.ssoIssuer!, fetchImpl);
  const r = newAuthRequest();
  const state: SsoState = { s: r.state, n: r.nonce, v: r.verifier, o: org.id, c: callbackUrl };
  return {
    url: authorizationUrl(meta, { clientId: org.ssoClientId!, redirectUri: appUrl(SSO_CALLBACK_PATH), state: r.state, nonce: r.nonce, challenge: r.challenge, loginHint: email }),
    cookie: signPayload(Buffer.from(JSON.stringify(state)).toString("base64url"), 600),
  };
}

/** Finish the IdP round-trip: verify everything, provision the person, and issue a one-time ticket. */
export async function completeSso(q: { code?: string | null; state?: string | null; error?: string | null }, cookie: string | undefined, fetchImpl: typeof fetch = fetch) {
  if (q.error) throw new DomainError("Your identity provider didn't complete the sign-in.");
  const raw = cookie ? verifySignedPayload(cookie) : null;
  const st = raw ? (JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as SsoState) : null;
  if (!st || !q.state || q.state !== st.s || !q.code) throw new DomainError("This sign-in link expired or was already used. Please start again.");
  const org = await db.organization.findUnique({ where: { id: st.o } });
  if (!org?.ssoEnabled || !org.ssoIssuer || !org.ssoClientId || !org.ssoClientSecret || !org.ssoDomain) throw new DomainError("Single sign-on is no longer set up for this organization.");
  const meta = await discover(org.ssoIssuer, fetchImpl);
  let claims;
  try {
    claims = await exchangeCode(meta, { clientId: org.ssoClientId, clientSecret: decryptSecret(org.ssoClientSecret), redirectUri: appUrl(SSO_CALLBACK_PATH), code: q.code, verifier: st.v, nonce: st.n }, fetchImpl);
  } catch (e) {
    console.error("[sso] token exchange failed", e);
    throw new DomainError("We couldn't verify the sign-in with your identity provider.");
  }
  const rawEmail = claims.email ?? (typeof claims.preferred_username === "string" ? claims.preferred_username : "");
  const email = normalizeEmail(String(rawEmail));
  if (!email || claims.email_verified === false || claims.email_verified === "false") throw new DomainError("Your identity provider didn't share a verified email address.");
  if (domainOf(email) !== org.ssoDomain) throw new DomainError(`Only ${org.ssoDomain} addresses can sign in through this organization's SSO.`);

  const name = typeof claims.name === "string" ? claims.name.slice(0, 100) : null;
  const user = await db.user.upsert({ where: { email }, create: { email, name, emailVerified: new Date() }, update: {} });
  if (!user.emailVerified) await db.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
  // Just-in-time membership: invited people become active; removed people stay removed.
  const m = await db.orgMember.findUnique({ where: { orgId_email: { orgId: org.id, email } } });
  if (!m) await db.orgMember.create({ data: { orgId: org.id, userId: user.id, email, name: name ?? undefined, status: "ACTIVE", joinedAt: new Date() } });
  else if (m.status === "INVITED") await db.orgMember.update({ where: { id: m.id }, data: { userId: user.id, status: "ACTIVE", joinedAt: new Date(), inviteTokenHash: null } });
  const ticket = newToken();
  await db.ssoTicket.create({ data: { tokenHash: hashToken(ticket), userId: user.id, expiresAt: new Date(Date.now() + 2 * 60 * 1000) } });
  await audit(user.id, "auth.sso", "Organization", org.id, undefined, { orgId: org.id, subjectId: user.id });
  return { ticket, callbackUrl: st.c };
}

/** Used by the "sso" credentials provider: each ticket works once, within two minutes. */
export async function redeemTicket(ticket: string) {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(ticket)) return null;
  const t = await db.ssoTicket.findUnique({ where: { tokenHash: hashToken(ticket) } });
  if (!t) return null;
  const used = await db.ssoTicket.updateMany({ where: { id: t.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
  if (used.count !== 1) return null;
  return db.user.findUnique({ where: { id: t.userId } });
}

export async function pruneSsoTickets() {
  return (await db.ssoTicket.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86400000) } } })).count;
}
