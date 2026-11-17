import type { OrgMember, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { endCompanyCoachingFor } from "@/lib/services/company-coaching";
import { DomainError } from "@/lib/errors";
import type { ReportData } from "@/lib/report/compute";
import { DELETION_GRACE_DAYS } from "@/lib/services/my-data";

/**
 * Phase 11d: leaving a company.
 *
 * When someone leaves or is removed, their own data in the company workspace is kept for
 * DELETION_GRACE_DAYS and then deleted. During that time they may copy their round reports to
 * Personal, if the company allows it. Copies keep scores, comment themes and the AI summary, but
 * never raters' written comments, which stay under the company's rules. The company's frozen
 * round totals (RoundResult) are not affected.
 */
const DAY = 24 * 3600 * 1000;

/** Record the exit and schedule deletion of the person's company-workspace data. */
export async function startExit(m: Pick<OrgMember, "id" | "userId" | "orgId">, now = new Date()) {
  if (!m.userId) return;
  // Coaching the company paid for ends when the person leaves (Phase 11e).
  await endCompanyCoachingFor(m.userId, m.orgId);
  await db.orgMember.update({ where: { id: m.id }, data: { exitedAt: now, exitPurgeAt: new Date(now.getTime() + DELETION_GRACE_DAYS * DAY) } });
}

/** Rejoining within the grace period keeps everything. */
export async function cancelExit(userId: string, orgId: string) {
  await db.orgMember.updateMany({ where: { userId, orgId, exitPurgeAt: { not: null } }, data: { exitPurgeAt: null } });
}

async function companyWorkspaceId(orgId: string) {
  return (await db.workspace.findUniqueOrThrow({ where: { orgId }, select: { id: true } })).id;
}

const copiable = (userId: string, workspaceId: string) => ({ subjectId: userId, workspaceId, status: "CLOSED" as const, reports: { some: {} } });

/** Companies this person left recently, with what they can still do before deletion. */
export async function pendingExits(userId: string, now = new Date()) {
  const rows = await db.orgMember.findMany({
    where: { userId, status: "REMOVED", exitPurgeAt: { gt: now } },
    select: { id: true, orgId: true, exitPurgeAt: true, exitCopiedAt: true, org: { select: { name: true, allowPersonalCopy: true } } },
    orderBy: { exitPurgeAt: "asc" },
  });
  return Promise.all(
    rows.map(async (r) => ({
      memberId: r.id,
      orgName: r.org.name,
      deleteAt: r.exitPurgeAt!,
      copyAllowed: r.org.allowPersonalCopy,
      copied: !!r.exitCopiedAt,
      reports: await db.assessment.count({ where: copiable(userId, await companyWorkspaceId(r.orgId)) }),
    })),
  );
}

/** Report data with raters' written comments removed; themes keep only labels, counts and sentiment. */
export function withoutComments(d: ReportData): ReportData {
  const strip = <T extends { comments: unknown[] }>(t: T) => ({ ...t, comments: [] });
  return {
    ...d,
    comments: {
      ...d.comments,
      themes: d.comments.themes.map(strip),
      ssc: { START: d.comments.ssc.START.map(strip), STOP: d.comments.ssc.STOP.map(strip), CONTINUE: d.comments.ssc.CONTINUE.map(strip) },
      competency: {},
      wordCloud: [],
    },
  };
}

/** Copy the person's closed round reports into Personal. Allowed once, during the grace period. */
export async function copyReportsToPersonal(userId: string, memberId: string, now = new Date()) {
  const m = await db.orgMember.findFirst({ where: { id: memberId, userId, status: "REMOVED", exitPurgeAt: { gt: now } }, include: { org: true } });
  if (!m) throw new DomainError("Not found", "not_found");
  if (!m.org.allowPersonalCopy) throw new DomainError(`${m.org.name} doesn't allow copying reports after leaving.`, "forbidden");
  if (m.exitCopiedAt) throw new DomainError("Your reports were already copied.");
  const source = await db.assessment.findMany({
    where: copiable(userId, await companyWorkspaceId(m.orgId)),
    include: { reports: { orderBy: { generatedAt: "desc" }, take: 1 } },
    orderBy: { closedAt: "asc" },
  });
  let copied = 0;
  const newId = new Map<string, string>();
  await db.$transaction(async (tx) => {
    for (const a of source) {
      const r = a.reports[0];
      if (!r) continue;
      const copy = await tx.assessment.create({
        data: {
          subjectId: userId,
          title: a.title,
          type: a.type,
          goal: a.goal,
          frameworkId: a.frameworkId,
          status: "CLOSED",
          scaleMax: a.scaleMax,
          minRatersPerGroup: a.minRatersPerGroup,
          showManagerSeparately: a.showManagerSeparately,
          inviteMessage: "",
          closedAt: a.closedAt,
          unlockedAt: a.unlockedAt,
          // Keep sessions of the same survey together when their first session was copied too.
          rootAssessmentId: a.rootAssessmentId ? (newId.get(a.rootAssessmentId) ?? null) : null,
          sessionNumber: a.rootAssessmentId && newId.has(a.rootAssessmentId) ? a.sessionNumber : 1,
          sessionLabel: a.sessionLabel,
          company: a.company ?? m.org.name,
          tags: a.tags,
          copiedFrom: m.org.name,
        },
      });
      newId.set(a.id, copy.id);
      const themes = r.aiThemes as { themes?: { comments?: unknown[] }[] } | null;
      await tx.report.create({
        data: {
          assessmentId: copy.id,
          version: r.version,
          generatedAt: r.generatedAt,
          data: withoutComments(r.data as unknown as ReportData) as unknown as Prisma.InputJsonValue,
          ...(r.aiSummary ? { aiSummary: r.aiSummary as Prisma.InputJsonValue } : {}),
          ...(themes?.themes ? { aiThemes: { ...themes, themes: themes.themes.map((t) => ({ ...t, comments: [] })) } as unknown as Prisma.InputJsonValue } : {}),
        },
      });
      copied++;
    }
    await tx.orgMember.update({ where: { id: m.id }, data: { exitCopiedAt: now } });
  });
  await audit(userId, "org.exit_copy", "Organization", m.orgId, { reports: copied }, { subjectId: userId });
  return copied;
}

/** Daily job: delete company-workspace data of people whose grace period has ended. */
export async function purgeExits(now = new Date()) {
  const due = await db.orgMember.findMany({ where: { status: { not: "ACTIVE" }, exitPurgeAt: { lte: now }, userId: { not: null } }, select: { id: true, orgId: true, userId: true } });
  let people = 0;
  for (const m of due) {
    // Someone who rejoined keeps their data (a new ACTIVE row exists for the same person).
    const back = await db.orgMember.findFirst({ where: { orgId: m.orgId, userId: m.userId, status: "ACTIVE" } });
    if (!back) {
      const workspaceId = await companyWorkspaceId(m.orgId);
      await db.assessment.deleteMany({ where: { subjectId: m.userId!, workspaceId } });
      await db.coachChat.deleteMany({ where: { userId: m.userId!, workspaceId } });
      await audit(null, "org.exit_purged", "Organization", m.orgId, undefined, { orgId: m.orgId, subjectId: m.userId });
      people++;
    }
    await db.orgMember.update({ where: { id: m.id }, data: { exitPurgeAt: null } });
  }
  return people;
}
