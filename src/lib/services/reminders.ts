import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { sendEmail } from "@/lib/email";
import { personalReminderEmail, roundReminderEmail } from "@/lib/email/templates";
import { derivedToken } from "@/lib/tokens";
import { appUrl } from "@/lib/url";
import { canRemind, isSendWindow, MAX_MESSAGE, MAX_NOTE, MIN_GAP_HOURS, nextSendWindow, renderReminder, TONE_TEMPLATES, TONES, type Tone } from "@/lib/reminders/rules";

/**
 * Rater reminders from one screen, without revealing who has answered.
 *
 * Anonymity (owner decision 2026-11-18): the person who asked for feedback never sees an
 * individual rater's status. They write one polite message and send it to "everyone who hasn't
 * answered yet"; the server picks the recipients. Results, history and errors never name or count
 * anyone in a way that would show who answered. One manual round every MIN_GAP_HOURS per 360.
 * The same per-rater rules as the automatic reminders still apply (max 3, 2 days apart, weekdays
 * in working hours, queued otherwise).
 */
type Queued = { message: string; byUserId: string; at: string };
const HOUR = 3600_000;

async function ownedCollecting(userId: string, assessmentId: string) {
  const a = await db.assessment.findFirst({ where: { id: assessmentId, subjectId: userId }, include: { subject: { include: { profile: true } } } });
  if (!a) throw new DomainError("Not found", "not_found");
  return a;
}

const nameOf = (a: { subject: { name: string | null; profile: { displayName: string } | null } }) => a.subject.profile?.displayName ?? a.subject.name ?? "Someone";

/** Everything the reminder panel shows: raters without any status, and rounds without names or counts. */
export async function raterPanel(userId: string, assessmentId: string, now = new Date()) {
  const a = await ownedCollecting(userId, assessmentId);
  const invites = await db.raterInvite.findMany({
    where: { assessmentId, email: { not: null } },
    include: { raterGroup: { select: { name: true } } },
    orderBy: [{ raterGroup: { order: "asc" } }, { createdAt: "asc" }],
  });
  const tone = (TONES as readonly string[]).includes(a.subject.profile?.reminderTone ?? "") ? (a.subject.profile!.reminderTone as Tone) : "warm";
  const rounds = await reminderRounds(assessmentId);
  const lastManual = rounds.find((r) => r.kind === "MANUAL")?.at ?? null;
  const nextManualAt = lastManual && lastManual.getTime() + MIN_GAP_HOURS * HOUR > now.getTime() ? new Date(lastManual.getTime() + MIN_GAP_HOURS * HOUR) : null;
  const queued = (await db.raterInvite.count({ where: { assessmentId, queuedReminder: { not: Prisma.DbNull } } })) > 0;
  return {
    collecting: a.status === "COLLECTING",
    subjectName: nameOf(a),
    dueAt: a.dueAt,
    inWindow: isSendWindow(now),
    nextWindow: nextSendWindow(now),
    tone,
    template: a.subject.profile?.reminderTemplate ?? TONE_TEMPLATES[tone],
    raters: invites.map((i) => ({ id: i.id, name: i.name, email: i.email, group: i.raterGroup.name, note: i.personalNote })),
    nextManualAt,
    queued,
    history: rounds,
  };
}

/** Reminder rounds for one 360: when, automatic or by you, sent or queued. No names, no counts. */
async function reminderRounds(assessmentId: string) {
  const logs = await db.reminderLog.findMany({ where: { assessmentId, outcome: { in: ["SENT", "QUEUED"] } }, orderBy: { createdAt: "desc" }, take: 500 });
  const seen = new Set<string>();
  const out: { at: Date; kind: "AUTO" | "MANUAL"; outcome: "SENT" | "QUEUED" }[] = [];
  for (const l of logs) {
    const key = `${l.kind}:${l.outcome}:${l.createdAt.toISOString().slice(0, 13)}`; // one row per kind per hour
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ at: l.createdAt, kind: l.kind as "AUTO" | "MANUAL", outcome: l.outcome as "SENT" | "QUEUED" });
  }
  return out.slice(0, 20);
}

