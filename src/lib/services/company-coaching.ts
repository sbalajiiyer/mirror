import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { normalizeEmail } from "@/lib/email-address";
import { sendEmail } from "@/lib/email";
import { coachInviteEmail, companyCoachingOfferEmail } from "@/lib/email/templates";
import { hashToken, newToken } from "@/lib/tokens";
import { appUrl } from "@/lib/url";
import { requireAdmin } from "@/lib/services/org";

/**
 * Phase 11e: coaching a company offers and pays for.
 *
 * 1. An admin offers a coach (by email) to an employee.
 * 2. The employee accepts or declines. Nothing is shared before they accept.
 * 3. The coach is then invited, exactly as if the employee had asked them.
 * The coach sees only what the employee chooses to share, as with any coach. The company sees
 * who is coached by whom and the status, never the coaching content. These clients don't count
 * against the coach's own plan.
 */
export async function offerCoaching(adminId: string, orgId: string, memberId: string, rawCoachEmail: string) {
  const admin = await requireAdmin(adminId, orgId);
  const coachEmail = normalizeEmail(rawCoachEmail);
  if (!coachEmail) throw new DomainError("Enter the coach's email address.");
  const m = await db.orgMember.findFirst({ where: { id: memberId, orgId, status: "ACTIVE", userId: { not: null } } });
  if (!m) throw new DomainError("Not found", "not_found");
  if (normalizeEmail(m.email) === coachEmail) throw new DomainError("Someone can't be their own coach.");
  const coach = await db.user.findUnique({ where: { email: coachEmail }, select: { id: true } });
  const open = await db.coachClientLink.findFirst({
    where: { clientId: m.userId!, status: { in: ["PENDING", "ACTIVE"] }, OR: [{ inviteEmail: coachEmail }, ...(coach ? [{ coachId: coach.id }] : [])] },
  });
  if (open) throw new DomainError("This person already has (or has been offered) this coach.");
  const link = await db.coachClientLink.create({
    data: { clientId: m.userId!, coachId: coach?.id ?? null, initiatedBy: "ORG", inviteEmail: coachEmail, orgId, shareComments: false },
  });
  await sendEmail(companyCoachingOfferEmail({ to: m.email, orgName: admin.org.name, coachEmail, link: appUrl("/coaching") }));
  await audit(adminId, "org.coaching_offer", "CoachClientLink", link.id, undefined, { orgId, subjectId: m.userId });
  return link;
}

/** The employee's answer. Accepting invites the coach; declining ends the offer. */
export async function respondToCompanyOffer(userId: string, linkId: string, accept: boolean) {
  const link = await db.coachClientLink.findFirst({ where: { id: linkId, clientId: userId, initiatedBy: "ORG", status: "PENDING", clientAcceptedAt: null }, include: { org: true } });
  if (!link) throw new DomainError("Not found", "not_found");
  if (!accept) {
    await db.coachClientLink.update({ where: { id: link.id }, data: { status: "DECLINED", endedAt: new Date() } });
    await audit(userId, "coach.company_offer_declined", "CoachClientLink", link.id, undefined, { orgId: link.orgId, subjectId: userId });
    return;
  }
  const token = newToken();
  await db.coachClientLink.update({ where: { id: link.id }, data: { clientAcceptedAt: new Date(), inviteTokenHash: hashToken(token) } });
  const me = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
  const name = me.profile?.displayName ?? me.name ?? "A Mirror user";
  await sendEmail(coachInviteEmail({ to: link.inviteEmail, fromName: link.org ? `${name} (${link.org.name})` : name, asRole: "coach", link: appUrl(`/coaching/invite/${token}`) }));
  await audit(userId, "coach.company_offer_accepted", "CoachClientLink", link.id, undefined, { orgId: link.orgId, subjectId: userId });
}

const STATUS = (l: { status: string; clientAcceptedAt: Date | null }) =>
  l.status === "ACTIVE" ? "Active" : l.status === "PENDING" ? (l.clientAcceptedAt ? "Waiting for the coach" : "Offered") : l.status === "DECLINED" ? "Declined" : "Ended";

/** Admin view: who is coached by whom, and the status. Never any coaching content. */
export async function companyCoaching(adminId: string, orgId: string) {
  await requireAdmin(adminId, orgId);
  const links = await db.coachClientLink.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, include: { coach: { include: { coachProfile: true } } } });
  const members = await db.orgMember.findMany({ where: { orgId, userId: { in: links.map((l) => l.clientId).filter((x): x is string => !!x) } }, select: { userId: true, name: true, email: true } });
  const person = new Map(members.map((m) => [m.userId!, m.name || m.email]));
  return links.map((l) => ({
    id: l.id,
    person: (l.clientId && person.get(l.clientId)) || "Former member",
    coach: l.coach?.coachProfile?.displayName ?? l.coach?.name ?? l.inviteEmail,
    status: STATUS(l),
    open: l.status === "ACTIVE" || l.status === "PENDING",
  }));
}

/** The company stops paying: the coaching relationship ends for both sides. */
export async function endCompanyCoaching(adminId: string, orgId: string, linkId: string) {
  await requireAdmin(adminId, orgId);
  const link = await db.coachClientLink.findFirst({ where: { id: linkId, orgId, status: { in: ["ACTIVE", "PENDING"] } } });
  if (!link) throw new DomainError("Not found", "not_found");
  await db.coachClientLink.update({ where: { id: link.id }, data: { status: "REVOKED", endedAt: new Date(), inviteTokenHash: null } });
  await audit(adminId, "org.coaching_end", "CoachClientLink", link.id, undefined, { orgId, subjectId: link.clientId });
}

/** When someone leaves a company, the coaching it paid for ends. */
export async function endCompanyCoachingFor(userId: string, orgId: string) {
  await db.coachClientLink.updateMany({ where: { clientId: userId, orgId, status: { in: ["ACTIVE", "PENDING"] } }, data: { status: "REVOKED", endedAt: new Date(), inviteTokenHash: null } });
}
