import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { referralFeeCents } from "@/lib/billing/catalog";
import { billingEnforced, coachPlan } from "@/lib/services/billing";
import { inviteCoach } from "@/lib/services/coach";

/*
 * Coach marketplace (Phase 9). Coaches on a paid plan can list themselves; they appear once a platform
 * admin has verified them (npm run coach:verify -- <email>). A client's intro request is an ordinary
 * client→coach invitation; if the coach accepts, a referral fee (10% of one session, min $15) is due.
 */

export const listingSchema = z.object({
  listed: z.boolean(),
  headline: z.string().trim().max(120).optional().default(""),
  bio: z.string().trim().max(1500).optional().default(""),
  specialties: z.array(z.string().trim().min(2).max(40)).max(8).default([]),
  languages: z.array(z.string().trim().min(2).max(30)).max(6).default([]),
  sessionPriceCents: z.number().int().min(0).max(100000).nullable().optional(),
});

export async function updateListing(coachId: string, raw: unknown) {
  const input = listingSchema.parse(raw);
  const p = await db.coachProfile.findUnique({ where: { userId: coachId } });
  if (!p) throw new DomainError("Set up your coach workspace first.");
  if (input.listed && billingEnforced() && (await coachPlan(coachId)) === "COACH_FREE") throw new DomainError("Listing in the marketplace needs a Coach Starter or Coach Pro plan. See Billing for options.", "upgrade_required");
  if (input.listed && (!input.headline || !input.bio)) throw new DomainError("Add a headline and a short bio before listing.");
  await db.coachProfile.update({ where: { userId: coachId }, data: { ...input, sessionPriceCents: input.sessionPriceCents ?? null } });
  await audit(coachId, "marketplace.listing", "CoachProfile", coachId, { listed: input.listed });
}

export async function listCoaches(filter: { specialty?: string; language?: string; q?: string } = {}) {
  const rows = await db.coachProfile.findMany({ where: { listed: true, verified: true }, include: { user: { include: { subscriptions: { where: { status: { in: ["ACTIVE", "CANCELED"] }, currentPeriodEnd: { gt: new Date() } } } } } } });
  const q = filter.q?.toLowerCase().trim();
  return rows
    .filter((c) => !filter.specialty || c.specialties.some((s) => s.toLowerCase() === filter.specialty!.toLowerCase()))
    .filter((c) => !filter.language || c.languages.some((s) => s.toLowerCase() === filter.language!.toLowerCase()))
    .filter((c) => !q || `${c.displayName} ${c.headline ?? ""} ${c.bio ?? ""} ${c.specialties.join(" ")}`.toLowerCase().includes(q))
    .map((c) => ({ id: c.userId, name: c.displayName, brand: c.brandName, headline: c.headline, bio: c.bio, specialties: c.specialties, languages: c.languages, sessionPriceCents: c.sessionPriceCents, website: c.website, pro: c.user.subscriptions.some((s) => s.plan === "COACH_PRO") }))
    .sort((a, b) => Number(b.pro) - Number(a.pro) || a.name.localeCompare(b.name));
}

export async function publicCoach(coachId: string) {
  return (await listCoaches()).find((c) => c.id === coachId) ?? null;
}

/** A client asks a listed coach for an intro: a client→coach invitation plus a referral record. */
export async function requestIntro(clientId: string, coachId: string) {
  const coach = await publicCoach(coachId);
  if (!coach) throw new DomainError("Not found", "not_found");
  const coachUser = await db.user.findUniqueOrThrow({ where: { id: coachId } });
  const link = await inviteCoach(clientId, coachUser.email!);
  await db.marketplaceReferral.create({ data: { coachId, clientId, linkId: link.id, feeCents: referralFeeCents(coach.sessionPriceCents) } });
  await audit(clientId, "marketplace.intro", "CoachProfile", coachId);
  return link;
}

/** Called when a coach answers an invitation: settles any marketplace referral for that link. */
export async function settleReferral(linkId: string, accepted: boolean) {
  await db.marketplaceReferral.updateMany({ where: { linkId, status: "PENDING" }, data: accepted ? { status: "ACCEPTED", acceptedAt: new Date() } : { status: "DECLINED" } });
}

export async function coachReferrals(coachId: string) {
  const refs = await db.marketplaceReferral.findMany({ where: { coachId }, orderBy: { createdAt: "desc" } });
  return { refs, dueCents: refs.filter((r) => r.status === "ACCEPTED").reduce((n, r) => n + r.feeCents, 0) };
}
