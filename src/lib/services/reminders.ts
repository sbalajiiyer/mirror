import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { sendEmail } from "@/lib/email";
import { personalReminderEmail, roundReminderEmail } from "@/lib/email/templates";
import { derivedToken } from "@/lib/tokens";
import { appUrl } from "@/lib/url";
import { canRemind, isSendWindow, MAX_MESSAGE, MAX_NOTE, nextSendWindow, renderReminder, TONE_TEMPLATES, TONES, type Tone } from "@/lib/reminders/rules";

/**
 * Rater reminders from one screen. The person who asked for feedback picks raters, edits one
 * polite message (with {fill-ins}), and sends. The same rules as the automatic reminders apply:
 * at most 3 per rater, at least 2 days apart, weekdays in working hours (queued otherwise).
 *
 * Privacy: this only uses what the subject already sees (each rater's status). Answers are never
 * linked to invitations.
 */
type Queued = { message: string; byUserId: string; at: string };

async function ownedCollecting(userId: string, assessmentId: string) {
  const a = await db.assessment.findFirst({ where: { id: assessmentId, subjectId: userId }, include: { subject: { include: { profile: true } } } });
  if (!a) throw new DomainError("Not found", "not_found");
  return a;
}

const nameOf = (a: { subject: { name: string | null; profile: { displayName: string } | null } }) => a.subject.profile?.displayName ?? a.subject.name ?? "Someone";

/** Everything the rater panel shows. */
export async function raterPanel(userId: string, assessmentId: string, now = new Date()) {
  const a = await ownedCollecting(userId, assessmentId);
  const invites = await db.raterInvite.findMany({ where: { assessmentId }, include: { raterGroup: { select: { name: true } } }, orderBy: [{ raterGroup: { order: "asc" } }, { createdAt: "asc" }] });
  const logs = await db.reminderLog.findMany({ where: { assessmentId }, orderBy: { createdAt: "desc" }, take: 50 });
  const tone = (TONES as readonly string[]).includes(a.subject.profile?.reminderTone ?? "") ? (a.subject.profile!.reminderTone as Tone) : "warm";
  const byId = new Map(invites.map((i) => [i.id, i.name || i.email || "Rater"]));
  return {
    collecting: a.status === "COLLECTING",
    subjectName: nameOf(a),
    dueAt: a.dueAt,
    inWindow: isSendWindow(now),
    nextWindow: nextSendWindow(now),
    tone,
    template: a.subject.profile?.reminderTemplate ?? TONE_TEMPLATES[tone],
    raters: invites.map((i) => {
      const e = canRemind({ status: i.status, email: i.email, invitedAt: i.invitedAt, lastRemindedAt: i.lastRemindedAt, reminderCount: i.reminderCount, queued: i.queuedReminder != null }, now);
      return {
        id: i.id,
        name: i.name,
        email: i.email,
        group: i.raterGroup.name,
        status: i.status,
        reminders: i.reminderCount,
        lastRemindedAt: i.lastRemindedAt,
        queued: i.queuedReminder != null,
        note: i.personalNote,
        canRemind: a.status === "COLLECTING" && e.ok,
        reason: a.status !== "COLLECTING" ? "Not collecting feedback" : e.ok ? null : e.reason,
        until: e.ok ? null : (e.until ?? null),
      };
    }),
    history: logs.map((l) => ({ at: l.createdAt, rater: (l.inviteId && byId.get(l.inviteId)) || "Rater", kind: l.kind, outcome: l.outcome, reason: l.reason })),
  };
}

export const sendRemindersSchema = z.object({
  inviteIds: z.array(z.string()).min(1, "Pick at least one person").max(200),
  message: z.string().trim().min(10, "Write a short message").max(MAX_MESSAGE),
  tone: z.enum(TONES).optional(),
  saveTemplate: z.boolean().default(false),
});

async function deliver(inv: { id: string; email: string | null; name: string | null; personalNote: string | null }, a: { id: string; dueAt: Date | null; subject: { email: string | null } }, subjectName: string, template: string) {
  await sendEmail(
    personalReminderEmail({
      to: inv.email!,
      subjectName,
      message: renderReminder(template, { raterName: inv.name, subjectName, dueAt: a.dueAt }),
      note: inv.personalNote,
      link: appUrl(`/r/${derivedToken("invite", inv.id)}`),
      replyTo: a.subject.email,
    }),
  );
}

