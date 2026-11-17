import "server-only";
import { localize } from "@/lib/services/translations";
import type { RaterLocale } from "@/lib/i18n/rater";
import { regionForAssessment } from "@/lib/services/residency";
import { isUnlocked } from "@/lib/services/billing";
import { FREE_RATER_CAP } from "@/lib/billing/catalog";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { derivedToken, hashToken, looksLikeToken } from "@/lib/tokens";
import { firstName } from "@/lib/utils";
import { answersSchema, draftSchema, type Draft } from "@/lib/validation";
import { DomainError } from "@/lib/errors";
import { today, validateRatings } from "@/lib/services/assessments";
import { deidentifyComments } from "@/lib/ai/features/deidentify";
import { scrubIdentifiers } from "@/lib/ai/scrub";

/**
 * Everything a rater sees. Deliberately minimal: the subject's first name, the questions
 * and the rater's own draft. Nothing about other raters.
 */
export type RaterContext =
  | { state: "invalid" }
  | { state: "closed"; subjectFirstName: string }
  | { state: "not_open"; subjectFirstName: string }
  | { state: "done"; subjectFirstName: string }
  | { state: "declined"; subjectFirstName: string }
  | {
      state: "open";
      subjectFirstName: string;
      groupKind: string;
      managerShownSeparately: boolean;
      message: string;
      dueAt: string | null;
      scaleMax: number;
      competencies: { key: string; name: string; questions: { id: string; text: string }[] }[];
      draft: Draft | null;
      machineTranslated: boolean;
    };

async function inviteByToken(token: string) {
  if (!looksLikeToken(token)) return null;
  return db.raterInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      raterGroup: true,
      assessment: { include: { questions: { orderBy: { order: "asc" } }, subject: { include: { profile: true } } } },
    },
  });
}

export async function getRaterContext(token: string, locale: RaterLocale = "en"): Promise<RaterContext> {
  const inv = await inviteByToken(token);
  if (!inv) return { state: "invalid" };
  const a = inv.assessment;
  const name = firstName(a.subject.profile?.displayName ?? a.subject.name);
  if (inv.status === "SUBMITTED") return { state: "done", subjectFirstName: name };
  if (inv.status === "DECLINED") return { state: "declined", subjectFirstName: name };
  if (a.status === "CLOSED") return { state: "closed", subjectFirstName: name };
  if (a.status !== "COLLECTING") return { state: "not_open", subjectFirstName: name };

  const rating = a.questions.filter((q) => q.type === "RATING");
  const { map: tr, machine } = await localize(a.id, rating, locale);
  const comps = new Map<string, { key: string; name: string; questions: { id: string; text: string }[] }>();
  for (const q of rating) {
    const t = tr.get(q.id);
    if (!comps.has(q.competencyKey)) comps.set(q.competencyKey, { key: q.competencyKey, name: t?.competency ?? q.competency, questions: [] });
    comps.get(q.competencyKey)!.questions.push({ id: q.id, text: (t?.text ?? q.text).replaceAll("{name}", name) });
  }
  const draft = inv.draft ? draftSchema.safeParse(inv.draft) : null;
  return {
    state: "open",
    subjectFirstName: name,
    groupKind: inv.raterGroup.kind,
    managerShownSeparately: inv.raterGroup.kind === "MANAGER" && a.showManagerSeparately,
    message: a.inviteMessage,
    dueAt: a.dueAt?.toISOString() ?? null,
    scaleMax: a.scaleMax,
    competencies: [...comps.values()],
    draft: draft?.success ? draft.data : null,
    machineTranslated: machine,
  };
}

async function openInviteOrThrow(token: string) {
  const inv = await inviteByToken(token);
  if (!inv) throw new DomainError("This link is not valid.", "invalid");
  if (inv.status === "SUBMITTED") throw new DomainError("You've already submitted feedback. Thank you!", "done");
  if (inv.assessment.status !== "COLLECTING") throw new DomainError("This feedback request is no longer open.", "closed");
  return inv;
}

export async function saveDraft(token: string, raw: unknown) {
  const draft = draftSchema.parse(raw);
  const inv = await openInviteOrThrow(token);
  validateRatings(inv.assessment.questions, inv.assessment.scaleMax, draft, false);
  await db.raterInvite.update({
    where: { id: inv.id },
    data: {
      draft: draft as unknown as Prisma.InputJsonValue,
      status: inv.status === "INVITED" ? "STARTED" : inv.status,
      startedAt: inv.startedAt ?? new Date(),
    },
  });
}

/**
 * Submit. The Submission row is created WITHOUT any reference to the invite, so answers
 * can't be traced back to a person; the invite only records that this person responded.
 */
