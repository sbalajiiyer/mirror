import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { effectiveMinRaters } from "@/lib/anonymity";
import { sendEmail } from "@/lib/email";
import { raterInviteEmail } from "@/lib/email/templates";
import { derivedToken, hashToken } from "@/lib/tokens";
import { appUrl } from "@/lib/url";
import { firstName } from "@/lib/utils";
import { answersSchema, raterSchema, type Answers, type WizardInput } from "@/lib/validation";
import { buildAndStoreReport } from "@/lib/services/reports";

export class DomainError extends Error {
  constructor(message: string, public code = "invalid") {
    super(message);
  }
}

export async function createAssessment(userId: string, input: WizardInput) {
  const framework = await db.framework.findUnique({ where: { id: input.frameworkId }, include: { competencies: true } });
  if (!framework) throw new DomainError("Unknown framework");
  const compName = new Map(framework.competencies.map((c) => [c.key, c.name]));
  for (const q of input.questions) if (!compName.has(q.competencyKey)) throw new DomainError("Question has an unknown competency");
  const subject = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  const own = subject?.email?.toLowerCase();
  if (own && input.groups.some((g) => g.raters.some((r) => r.email === own))) throw new DomainError("You can't invite yourself as a rater.");

  const assessment = await db.$transaction(async (tx) => {
    const a = await tx.assessment.create({
      data: {
        subjectId: userId,
        frameworkId: framework.id,
        title: input.title,
        goal: input.goal,
        inviteMessage: input.inviteMessage,
        minRatersPerGroup: effectiveMinRaters(input.minRatersPerGroup),
        showManagerSeparately: input.showManagerSeparately,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        questions: {
          create: input.questions.map((q, i) => ({
            competencyKey: q.competencyKey,
            competency: compName.get(q.competencyKey)!,
            questionKey: q.questionKey,
            text: q.text,
            selfText: q.selfText,
            order: i,
          })),
        },
        raterGroups: { create: [{ kind: "SELF", name: "Self", order: 0 }] },
      },
    });
    for (const [i, g] of input.groups.entries()) {
      const groupId = randomUUID();
      await tx.raterGroup.create({
        data: {
          id: groupId,
          assessmentId: a.id,
          kind: g.kind,
          name: g.name,
          order: i + 1,
          shareTokenHash: g.shareLink ? hashToken(derivedToken("group", groupId)) : null,
        },
      });
      await createInvites(tx, a.id, groupId, g.raters);
    }
    return a;
  });
  await audit(userId, "assessment.create", "Assessment", assessment.id);
  return assessment;
}

async function createInvites(
  tx: Prisma.TransactionClient,
  assessmentId: string,
  raterGroupId: string,
  raters: { name?: string; email: string }[],
) {
  const existing = new Set(
    (await tx.raterInvite.findMany({ where: { assessmentId }, select: { email: true } })).map((r) => r.email),
  );
  const ids: string[] = [];
  for (const r of raters) {
    if (existing.has(r.email)) continue; // one invite per email per assessment
    existing.add(r.email);
    const id = randomUUID();
    await tx.raterInvite.create({
      data: { id, assessmentId, raterGroupId, name: r.name || null, email: r.email, tokenHash: hashToken(derivedToken("invite", id)) },
    });
    ids.push(id);
  }
  return ids;
}

/** Self-assessment: must be completed (and is then locked) before invites go out. */
export async function submitSelfAssessment(userId: string, assessmentId: string, raw: unknown) {
  const answers = answersSchema.parse(raw);
  const a = await db.assessment.findFirst({
    where: { id: assessmentId, subjectId: userId },
    include: { questions: true, raterGroups: true },
  });
  if (!a) throw new DomainError("Not found", "not_found");
  if (a.selfLockedAt) throw new DomainError("Your self-assessment is locked and can't be changed.", "locked");
  const selfGroup = a.raterGroups.find((g) => g.kind === "SELF");
  if (!selfGroup) throw new DomainError("Missing self group");
  const responses = validateRatings(a.questions, a.scaleMax, answers, true);

  await db.$transaction(async (tx) => {
    // Re-check inside the transaction so a double submit can't create two self submissions.
    const locked = await tx.assessment.updateMany({
      where: { id: a.id, selfLockedAt: null },
      data: { selfLockedAt: new Date(), status: "READY" },
    });
    if (locked.count !== 1) throw new DomainError("Your self-assessment is already locked.", "locked");
    await tx.submission.create({
      data: {
        assessmentId: a.id,
        raterGroupId: selfGroup.id,
        isSelf: true,
        submittedOn: today(),
        responses: { create: responses },
      },
    });
  });
  await audit(userId, "assessment.self_locked", "Assessment", a.id);
}

export function validateRatings(
  questions: { id: string; type: string }[],
  scaleMax: number,
  answers: Answers,
  requireAll: boolean,
) {
  const ratingQs = questions.filter((q) => q.type === "RATING");
  const ids = new Set(ratingQs.map((q) => q.id));
  for (const qid of Object.keys(answers.ratings)) if (!ids.has(qid)) throw new DomainError("Unknown question");
  const out: { assessmentQuestionId: string; value: number | null }[] = [];
  for (const q of ratingQs) {
    const v = answers.ratings[q.id];
    if (v === undefined) {
      if (requireAll) throw new DomainError("Please answer every question (\"Don't know\" is fine).", "incomplete");
      continue;
    }
    if (v !== null && (v < 1 || v > scaleMax)) throw new DomainError("Rating out of range");
    out.push({ assessmentQuestionId: q.id, value: v });
  }
  return out;
}