/** Send (or queue, outside working hours) one message to the selected raters. Skips anyone the rules exclude, with the reason. */
export async function sendReminders(userId: string, assessmentId: string, raw: unknown, now = new Date()) {
  const input = sendRemindersSchema.parse(raw);
  const a = await ownedCollecting(userId, assessmentId);
  if (a.status !== "COLLECTING") throw new DomainError("This 360 isn't collecting feedback.");
  const subjectName = nameOf(a);
  const invites = await db.raterInvite.findMany({ where: { assessmentId, id: { in: input.inviteIds } } });
  const inWindow = isSendWindow(now);
  const result = { sent: 0, queued: 0, skipped: [] as { name: string; reason: string }[], sendsAt: inWindow ? null : nextSendWindow(now) };
  for (const inv of invites) {
    const e = canRemind({ status: inv.status, email: inv.email, invitedAt: inv.invitedAt, lastRemindedAt: inv.lastRemindedAt, reminderCount: inv.reminderCount, queued: inv.queuedReminder != null }, now);
    if (!e.ok) {
      result.skipped.push({ name: inv.name || inv.email || "Rater", reason: e.reason });
      await db.reminderLog.create({ data: { assessmentId, inviteId: inv.id, sentById: userId, kind: "MANUAL", outcome: "SKIPPED", reason: e.reason } });
      continue;
    }
    if (inWindow) {
      await deliver(inv, a, subjectName, input.message);
      await db.raterInvite.update({ where: { id: inv.id }, data: { reminderCount: { increment: 1 }, lastRemindedAt: now } });
      await db.reminderLog.create({ data: { assessmentId, inviteId: inv.id, sentById: userId, kind: "MANUAL", outcome: "SENT" } });
      result.sent++;
    } else {
      const q: Queued = { message: input.message, byUserId: userId, at: now.toISOString() };
      await db.raterInvite.update({ where: { id: inv.id }, data: { queuedReminder: q as unknown as Prisma.InputJsonValue } });
      await db.reminderLog.create({ data: { assessmentId, inviteId: inv.id, sentById: userId, kind: "MANUAL", outcome: "QUEUED", reason: "Outside working hours" } });
      result.queued++;
    }
  }
  if (input.saveTemplate) await db.subjectProfile.update({ where: { userId }, data: { reminderTemplate: input.message, ...(input.tone ? { reminderTone: input.tone } : {}) } });
  await audit(userId, "assessment.remind", "Assessment", assessmentId, { sent: result.sent, queued: result.queued, skipped: result.skipped.length }, { subjectId: userId });
  return result;
}

/** Cancel a queued reminder before it goes out. */
export async function cancelQueuedReminder(userId: string, inviteId: string) {
  const inv = await db.raterInvite.findFirst({ where: { id: inviteId, assessment: { subjectId: userId } } });
  if (!inv) throw new DomainError("Not found", "not_found");
  await db.raterInvite.update({ where: { id: inv.id }, data: { queuedReminder: Prisma.DbNull } });
}

/** Daily job (in the sending window): send reminders that were written outside working hours. */
export async function sendQueuedReminders(now = new Date()) {
  const invites = await db.raterInvite.findMany({
    where: { queuedReminder: { not: Prisma.DbNull } },
    include: { assessment: { include: { subject: { include: { profile: true } } } } },
    take: 1000,
  });
  let sent = 0;
  for (const inv of invites) {
    const q = inv.queuedReminder as unknown as Queued;
    const e = canRemind({ status: inv.status, email: inv.email, invitedAt: inv.invitedAt, lastRemindedAt: inv.lastRemindedAt, reminderCount: inv.reminderCount, queued: false }, now);
    if (inv.assessment.status !== "COLLECTING" || !e.ok) {
      await db.raterInvite.update({ where: { id: inv.id }, data: { queuedReminder: Prisma.DbNull } });
      await db.reminderLog.create({ data: { assessmentId: inv.assessmentId, inviteId: inv.id, sentById: q.byUserId, kind: "MANUAL", outcome: "SKIPPED", reason: e.ok ? "No longer collecting feedback" : e.reason } });
      continue;
    }
    await deliver(inv, inv.assessment, nameOf(inv.assessment), q.message);
    await db.raterInvite.update({ where: { id: inv.id }, data: { queuedReminder: Prisma.DbNull, reminderCount: { increment: 1 }, lastRemindedAt: now } });
    await db.reminderLog.create({ data: { assessmentId: inv.assessmentId, inviteId: inv.id, sentById: q.byUserId, kind: "MANUAL", outcome: "SENT" } });
    sent++;
  }
  return sent;
}

