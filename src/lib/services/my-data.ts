import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { normalizeEmail } from "@/lib/email-address";
import { surveyCode } from "@/lib/survey";

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

export const DELETION_GRACE_DAYS = 7;

async function assertCanLeaveOrgs(userId: string) {
  const adminOf = await db.orgMember.findMany({ where: { userId, role: "ADMIN", status: "ACTIVE" }, select: { orgId: true, org: { select: { name: true } } } });
  const soleOrgs: string[] = [];
  for (const m of adminOf) {
    const others = await db.orgMember.count({ where: { orgId: m.orgId, role: "ADMIN", status: "ACTIVE", userId: { not: userId } } });
    const people = await db.orgMember.count({ where: { orgId: m.orgId, status: { not: "REMOVED" }, userId: { not: userId } } });
    if (!others && people) throw new DomainError(`You're the only admin of ${m.org.name}. Make someone else an admin first.`);
    if (!people) soleOrgs.push(m.orgId);
  }
  return soleOrgs;
}

async function confirmEmailOf(userId: string, confirmEmail: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.email || normalizeEmail(confirmEmail) !== user.email) throw new DomainError("Type your email address exactly to confirm.");
  return user;
}

/**
 * Like GitHub: deleting your account starts a 7-day grace period. Public share links and API tokens
 * stop working at once and every device is signed out; signing in again before the date cancels it.
 */
export async function scheduleAccountDeletion(userId: string, confirmEmail: string, now = new Date()) {
  await confirmEmailOf(userId, confirmEmail);
  await assertCanLeaveOrgs(userId);
  const at = new Date(now.getTime() + DELETION_GRACE_DAYS * 86400000);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { deletionScheduledAt: at } }),
    db.shareLink.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
    db.apiToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
  ]);
  await audit(userId, "account.deletion_scheduled", "User", userId, { at: at.toISOString() }, { subjectId: userId });
  return at;
}

export async function cancelAccountDeletion(userId: string) {
  const r = await db.user.updateMany({ where: { id: userId, deletionScheduledAt: { not: null } }, data: { deletionScheduledAt: null } });
  if (r.count) await audit(userId, "account.deletion_cancelled", "User", userId, undefined, { subjectId: userId });
  return r.count > 0;
}

/** Shown once on the dashboard after signing in cancelled a deletion. */
export async function recentlyCancelledDeletion(userId: string) {
  return !!(await db.auditLog.findFirst({ where: { subjectId: userId, action: "account.deletion_cancelled", createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } } }));
}

/** Daily cron: permanently delete accounts whose grace period has ended. */
export async function purgeScheduledDeletions(now = new Date()) {
  const due = await db.user.findMany({ where: { deletionScheduledAt: { lte: now } }, select: { id: true } });
  let deleted = 0;
  for (const u of due) {
    try {
      await deleteAccountNow(u.id);
      deleted++;
    } catch (e) {
      // e.g. became the only admin of an org with people in the meantime: keep it and retry tomorrow.
      console.error("[deletion] could not delete scheduled account", e);
    }
  }
  return { deleted };
}

/** Delete a whole category of your own data (Settings → Danger zone). */
export async function deleteCategory(userId: string, category: "chats" | "goals" | "shares") {
  let count = 0;
  if (category === "chats") count = (await db.coachChat.deleteMany({ where: { userId } })).count;
  if (category === "goals") {
    const g = await db.goal.deleteMany({ where: { userId } });
    const p = await db.developmentPlan.deleteMany({ where: { userId } });
    count = g.count + p.count;
  }
  if (category === "shares") count = (await db.shareLink.deleteMany({ where: { userId } })).count;
  await audit(userId, `data.delete_${category}`, "User", userId, { count }, { subjectId: userId });
  return count;
}

/**
 * Delete one 360. Deleting the first session of a survey deletes the whole survey (every session,
 * pulse and re-run); deleting a later session removes just that one. Confirm with the survey ID.
 */
export async function deleteSurveyOrSession(userId: string, assessmentId: string, confirmCode: string) {
  const a = await db.assessment.findFirst({ where: { id: assessmentId, subjectId: userId } });
  if (!a) throw new DomainError("Not found", "not_found");
  const rootId = a.rootAssessmentId ?? a.id;
  if (confirmCode.trim().toUpperCase() !== surveyCode(rootId)) throw new DomainError(`Type the survey ID ${surveyCode(rootId)} to confirm.`);
  const whole = !a.rootAssessmentId;
  const sessions = whole ? await db.assessment.count({ where: { OR: [{ id: a.id }, { rootAssessmentId: a.id }] } }) : 1;
  await db.assessment.delete({ where: { id: a.id } }); // cascades responses, reports, plans, goals, share links and (for a root) later sessions
  await audit(userId, whole ? "data.delete_survey" : "data.delete_session", "Assessment", a.id, { sessions }, { subjectId: userId });
  return { whole, sessions };
}

/** Permanently delete the account and everything owned by it (after the grace period, or in tests). */
export async function deleteMyAccount(userId: string, confirmEmail: string) {
  await confirmEmailOf(userId, confirmEmail);
  await deleteAccountNow(userId);
}

async function deleteAccountNow(userId: string) {
  const soleOrgs = await assertCanLeaveOrgs(userId);
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