export function today() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Send invites for every not-yet-invited email rater. */
async function sendPendingInvites(assessmentId: string) {
  const a = await db.assessment.findUniqueOrThrow({
    where: { id: assessmentId },
    include: { subject: { include: { profile: true } }, invites: { where: { invitedAt: null, email: { not: null } } } },
  });
  const subjectName = a.subject.profile?.displayName ?? a.subject.name ?? "Someone";
  for (const inv of a.invites) {
    await sendEmail(
      raterInviteEmail({
        to: inv.email!,
        raterName: inv.name,
        subjectName,
        message: a.inviteMessage,
        link: appUrl(`/r/${derivedToken("invite", inv.id)}`),
        dueAt: a.dueAt,
      }),
    );
    await db.raterInvite.update({ where: { id: inv.id }, data: { invitedAt: new Date() } });
  }
  return a.invites.length;
}

export async function launchAssessment(userId: string, assessmentId: string) {
  const a = await db.assessment.findFirst({ where: { id: assessmentId, subjectId: userId } });
  if (!a) throw new DomainError("Not found", "not_found");
  if (!a.selfLockedAt || a.status === "DRAFT") throw new DomainError("Complete your self-assessment first.", "self_required");
  if (a.status !== "READY") throw new DomainError("This 360 has already been launched.");
  await db.assessment.update({ where: { id: a.id }, data: { status: "COLLECTING", launchedAt: new Date() } });
  const sent = await sendPendingInvites(a.id);
  await audit(userId, "assessment.launch", "Assessment", a.id, { invites: sent });
  return { sent };
}

export async function addRaters(userId: string, assessmentId: string, raterGroupId: string, raw: unknown[]) {
  const raters = raw.map((r) => raterSchema.parse(r));
  const a = await db.assessment.findFirst({ where: { id: assessmentId, subjectId: userId }, include: { subject: true } });
  if (!a) throw new DomainError("Not found", "not_found");
  if (a.status === "CLOSED") throw new DomainError("This 360 is closed.");
  if (raters.some((r) => r.email === a.subject.email?.toLowerCase())) throw new DomainError("You can't invite yourself as a rater.");
  const group = await db.raterGroup.findFirst({ where: { id: raterGroupId, assessmentId, kind: { not: "SELF" } } });
  if (!group) throw new DomainError("Unknown rater group");
  const created = await db.$transaction((tx) => createInvites(tx, a.id, group.id, raters));
  if (a.status === "COLLECTING") await sendPendingInvites(a.id);
  await audit(userId, "assessment.add_raters", "Assessment", a.id, { count: created.length });
  return created.length;
}

export async function removeInvite(userId: string, inviteId: string) {
  const inv = await db.raterInvite.findFirst({ where: { id: inviteId, assessment: { subjectId: userId } } });
  if (!inv) throw new DomainError("Not found", "not_found");
  if (inv.status === "SUBMITTED") throw new DomainError("This person already responded; their answers stay in the results.");
  await db.raterInvite.delete({ where: { id: inv.id } });
}

export async function closeAssessment(userId: string, assessmentId: string) {
  const a = await db.assessment.findFirst({ where: { id: assessmentId, subjectId: userId } });
  if (!a) throw new DomainError("Not found", "not_found");
  if (a.status !== "COLLECTING") throw new DomainError("Only a 360 that is collecting feedback can be closed.");
  await db.assessment.update({ where: { id: a.id }, data: { status: "CLOSED", closedAt: new Date() } });
  // Discard drafts so unfinished answers are never kept.
  await db.raterInvite.updateMany({ where: { assessmentId: a.id }, data: { draft: Prisma.DbNull } });
  const report = await buildAndStoreReport(a.id);
  await audit(userId, "assessment.close", "Assessment", a.id);
  return report;
}

/**
 * Reopen is allowed only when the closed report had too few responses to show anything,
 * so reopening can never be used to diff two versions of a visible report.
 */
export async function reopenAssessment(userId: string, assessmentId: string) {
  const a = await db.assessment.findFirst({
    where: { id: assessmentId, subjectId: userId },
    include: { reports: { orderBy: { generatedAt: "desc" }, take: 1 } },
  });
  if (!a) throw new DomainError("Not found", "not_found");
  if (a.status !== "CLOSED") throw new DomainError("Not closed");
  const data = a.reports[0]?.data as { anonymity?: { available?: boolean } } | undefined;
  if (data?.anonymity?.available) throw new DomainError("Results have already been shown, so this 360 can't be reopened. Start a new one instead.");
  await db.assessment.update({ where: { id: a.id }, data: { status: "COLLECTING", closedAt: null } });
  await db.report.deleteMany({ where: { assessmentId: a.id } });
  await audit(userId, "assessment.reopen", "Assessment", a.id);
}

export async function deleteAssessment(userId: string, assessmentId: string) {
  const a = await db.assessment.findFirst({ where: { id: assessmentId, subjectId: userId } });
  if (!a) throw new DomainError("Not found", "not_found");
  await db.assessment.delete({ where: { id: a.id } });
  await audit(userId, "assessment.delete", "Assessment", a.id);
}

export function subjectFirstName(profile: { displayName: string } | null, userName: string | null) {
  return firstName(profile?.displayName ?? userName);
}