export const sendRemindersSchema = z.object({
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

/**
 * Send one message to everyone who hasn't answered yet (queued outside working hours). The result
 * never says who or how many: only whether it went now or when it will go.
 */
export async function sendReminders(userId: string, assessmentId: string, raw: unknown, now = new Date()) {
  const input = sendRemindersSchema.parse(raw);
  const a = await ownedCollecting(userId, assessmentId);
  if (a.status !== "COLLECTING") throw new DomainError("This 360 isn't collecting feedback.");
  const last = await db.reminderLog.findFirst({ where: { assessmentId, kind: "MANUAL", outcome: { in: ["SENT", "QUEUED"] } }, orderBy: { createdAt: "desc" } });
  if (last && now.getTime() - last.createdAt.getTime() < MIN_GAP_HOURS * HOUR) {
    const next = new Date(last.createdAt.getTime() + MIN_GAP_HOURS * HOUR);
    throw new DomainError(`You sent a reminder recently. The next one can go after ${next.toUTCString().slice(0, 22)} UTC.`, "too_soon");
  }
  const subjectName = nameOf(a);
  const invites = await db.raterInvite.findMany({ where: { assessmentId } });
  const inWindow = isSendWindow(now);
  let reached = 0;
  for (const inv of invites) {
    const e = canRemind({ status: inv.status, email: inv.email, invitedAt: inv.invitedAt, lastRemindedAt: inv.lastRemindedAt, reminderCount: inv.reminderCount, queued: inv.queuedReminder != null }, now);
    if (!e.ok) {
      await db.reminderLog.create({ data: { createdAt: now, assessmentId, inviteId: inv.id, sentById: userId, kind: "MANUAL", outcome: "SKIPPED", reason: e.reason } });
      continue;
    }
    if (inWindow) {
      await deliver(inv, a, subjectName, input.message);
      await db.raterInvite.update({ where: { id: inv.id }, data: { reminderCount: { increment: 1 }, lastRemindedAt: now } });
      await db.reminderLog.create({ data: { createdAt: now, assessmentId, inviteId: inv.id, sentById: userId, kind: "MANUAL", outcome: "SENT" } });
    } else {
      const q: Queued = { message: input.message, byUserId: userId, at: now.toISOString() };
      await db.raterInvite.update({ where: { id: inv.id }, data: { queuedReminder: q as unknown as Prisma.InputJsonValue } });
      await db.reminderLog.create({ data: { createdAt: now, assessmentId, inviteId: inv.id, sentById: userId, kind: "MANUAL", outcome: "QUEUED", reason: "Outside working hours" } });
    }
    reached++;
  }
  // Record the round even if no one needed a reminder, so the gap applies and nothing can be inferred.
  if (reached === 0) await db.reminderLog.create({ data: { createdAt: now, assessmentId, sentById: userId, kind: "MANUAL", outcome: inWindow ? "SENT" : "QUEUED" } });
  if (input.saveTemplate) await db.subjectProfile.update({ where: { userId }, data: { reminderTemplate: input.message, ...(input.tone ? { reminderTone: input.tone } : {}) } });
  await audit(userId, "assessment.remind", "Assessment", assessmentId, { inWindow }, { subjectId: userId });
  return { when: inWindow ? ("now" as const) : ("queued" as const), sendsAt: inWindow ? null : nextSendWindow(now) };
}

/** Cancel the queued reminder round before it goes out. */
export async function cancelQueuedReminders(userId: string, assessmentId: string) {
  await ownedCollecting(userId, assessmentId);
  await db.raterInvite.updateMany({ where: { assessmentId, queuedReminder: { not: Prisma.DbNull } }, data: { queuedReminder: Prisma.DbNull } });
  await db.reminderLog.deleteMany({ where: { assessmentId, kind: "MANUAL", outcome: "QUEUED" } });
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
      await db.reminderLog.create({ data: { createdAt: now, assessmentId: inv.assessmentId, inviteId: inv.id, sentById: q.byUserId, kind: "MANUAL", outcome: "SKIPPED", reason: e.ok ? "No longer collecting feedback" : e.reason } });
      continue;
    }
    await deliver(inv, inv.assessment, nameOf(inv.assessment), q.message);
    await db.raterInvite.update({ where: { id: inv.id }, data: { queuedReminder: Prisma.DbNull, reminderCount: { increment: 1 }, lastRemindedAt: now } });
    await db.reminderLog.create({ data: { createdAt: now, assessmentId: inv.assessmentId, inviteId: inv.id, sentById: q.byUserId, kind: "MANUAL", outcome: "SENT" } });
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
