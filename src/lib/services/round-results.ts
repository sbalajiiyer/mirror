import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { ReportData } from "@/lib/report/compute";
import { ORG_FLOOR, type GroupProfile } from "@/lib/org/analytics";
import { profileFromTotals, addToTotals, type RoundTotals } from "@/lib/org/round-totals";

/**
 * Phase 11: frozen, anonymous round results.
 *
 * When a company round 360 closes with a visible report, its "others" scores are added to running
 * totals for the round ("org") and for each team the person was in at that moment. Totals hold
 * only counts and sums: no user, member or assessment id. They are never reduced, so a person
 * leaving or deleting their account does not change the company's past results.
 */
export async function contributeToRound(assessmentId: string, data?: ReportData | null): Promise<boolean> {
  const a = await db.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, status: true, subjectId: true, roundContributedAt: true, orgCampaign: { select: { id: true, orgId: true } }, reports: data ? undefined : { orderBy: { generatedAt: "desc" }, take: 1, select: { data: true } } },
  });
  if (!a?.orgCampaign || a.status !== "CLOSED" || a.roundContributedAt) return false;
  const report = data ?? ((a.reports?.[0]?.data as unknown as ReportData | undefined) ?? null);
  if (!report?.anonymity.available) return false;

  const { orgId, id: campaignId } = a.orgCampaign;
  const member = await db.orgMember.findFirst({ where: { orgId, userId: a.subjectId, status: "ACTIVE" }, select: { groups: { select: { groupId: true } } } });
  const scopes = ["org", ...(member?.groups.map((g) => g.groupId) ?? [])];

  return db.$transaction(async (tx) => {
    // Claim first, so a retry or a concurrent call can never add the same 360 twice.
    const claimed = await tx.assessment.updateMany({ where: { id: a.id, roundContributedAt: null }, data: { roundContributedAt: new Date() } });
    if (claimed.count === 0) return false;
    for (const scope of scopes) {
      await tx.roundResult.upsert({ where: { campaignId_scope: { campaignId, scope } }, create: { orgId, campaignId, scope }, update: {} });
      const [row] = await tx.$queryRaw<{ id: string; people: number; competencies: RoundTotals["competencies"]; overallN: number; overallSum: number }[]>`
        SELECT "id", "people", "competencies", "overallN", "overallSum" FROM "RoundResult" WHERE "campaignId" = ${campaignId} AND "scope" = ${scope} FOR UPDATE`;
      const next = addToTotals(row, report);
      await tx.roundResult.update({
        where: { id: row.id },
        data: { people: next.people, competencies: next.competencies as unknown as Prisma.InputJsonValue, overallN: next.overallN, overallSum: next.overallSum },
      });
    }
    return true;
  });
}

/** Adds every closed round 360 that hasn't been counted yet (backfill and safety net; idempotent). */
export async function backfillRoundResults(limit = 500) {
  const pending = await db.assessment.findMany({ where: { orgCampaignId: { not: null }, status: "CLOSED", roundContributedAt: null }, select: { id: true }, take: limit });
  let added = 0;
  for (const p of pending) if (await contributeToRound(p.id)) added++;
  return added;
}

/** Frozen profile for a round and scope ("org" or an OrgGroup id), with the org's minimum group size. */
export async function roundProfile(orgId: string, campaignId: string, scope: string, min: number): Promise<GroupProfile> {
  const row = await db.roundResult.findUnique({ where: { campaignId_scope: { campaignId, scope } } });
  if (!row || row.orgId !== orgId) return { people: 0, available: false, competencies: [], overall: null };
  return profileFromTotals(row as unknown as RoundTotals, Math.max(ORG_FLOOR, min));
}
