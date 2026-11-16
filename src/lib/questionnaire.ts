import { z } from "zod";

/** Price of one AI-generated questionnaire, shown to users (cents). 1 credit = 1 questionnaire. */
export const AI_QUESTIONNAIRE_PRICE_CENTS = Number(process.env.NEXT_PUBLIC_AI_QUESTIONNAIRE_PRICE_CENTS ?? 499);
export const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const customFrameworkSchema = z
  .object({
    name: z.string().trim().min(3, "Give your questionnaire a name").max(80),
    description: z.string().trim().max(300).optional().default(""),
    competencies: z
      .array(
        z.object({
          name: z.string().trim().min(2, "Each section needs a name").max(60),
          description: z.string().trim().max(200).optional().default(""),
          questions: z
            .array(
              z.object({
                text: z.string().trim().min(5, "Statements need at least 5 characters").max(300),
                selfText: z.string().trim().min(5, "Self-assessment wording needs at least 5 characters").max(300),
              }),
            )
            .min(1, "Each section needs at least one statement")
            .max(8, "At most 8 statements per section"),
        }),
      )
      .min(1, "Add at least one section")
      .max(10, "At most 10 sections"),
  })
  .refine((f) => f.competencies.reduce((s, c) => s + c.questions.length, 0) >= 5, { message: "Add at least 5 statements in total" })
  .refine((f) => f.competencies.reduce((s, c) => s + c.questions.length, 0) <= 60, { message: "At most 60 statements in total" })
  .refine((f) => new Set(f.competencies.map((c) => c.name.toLowerCase())).size === f.competencies.length, { message: "Section names must be different" });
export type CustomFrameworkInput = z.infer<typeof customFrameworkSchema>;

export const aiBriefSchema = z.object({
  purpose: z.string().trim().min(10, "Describe what you want feedback on (at least a sentence)").max(1000),
  role: z.string().trim().max(120).optional().default(""),
  audience: z.string().trim().max(200).optional().default(""),
  sections: z.number().int().min(3).max(7).default(5),
  perSection: z.number().int().min(3).max(5).default(4),
});
export type AIBrief = z.infer<typeof aiBriefSchema>;

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "section"
  );
}

const IRREGULAR: Record<string, string> = { is: "am", has: "have", does: "do", was: "was", goes: "go" };

/**
 * Best-effort first-person version of a rater statement for the self-assessment:
 * "{name} communicates clearly" → "I communicate clearly". Users can edit the result.
 */
export function toFirstPerson(text: string): string {
  const t = text.trim();
  const m = t.match(/^\{name\}\s+(\S+)(.*)$/);
  if (!m) return t.replaceAll("{name}'s", "my").replaceAll("{name}", "I");
  const [, verb, rest] = m;
  const lower = verb.toLowerCase();
  let v = verb;
  if (IRREGULAR[lower]) v = IRREGULAR[lower];
  else if (/[^s]ies$/.test(lower)) v = verb.slice(0, -3) + "y";
  else if (/(ches|shes|sses|xes|zes|oes)$/.test(lower)) v = verb.slice(0, -2);
  else if (/[^s]s$/.test(lower)) v = verb.slice(0, -1);
  const restFixed = rest.replace(/\btheir\b/g, "my").replace(/\bthemselves\b/g, "myself").replace(/\bthem\b/g, "me").replaceAll("{name}'s", "my");
  return `I ${v}${restFixed}`;
}
