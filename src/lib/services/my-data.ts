import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { normalizeEmail } from "@/lib/email-address";

/*
 * Export and deletion on request (Phase 10, GDPR/CCPA). The export holds what Mirror stores about
 * you: profile, your 360s with their frozen reports (aggregates; raters stay anonymous), goals,
 * plans, chats, coaching and organization links, sharing, and billing records.
 */
export async function exportMyData(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      profile: true,
      assessments: { select: { id: true, title: true, type: true, status: true, company: true, tags: true, sessionNumber: true, createdAt: true, closedAt: true, reports: { select: { generatedAt: true, data: true, aiSummary: true } } } },
      goals: true,
      plans: { select: { assessmentId: true, data: true, createdAt: true } },
      chats: { select: { title: true, mode: true, createdAt: true, messages: { select: { role: true, content: true, createdAt: true } } } },
      clientLinks: { select: { status: true, shareReports: true, shareComments: true, shareGoals: true, sharePlan: true, createdAt: true, coach: { select: { name: true } } } },
      orgMemberships: { select: { status: true, role: true, shareReports: true, shareTalentGrid: true, org: { select: { name: true, region: true } } } },
      shareLinks: { select: { kind: true, views: true, createdAt: true, revokedAt: true, expiresAt: true } },
      subscriptions: { select: { plan: true, status: true, currentPeriodEnd: true } },
      payments: { select: { product: true, amountCents: true, currency: true, status: true, createdAt: true } },
      credits: { select: { delta: true, reason: true, createdAt: true } },
    },
  });
  const activity = await db.auditLog.findMany({ where: { subjectId: userId }, select: { action: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1000 });
  await audit(userId, "data.export", "User", userId, { what: "my_data" }, { subjectId: userId });
  return { exportedAt: new Date().toISOString(), note: "Rater answers are anonymous and only appear as aggregates in your reports.", user, activity };
}

/** Permanently delete the account and everything owned by it. */
export async function deleteMyAccount(userId: string, confirmEmail: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.email || normalizeEmail(confirmEmail) !== user.email) throw new DomainError("Type your email address exactly to confirm.");
  const adminOf = await db.orgMember.findMany({ where: { userId, role: "ADMIN", status: "ACTIVE" }, select: { orgId: true, org: { select: { name: true } } } });
  for (const m of adminOf) {
    const others = await db.orgMember.count({ where: { orgId: m.orgId, role: "ADMIN", status: "ACTIVE", userId: { not: userId } } });
    const people = await db.orgMember.count({ where: { orgId: m.orgId, status: { not: "REMOVED" }, userId: { not: userId } } });
    if (!others && people) throw new DomainError(`You're the only admin of ${m.org.name}. Make someone else an admin first.`);
  }
  const soleOrgs: string[] = [];
  for (const m of adminOf) if (!(await db.orgMember.count({ where: { orgId: m.orgId, status: { not: "REMOVED" }, userId: { not: userId } } }))) soleOrgs.push(m.orgId);
  await db.$transaction(async (tx) => {
    // Organizations nobody else belongs to go with the account.
    if (soleOrgs.length) await tx.organization.deleteMany({ where: { id: { in: soleOrgs } } });
    // Questionnaires other people's 360s use stay readable for those 360s but can't be used again.
    await tx.framework.updateMany({ where: { ownerId: userId, assessments: { some: { subjectId: { not: userId } } } }, data: { ownerId: null, isBuiltIn: false } });
    await tx.orgMember.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });
  // The audit row keeps no link to the deleted person.
  await audit(null, "user.deleted", "User", undefined);
}