/** A personal line for one rater (in their invitation, if not sent yet, and in every reminder). */
export async function setPersonalNote(userId: string, inviteId: string, raw: string) {
  const note = raw.trim().slice(0, MAX_NOTE);
  const inv = await db.raterInvite.findFirst({ where: { id: inviteId, assessment: { subjectId: userId } } });
  if (!inv) throw new DomainError("Not found", "not_found");
  await db.raterInvite.update({ where: { id: inv.id }, data: { personalNote: note || null } });
}

// ------------------------------------------------------------------ company rounds

const ROUND_MAX = 3;
const ROUND_GAP_HOURS = 48;

/** Admin view of a round: participants who haven't set up their 360, and when they were last reminded. */
export async function roundParticipants(adminId: string, orgId: string, campaignId: string, now = new Date()) {
  const { requireAdmin, campaignMembers } = await import("@/lib/services/org");
  await requireAdmin(adminId, orgId);
  const c = await db.orgCampaign.findFirst({ where: { id: campaignId, orgId } });
  if (!c) throw new DomainError("Not found", "not_found");
  const members = await campaignMembers(orgId, c.groupId);
  const started = new Set((await db.assessment.findMany({ where: { orgCampaignId: c.id }, select: { subjectId: true } })).map((x) => x.subjectId));
  const logs = await db.reminderLog.findMany({ where: { campaignId: c.id, kind: "ROUND", outcome: "SENT" }, orderBy: { createdAt: "desc" } });
  return {
    campaign: c,
    people: members.map((m) => {
      const mine = logs.filter((l) => l.memberId === m.id);
      const last = mine[0]?.createdAt ?? null;
      const done = !!m.userId && started.has(m.userId);
      const reason = done ? "Already set up" : mine.length >= ROUND_MAX ? `Already reminded ${ROUND_MAX} times` : last && now.getTime() - last.getTime() < ROUND_GAP_HOURS * 3600_000 ? "Reminded recently" : null;
      return { memberId: m.id, name: m.name || m.email, started: done, reminders: mine.length, lastRemindedAt: last, canRemind: !reason, reason };
    }),
  };
}

/** Remind participants to set up their own 360 (never their raters: admins can't see or contact raters). */
export async function remindParticipants(adminId: string, orgId: string, campaignId: string, memberIds: string[], now = new Date()) {
  const { requireAdmin } = await import("@/lib/services/org");
  const admin = await requireAdmin(adminId, orgId);
  const view = await roundParticipants(adminId, orgId, campaignId, now);
  const chosen = view.people.filter((p) => memberIds.includes(p.memberId));
  let sent = 0;
  const skipped: { name: string; reason: string }[] = [];
  for (const p of chosen) {
    if (!p.canRemind) {
      skipped.push({ name: p.name, reason: p.reason! });
      continue;
    }
    const m = await db.orgMember.findUniqueOrThrow({ where: { id: p.memberId } });
    await sendEmail(roundReminderEmail({ to: m.email, orgName: admin.org.name, campaignName: view.campaign.name, link: appUrl(`/assessments/new?campaign=${view.campaign.id}`), dueAt: view.campaign.dueAt, fromName: admin.name || "Your admin" }));
    await db.reminderLog.create({ data: { campaignId, memberId: p.memberId, sentById: adminId, kind: "ROUND", outcome: "SENT" } });
    sent++;
  }
  await audit(adminId, "org.round_remind", "OrgCampaign", campaignId, { sent, skipped: skipped.length }, { orgId });
  return { sent, skipped };
}
