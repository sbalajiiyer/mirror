/**
 * Reminder scheduling ("smart timing" v1) and the job that sends them.
 * Pure scheduling logic lives in `reminderDue` so it can be unit-tested.
 *
 * Policy
 * - Up to MAX_REMINDERS per rater, never more than one every MIN_GAP_HOURS.
 * - First reminder ~3 days after the invite, second ~7 days after.
 * - If there is a due date, a final reminder ~2 days before it (overrides the cadence).
 * - Only on weekdays, between 09:00 and 17:00 UTC (a per-subject time zone comes later).
 * - Never for raters who submitted or declined, or once the assessment is not collecting.
 *
 * Runs from GET /api/cron/reminders (e.g. Vercel Cron, free) or `npm run jobs:reminders`.
 * A queue (Inngest / Trigger.dev) can call `runReminders` later without changes.
 */
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { raterReminderEmail } from "@/lib/email/templates";
import { derivedToken } from "@/lib/tokens";
import { appUrl } from "@/lib/url";

export const MAX_REMINDERS = 3;
export const MIN_GAP_HOURS = 48;
const DAY = 24 * 3600 * 1000;

export type ReminderCandidate = {
  status: "INVITED" | "STARTED" | "SUBMITTED" | "DECLINED";
  invitedAt: Date | null;
  lastRemindedAt: Date | null;
  reminderCount: number;
  hasEmail: boolean;
};

export function isSendWindow(now: Date): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
}

export function reminderDue(
  c: ReminderCandidate,
  dueAt: Date | null,
  now: Date,
): { due: false } | { due: true; final: boolean } {
  if (!c.hasEmail || !c.invitedAt) return { due: false };
  if (c.status === "SUBMITTED" || c.status === "DECLINED") return { due: false };
  if (c.reminderCount >= MAX_REMINDERS) return { due: false };
  if (dueAt && now >= dueAt) return { due: false };
  if (!isSendWindow(now)) return { due: false };
  if (c.lastRemindedAt && now.getTime() - c.lastRemindedAt.getTime() < MIN_GAP_HOURS * 3600 * 1000) return { due: false };

  const sinceInvite = now.getTime() - c.invitedAt.getTime();
  if (dueAt && dueAt.getTime() - now.getTime() <= 2 * DAY && sinceInvite >= DAY) return { due: true, final: true };
  const cadence = [3 * DAY, 7 * DAY];
  const nextAt = cadence[c.reminderCount];
  if (nextAt !== undefined && sinceInvite >= nextAt) return { due: true, final: false };
  return { due: false };
}

export async function runReminders(now = new Date()) {
  const invites = await db.raterInvite.findMany({
    where: {
      status: { in: ["INVITED", "STARTED"] },
      email: { not: null },
      reminderCount: { lt: MAX_REMINDERS },
      assessment: { status: "COLLECTING" },
    },
    include: { assessment: { include: { subject: { include: { profile: true } } } } },
  });
  let sent = 0;
  for (const inv of invites) {
    const decision = reminderDue(
      { status: inv.status, invitedAt: inv.invitedAt, lastRemindedAt: inv.lastRemindedAt, reminderCount: inv.reminderCount, hasEmail: !!inv.email },
      inv.assessment.dueAt,
      now,
    );
    if (!decision.due) continue;
    const subjectName = inv.assessment.subject.profile?.displayName ?? inv.assessment.subject.name ?? "Someone";
    await sendEmail(
      raterReminderEmail({
        to: inv.email!,
        raterName: inv.name,
        subjectName,
        link: appUrl(`/r/${derivedToken("invite", inv.id)}`),
        dueAt: inv.assessment.dueAt,
        final: decision.final,
      }),
    );
    await db.raterInvite.update({
      where: { id: inv.id },
      data: { reminderCount: { increment: 1 }, lastRemindedAt: now },
    });
    sent++;
  }
  return { checked: invites.length, sent };
}
