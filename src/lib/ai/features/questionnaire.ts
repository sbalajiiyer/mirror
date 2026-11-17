import "server-only";
import { z } from "zod";
import type { AIBrief } from "@/lib/questionnaire";
import { CORE_360 } from "@/lib/frameworks/core-360";
import { runAI } from "../client";
import { guardrails, plainLanguageRules } from "../prompts";

export const generatedSchema = z.object({
  name: z.string().min(3).max(80),
  description: z.string().max(300),
  competencies: z
    .array(
      z.object({
        name: z.string().min(2).max(60),
        description: z.string().max(200),
        questions: z.array(z.object({ text: z.string().min(5).max(300), selfText: z.string().min(5).max(300) })).min(1).max(8),
      }),
    )
    .min(2)
    .max(10),
});
export type GeneratedQuestionnaire = z.infer<typeof generatedSchema>;

/** Deterministic sample used in mock mode (no API key) — built from the core framework. */
function sample(brief: AIBrief): GeneratedQuestionnaire {
  return {
    name: brief.role ? `${brief.role} 360` : "My custom 360",
    description: `Generated for: ${brief.purpose.slice(0, 200)}`,
    competencies: CORE_360.competencies.slice(0, brief.sections).map((c) => ({
      name: c.name,
      description: c.description,
      questions: c.questions.slice(0, brief.perSection).map((q) => ({ text: q.text, selfText: q.selfText })),
    })),
  };
}

export async function generateQuestionnaire(params: { userId: string; modelChoice: string; brief: AIBrief }) {
  const { brief } = params;
  return runAI({
    feature: "questionnaire",
    userId: params.userId,
    modelChoice: params.modelChoice,
    schema: generatedSchema,
    request: {
      system: `${guardrails("balanced")}\nYou design behaviour-based 360-degree feedback questionnaires.\n${plainLanguageRules("questionnaire")}`,
      messages: [
        {
          role: "user",
          content: `Design a 360 feedback questionnaire.
What the person wants feedback on: ${brief.purpose}
Their role: ${brief.role || "not given"}. Who will give feedback: ${brief.audience || "colleagues"}.

Return JSON: {"name": short title, "description": one sentence, "competencies": exactly ${brief.sections} sections, each {"name": 1-3 words, "description": one sentence, "questions": exactly ${brief.perSection} items {"text": an observable behaviour written in third person starting with "{name} " (e.g. "{name} explains decisions clearly."), "selfText": the same behaviour in first person starting with "I " (e.g. "I explain decisions clearly.")}}}.
Rules: one behaviour per statement; at most 15 words per statement (not counting "{name}"); plain words; observable and specific; rateable on a 1-5 frequency scale (rarely … almost always); no double negatives; no questions about personality, health, age, appearance or private life; sections must not overlap.`,
        },
      ],
      maxTokens: 3000,
      temperature: 0.5,
    },
    mock: () => sample(brief),
    fallback: () => sample(brief),
  });
}