export async function submitRaterResponse(token: string, raw: unknown) {
  const answers = answersSchema.parse(raw);
  const inv = await openInviteOrThrow(token);
  const a = inv.assessment;
  const responses = validateRatings(a.questions, a.scaleMax, answers, true);
  const answered = responses.filter((r) => r.value !== null).length;
  if (answered < Math.ceil(responses.length / 2)) {
    throw new DomainError("Please rate at least half of the statements so your feedback can be counted.", "too_few");
  }
  const firstQuestionOf = new Map<string, string>();
  for (const q of a.questions) if (!firstQuestionOf.has(q.competencyKey)) firstQuestionOf.set(q.competencyKey, q.id);

  const comments: { kind: "COMPETENCY" | "START" | "STOP" | "CONTINUE" | "GENERAL"; competencyKey?: string; assessmentQuestionId?: string; text: string }[] = [];
  for (const [key, text] of Object.entries(answers.competencyComments)) {
    const t = text.trim();
    if (!t) continue;
    if (!firstQuestionOf.has(key)) throw new DomainError("Unknown competency");
    comments.push({ kind: "COMPETENCY", competencyKey: key, assessmentQuestionId: firstQuestionOf.get(key), text: t });
  }
  for (const kind of ["START", "STOP", "CONTINUE", "GENERAL"] as const) {
    const t = answers[kind.toLowerCase() as "start" | "stop" | "continue" | "general"].trim();
    if (t) comments.push({ kind, text: t });
  }

  // Obvious identifiers (emails, phones, links, handles) are always removed. If the rater
  // opted in, AI also rewrites the comments; the original text is never stored.
  const subjectFirstName = firstName(a.subject.profile?.displayName ?? a.subject.name);
  const rewritten = answers.deidentify
    ? (await deidentifyComments(comments.map((c) => c.text), { inviteId: inv.id, subjectFirstName, region: await regionForAssessment(a.id) })).texts
    : comments.map((c) => scrubIdentifiers(c.text));
  comments.forEach((c, i) => (c.text = rewritten[i]?.trim() || scrubIdentifiers(c.text)));

  await db.$transaction(async (tx) => {
    // Atomic status flip guards against double submission from two tabs.
    const flipped = await tx.raterInvite.updateMany({
      where: { id: inv.id, status: { not: "SUBMITTED" } },
      data: { status: "SUBMITTED", submittedAt: today(), draft: Prisma.DbNull },
    });
    if (flipped.count !== 1) throw new DomainError("You've already submitted feedback. Thank you!", "done");
    await tx.submission.create({
      data: {
        assessmentId: a.id,
        raterGroupId: inv.raterGroupId,
        isSelf: false,
        submittedOn: today(),
        responses: { create: responses },
        comments: { create: comments },
      },
    });
  });
}

export async function declineInvite(token: string) {
  const inv = await openInviteOrThrow(token);
  await db.raterInvite.update({ where: { id: inv.id }, data: { status: "DECLINED", draft: Prisma.DbNull } });
}

/**
 * Shareable group link: each visit without a cookie creates a fresh anonymous invite in that
 * group and returns its token. The caller stores it in a cookie so refresh/resume works.
 */
export async function inviteFromGroupLink(groupToken: string): Promise<string | null> {
  if (!looksLikeToken(groupToken)) return null;
  const group = await db.raterGroup.findUnique({ where: { shareTokenHash: hashToken(groupToken) }, include: { assessment: true } });
  if (!group || group.assessment.status !== "COLLECTING") return null;
  // Free plan: the 5-rater limit also covers people joining through a shared link (Phase 9).
  if (!(await isUnlocked(group.assessment.subjectId, group.assessment))) {
    const n = await db.raterInvite.count({ where: { assessmentId: group.assessmentId } });
    if (n >= FREE_RATER_CAP) return null;
  }
  const id = randomUUID();
  await db.raterInvite.create({
    data: { id, assessmentId: group.assessmentId, raterGroupId: group.id, channel: "LINK", tokenHash: hashToken(derivedToken("invite", id)), invitedAt: new Date() },
  });
  return derivedToken("invite", id);
}

/** Show the rater what their comments will look like after AI de-identification. */
export async function previewDeidentify(token: string, texts: unknown) {
  const list = Array.isArray(texts) ? texts.filter((t): t is string => typeof t === "string").slice(0, 12).map((t) => t.slice(0, 2000)) : [];
  const inv = await openInviteOrThrow(token);
  const name = firstName(inv.assessment.subject.profile?.displayName ?? inv.assessment.subject.name);
  return deidentifyComments(list, { inviteId: inv.id, subjectFirstName: name, region: await regionForAssessment(inv.assessmentId) });
}
