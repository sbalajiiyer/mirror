import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { derivedToken, hashToken } from "@/lib/tokens";
import { sessionKind, surveyCode } from "@/lib/survey";
import { parseTags, toGroupableSession, type GroupableSession } from "@/lib/session-groups";

export const rerunSchema = z.object({
  reuseRaters: z.boolean().default(true),
  sessionLabel: z.string().trim().max(60).optional().default(""),
  dueInDays: z.number().int().min(3).max(30).default(14),
});

export const sessionLabelSchema = z.string().trim().max(60);

export function seriesRootId(a: { id: string; rootAssessmentId: string | null }) {
  return a.rootAssessmentId ?? a.id;
}

/** Next session number in a survey (root is 1). Call inside the creating transaction. */
export async function nextSessionNumber(tx: Prisma.TransactionClient, rootId: string) {
  const agg = await tx.assessment.aggregate({ where: { OR: [{ id: rootId }, { rootAssessmentId: rootId }] }, _max: { sessionNumber: true } });
  return (agg._max.sessionNumber ?? 0) + 1;
}

/**
 * Run the same survey again: a new full session with exactly the original questionnaire
 * (same statements and keys, so every statement is comparable), the same groups and settings,
 * and optionally the same raters (fresh links). Follows the normal flow: self first, then invites.
 */
export async function rerunSurvey(userId: string, sourceId: string, raw: unknown) {
  const input = rerunSchema.parse(raw);
  const source = await db.assessment.findFirst({
    where: { id: sourceId, subjectId: userId },
    include: { raterGroups: { orderBy: { order: "asc" }, include: { invites: true } } },
  });
  if (!source) throw new DomainError("Not found", "not_found");
  if (source.status !== "CLOSED") throw new DomainError("Close this session before running the survey again.");
  if (source.copiedFrom) throw new DomainError("This is a copy of a company report, so it can't be run again. Start a new 360 instead.");
  const rootId = seriesRootId(source);
  const root = await db.assessment.findUniqueOrThrow({ where: { id: rootId }, include: { questions: { orderBy: { order: "asc" } } } });
  const open = await db.assessment.count({ where: { OR: [{ id: rootId }, { rootAssessmentId: rootId }], status: { in: ["DRAFT", "READY", "COLLECTING"] } } });
  if (open > 0) throw new DomainError("This survey already has a session in progress. Finish or close it first.");

  const session = await db.$transaction(async (tx) => {
    const sessionNumber = await nextSessionNumber(tx, rootId);
    // A re-run is a follow-up session: charged at the follow-up price when it launches.
    const s = await tx.assessment.create({
      data: {
        orgCampaignId: null,
        subjectId: userId,
        frameworkId: root.frameworkId,
        type: "FULL_360",
        rootAssessmentId: rootId,
        sessionNumber,
        sessionLabel: input.sessionLabel || new Date().toLocaleDateString("en", { month: "long", year: "numeric" }),
        title: root.title,
        company: source.company,
        tags: source.tags,
        goal: root.goal,
        inviteMessage: root.inviteMessage,
        minRatersPerGroup: root.minRatersPerGroup,
        showManagerSeparately: source.showManagerSeparately,
        scaleMax: root.scaleMax,
        dueAt: new Date(Date.now() + input.dueInDays * 86400000),
        questions: {
          create: root.questions.map((q) => ({ competencyKey: q.competencyKey, competency: q.competency, questionKey: q.questionKey, type: q.type, text: q.text, selfText: q.selfText, order: q.order })),
        },
        raterGroups: { create: [{ kind: "SELF", name: "Self", order: 0 }] },
      },
    });
    for (const g of source.raterGroups.filter((g) => g.kind !== "SELF")) {
      const groupId = randomUUID();
      await tx.raterGroup.create({ data: { id: groupId, assessmentId: s.id, kind: g.kind, name: g.name, order: g.order } });
      if (!input.reuseRaters) continue;
      for (const inv of g.invites.filter((i) => i.email && i.status !== "DECLINED")) {
        const id = randomUUID();
        await tx.raterInvite.create({ data: { id, assessmentId: s.id, raterGroupId: groupId, name: inv.name, email: inv.email, tokenHash: hashToken(derivedToken("invite", id)) } });
      }
    }
    return s;
  });
  await audit(userId, "survey.rerun", "Assessment", session.id, { rootId, sessionNumber: session.sessionNumber });
  return session;
}

export const sessionDetailsSchema = z.object({
  label: sessionLabelSchema.optional(),
  company: z.string().trim().max(80).optional(),
  tags: z.union([z.string().max(400), z.array(z.string().max(40)).max(20)]).optional(),
});

/** Edit a session's name, company and tags (owner only). Omitted fields are left as they are. */
export async function updateSessionDetails(userId: string, assessmentId: string, raw: unknown) {
  const input = sessionDetailsSchema.parse(raw);
  const a = await db.assessment.findFirst({ where: { id: assessmentId, subjectId: userId } });
  if (!a) throw new DomainError("Not found", "not_found");
  await db.assessment.update({
    where: { id: a.id },
    data: {
      ...(input.label !== undefined ? { sessionLabel: input.label || null } : {}),
      ...(input.company !== undefined ? { company: input.company || null } : {}),
      ...(input.tags !== undefined ? { tags: parseTags(input.tags) } : {}),
    },
  });
}

/** Every session the subject has run, flattened for grouping (see lib/session-groups). */
export async function groupableSessions(userId: string): Promise<GroupableSession[]> {
  const rows = await db.assessment.findMany({
    where: { subjectId: userId },
    include: { reports: { orderBy: { version: "desc" }, take: 1, select: { data: true } } },
  });
  const titles = new Map(rows.filter((r) => !r.rootAssessmentId).map((r) => [r.id, r.title]));
  return rows.map((r) => toGroupableSession(r, titles.get(seriesRootId(r)) ?? r.title));
}

export async function renameSession(userId: string, assessmentId: string, rawLabel: unknown) {
  const label = sessionLabelSchema.parse(rawLabel);
  const a = await db.assessment.findFirst({ where: { id: assessmentId, subjectId: userId } });
  if (!a) throw new DomainError("Not found", "not_found");
  await db.assessment.update({ where: { id: a.id }, data: { sessionLabel: label || null } });
}

/** Display info for a session: survey ID, number, kind and label. */
export async function sessionInfo(assessmentId: string) {
  const a = await db.assessment.findUnique({ where: { id: assessmentId }, select: { id: true, rootAssessmentId: true, sessionNumber: true, type: true, sessionLabel: true, company: true, tags: true } });
  if (!a) return null;
  return { code: surveyCode(seriesRootId(a)), sessionNumber: a.sessionNumber, kind: sessionKind(a.type), label: a.sessionLabel, company: a.company, tags: a.tags };
}
