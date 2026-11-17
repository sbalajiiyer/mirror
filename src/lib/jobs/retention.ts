import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withoutComments } from "@/lib/coach/brief";
import type { ReportData } from "@/lib/report/compute";

export const RETENTION_CHOICES = [12, 24, 36] as const;

/**
 * Data retention (Phase 10). For organizations with a retention period, raw rater answers and
 * written comments in their 360 rounds are deleted once a 360 has been closed that long. The frozen
 * report keeps its scores and themes (aggregates), so the person's history and trends still work.
 *
 * Phase 11e: the same period also covers AI coach conversations and development plans in the
 * company's workspace (deleted once untouched for that long).
 */
export async function runRetention(now = new Date()) {
  const orgs = await db.organization.findMany({ where: { retentionMonths: { not: null } }, select: { id: true, retentionMonths: true, workspace: { select: { id: true } } } });
  let assessments = 0;
  let chats = 0;
  let plans = 0;
  for (const org of orgs) {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - org.retentionMonths!);
    const due = await db.assessment.findMany({
      where: { status: "CLOSED", closedAt: { lt: cutoff }, orgCampaign: { orgId: org.id }, submissions: { some: {} }, reports: { some: {} } },
      select: { id: true, subjectId: true },
      take: 200,
    });
    for (const a of due) {
      await db.$transaction(async (tx) => {
        const reports = await tx.report.findMany({ where: { assessmentId: a.id } });
        for (const r of reports) {
          const stripped = { ...withoutComments(r.data as unknown as ReportData), commentsHidden: undefined, retentionPurgedAt: now.toISOString() };
          await tx.report.update({ where: { id: r.id }, data: { data: stripped as unknown as Prisma.InputJsonValue, aiThemes: Prisma.DbNull } });
        }
        await tx.submission.deleteMany({ where: { assessmentId: a.id } });
      });
      await audit(null, "retention.purge", "Assessment", a.id, { months: org.retentionMonths }, { orgId: org.id, subjectId: a.subjectId });
      assessments++;
    }
    if (org.workspace) {
      const workspaceId = org.workspace.id;
      const c = (await db.coachChat.deleteMany({ where: { workspaceId, updatedAt: { lt: cutoff } } })).count;
      const p = (await db.developmentPlan.deleteMany({ where: { workspaceId, createdAt: { lt: cutoff } } })).count;
      if (c || p) await audit(null, "retention.purge_workspace", "Organization", org.id, { chats: c, plans: p, months: org.retentionMonths }, { orgId: org.id });
      chats += c;
      plans += p;
    }
  }
  return { assessments, chats, plans };
}
