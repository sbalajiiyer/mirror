import "server-only";
import { withAiWorkspace, workspaceOfAssessment } from "@/lib/ai/context";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { CORE_360 } from "@/lib/frameworks/core-360";
import { CORE_360_TRANSLATIONS } from "@/lib/i18n/core-360";
import { isRaterLocale, RATER_LOCALES, type RaterLocale } from "@/lib/i18n/rater";
import { translateStatements } from "@/lib/ai/features/translate";
import { regionForAssessment } from "@/lib/services/residency";

/*
 * Rater-language versions of a 360's statements. Built-in statements use the reviewed static packs;
 * custom ones are machine-translated once per language, cached on the question, and editable by the subject.
 */

type Q = { id: string; competencyKey: string; competency: string; questionKey: string | null; text: string; translations: Prisma.JsonValue | null };
export type Translation = { text: string; competency: string; machine?: boolean };
type Stored = Partial<Record<RaterLocale, Translation>>;

const CORE_TEXT = new Map(CORE_360.competencies.flatMap((c) => c.questions.map((q) => [`${c.key}:${q.key}`, { text: q.text, competency: c.name }])));

/** The static translation for an unedited built-in statement, if any. */
function builtIn(q: Q, locale: Exclude<RaterLocale, "en">): Translation | null {
  const core = q.questionKey ? CORE_TEXT.get(`${q.competencyKey}:${q.questionKey}`) : undefined;
  if (!core || core.text !== q.text) return null;
  const pack = CORE_360_TRANSLATIONS[locale];
  const text = pack.questions[q.questionKey!];
  const competency = core.competency === q.competency ? pack.competencies[q.competencyKey] : null;
  return text ? { text, competency: competency ?? q.competency } : null;
}

const stored = (q: Q): Stored => (q.translations && typeof q.translations === "object" ? (q.translations as Stored) : {});

/** Translations for every rating question in `locale`, filling missing custom ones with AI (cached). */
export async function localize(assessmentId: string, questions: Q[], locale: RaterLocale) {
  const out = new Map<string, Translation>();
  if (locale === "en") return { map: out, machine: false };
  const missing: Q[] = [];
  for (const q of questions) {
    const t = builtIn(q, locale) ?? stored(q)[locale];
    if (t) out.set(q.id, t);
    else missing.push(q);
  }
  if (missing.length) {
    const r = await withAiWorkspace(await workspaceOfAssessment(assessmentId), async () =>
      translateStatements(missing.map((q) => ({ text: q.text, competency: q.competency })), locale, { assessmentId, region: await regionForAssessment(assessmentId) }),
    );
    if (r.usedAI) {
      for (const [i, q] of missing.entries()) {
        const t: Translation = { ...r.items[i], machine: true };
        out.set(q.id, t);
        const next = { ...stored(q), [locale]: t } as unknown as Prisma.InputJsonValue;
        await db.assessmentQuestion.update({ where: { id: q.id }, data: { translations: next } });
        q.translations = next as Prisma.JsonValue; // later languages in the same call keep this one
      }
    }
  }
  return { map: out, machine: [...out.values()].some((t) => t.machine) };
}

/** For the subject: custom statements with their translations, to review and correct. */
export async function translationReview(userId: string, assessmentId: string) {
  const a = await db.assessment.findFirst({ where: { id: assessmentId, subjectId: userId }, include: { questions: { where: { type: "RATING" }, orderBy: { order: "asc" } } } });
  if (!a) throw new DomainError("Not found", "not_found");
  const custom = a.questions.filter((q) => !builtIn(q, "es"));
  return custom.map((q) => ({ id: q.id, text: q.text, competency: q.competency, translations: stored(q) }));
}

export const translationEditSchema = z.object({ questionId: z.string(), locale: z.string(), text: z.string().trim().min(3).max(600), competency: z.string().trim().min(1).max(120) });

export async function saveTranslation(userId: string, assessmentId: string, raw: unknown) {
  const input = translationEditSchema.parse(raw);
  if (!isRaterLocale(input.locale) || input.locale === "en") throw new DomainError("Unknown language.");
  const q = await db.assessmentQuestion.findFirst({ where: { id: input.questionId, assessmentId, assessment: { subjectId: userId } } });
  if (!q) throw new DomainError("Not found", "not_found");
  if (q.text.includes("{name}") && !input.text.includes("{name}")) throw new DomainError("Keep {name} where the person's name goes.");
  await db.assessmentQuestion.update({ where: { id: q.id }, data: { translations: { ...stored(q), [input.locale]: { text: input.text, competency: input.competency } } as unknown as Prisma.InputJsonValue } });
}

/** Subject asks for all machine translations up front (e.g. to review before launching). */
export async function translateAll(userId: string, assessmentId: string) {
  const a = await db.assessment.findFirst({ where: { id: assessmentId, subjectId: userId }, include: { questions: { where: { type: "RATING" } } } });
  if (!a) throw new DomainError("Not found", "not_found");
  for (const l of RATER_LOCALES) if (l !== "en") await localize(a.id, a.questions, l);
}
