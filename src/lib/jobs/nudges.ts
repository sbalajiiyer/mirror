import "server-only";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { nudgeEmail } from "@/lib/email/templates";
import { signPayload } from "@/lib/tokens";
import { appUrl } from "@/lib/url";
import type { StoredPlan } from "@/lib/ai/features/plan";

/** Pick this week's action: open (not done) plan actions, rotating by ISO-ish week number. */
export function pickAction(plan: StoredPlan | null, now: Date): string | null {
  const open = (plan?.areas ?? []).flatMap((a) => a.actions.filter((x) => !x.done).map((x) => x.title));
  if (!open.length) return null;
  const week = Math.floor(now.getTime() / (7 * 86400000));
  return open[week % open.length];
}

/**
 * Weekly nudges (opt-in). Runs from the daily cron: sends to people whose chosen day is today and
 * who haven't had one in the last 6 days, and only if they have an active goal or a plan.
 */
export async function runNudges(now = new Date()) {
  const due = await db.subjectProfile.findMany({
    where: { nudgeDay: now.getUTCDay(), OR: [{ nudgeLastSentAt: null }, { nudgeLastSentAt: { lt: new Date(now.getTime() - 6 * 86400000) } }] },
    include: { user: true },
  });
  let sent = 0;
  for (const p of due) {
    if (!p.user.email) continue;
    const goals = await db.goal.findMany({ where: { userId: p.userId, status: "ACTIVE" }, take: 3 });
    const plan = await db.developmentPlan.findFirst({ where: { userId: p.userId }, orderBy: { updatedAt: "desc" } });
    const action = pickAction((plan?.data as unknown as StoredPlan) ?? null, now);
    if (!goals.length && !action) continue;
    const token = signPayload(`nudge-off:${p.userId}`, 90 * 86400);
    await sendEmail(
      nudgeEmail({
        to: p.user.email,
        firstName: p.displayName.split(" ")[0],
        action,
        goals: goals.map((g) => g.title),
        link: appUrl(plan ? `/assessments/${plan.assessmentId}/plan` : "/progress"),
        unsubscribe: appUrl(`/api/nudges/unsubscribe?t=${encodeURIComponent(token)}`),
      }),
    );
    await db.subjectProfile.update({ where: { id: p.id }, data: { nudgeLastSentAt: now } });
    sent++;
  }
  return { due: due.length, sent };
}
