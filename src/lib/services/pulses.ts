import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { addMonths } from "@/lib/progress";
import { derivedToken, hashToken } from "@/lib/tokens";
import { firstName } from "@/lib/utils";
import { DomainError } from "@/lib/errors";
import { getReportForOwner } from "@/lib/services/reports";

export const pulseSchema = z.object({
  questionIds: z.array(z.string()).min(5, "Pick at least 5 statements").max(10, "A pulse has at most 10 statements"),
  reuseRaters: z.boolean().default(true),
  cadenceMonths: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).default(0),
  dueInDays: z.number().int().min(3).max(30).default(7),
});

export const pulseInviteMessage = (name: string) =>
  `Hi! A little while ago you gave me feedback — thank you. I've been working on it and would love a quick check-in to see if anything has changed. It's a handful of statements (about 2 minutes) and, as before, anonymous. — ${name}`;

import { nextSessionNumber, seriesRootId } from "@/lib/services/sessions";
export { seriesRootId };

/**
 * Create a pulse from a closed assessment: 5–10 of its statements (same keys, so results are
 * comparable), optionally the same raters, as a new DRAFT that follows the normal flow
 * (self-assessment first, then invites).
 */
/** "Pre-promotion 360 · S4 Pulse check": the survey's title plus this session's number. */
export function pulseTitle(surveyTitle: string, sessionNumber: number) {
  return `${surveyTitle} · S${sessionNumber} Pulse check`;
}

export async function createPulse(userId: string, sourceId: string, raw: unknown) {
  const input = pulseSchema.parse(raw);
  const r = await getReportForOwner(userId, sourceId);
  if (r.status !== "ok") throw new DomainError("Close this 360 before starting a pulse.");
  if (!r.report.anonymity.available) throw new DomainError("This 360 didn't get enough responses to compare against.");
  const source = await db.assessment.findUniqueOrThrow({
    where: { id: sourceId },
    include: {
      questions: true,
      raterGroups: { orderBy: { order: "asc" }, include: { invites: true } },
      subject: { include: { profile: true } },
    },
  });
  if (source.copiedFrom) throw new DomainError("This is a copy of a company report, so it can't have pulse checks. Start a new 360 instead.");
  const rootId = seriesRootId(source);
  const chosen = source.questions.filter((q) => input.questionIds.includes(q.id) && q.type === "RATING");
  if (chosen.length !== new Set(input.questionIds).size) throw new DomainError("Unknown statement selected");
  const root = rootId === source.id ? source : await db.assessment.findUniqueOrThrow({ where: { id: rootId }, select: { title: true } });
  const open = await db.assessment.count({ where: { OR: [{ id: rootId }, { rootAssessmentId: rootId }], status: { in: ["DRAFT", "READY", "COLLECTING"] } } });
  if (open > 0) throw new DomainError("This survey already has a session in progress. Finish or close it first.");
  const name = firstName(source.subject.profile?.displayName ?? source.subject.name);

  const pulse = await db.$transaction(async (tx) => {
    const sessionNumber = await nextSessionNumber(tx, rootId);
    const p = await tx.assessment.create({
      data: {
        subjectId: userId,
        frameworkId: source.frameworkId,
        type: "PULSE",
        rootAssessmentId: rootId,
        sessionNumber,
        title: pulseTitle(root.title, sessionNumber),
        company: source.company,
        tags: source.tags,
        goal: source.goal,
        inviteMessage: pulseInviteMessage(name),
        minRatersPerGroup: source.minRatersPerGroup,
        showManagerSeparately: false,
        scaleMax: source.scaleMax,
        dueAt: new Date(Date.now() + input.dueInDays * 86400000),
        questions: {
          create: chosen
            .sort((a, b) => a.order - b.order)
            .map((q, i) => ({ competencyKey: q.competencyKey, competency: q.competency, questionKey: q.questionKey, type: q.type, text: q.text, selfText: q.selfText, order: i })),
        },
        raterGroups: { create: [{ kind: "SELF", name: "Self", order: 0 }] },
      },
    });
    for (const g of source.raterGroups.filter((g) => g.kind !== "SELF")) {
      const groupId = randomUUID();
      await tx.raterGroup.create({ data: { id: groupId, assessmentId: p.id, kind: g.kind, name: g.name, order: g.order } });
      if (!input.reuseRaters) continue;
      for (const inv of g.invites.filter((i) => i.email && i.status !== "DECLINED")) {
        const id = randomUUID();
        await tx.raterInvite.create({
          data: { id, assessmentId: p.id, raterGroupId: groupId, name: inv.name, email: inv.email, tokenHash: hashToken(derivedToken("invite", id)) },
        });
      }
    }
    if (input.cadenceMonths) await tx.assessment.update({ where: { id: rootId }, data: { cadenceMonths: input.cadenceMonths } });
    return p;
  });
  await audit(userId, "pulse.create", "Assessment", pulse.id, { rootId, questions: chosen.length, reuseRaters: input.reuseRaters });
  return pulse;
}

/** Called when any assessment in a series launches: schedule the next pulse reminder. */
export async function scheduleNextPulse(assessmentId: string, launchedAt = new Date()) {
  const a = await db.assessment.findUnique({ where: { id: assessmentId } });
  if (!a) return;
  const root = await db.assessment.findUnique({ where: { id: seriesRootId(a) } });
  if (!root?.cadenceMonths) return;
  await db.assessment.update({ where: { id: root.id }, data: { nextPulseDueAt: addMonths(launchedAt, root.cadenceMonths), pulseReminderSentAt: null } });
}

/** Set or clear the pulse cadence for a series from the progress page. */
export async function setCadence(userId: string, rootId: string, months: 0 | 1 | 2 | 3) {
  const root = await db.assessment.findFirst({ where: { id: rootId, subjectId: userId, rootAssessmentId: null } });
  if (!root) throw new DomainError("Not found", "not_found");
  if (!months) {
    await db.assessment.update({ where: { id: root.id }, data: { cadenceMonths: null, nextPulseDueAt: null } });
    return;
  }
  const last = await db.assessment.findFirst({
    where: { OR: [{ id: root.id }, { rootAssessmentId: root.id }], launchedAt: { not: null } },
    orderBy: { launchedAt: "desc" },
  });
  await db.assessment.update({
    where: { id: root.id },
    data: { cadenceMonths: months, nextPulseDueAt: addMonths(last?.launchedAt ?? new Date(), months), pulseReminderSentAt: null },
  });
}
