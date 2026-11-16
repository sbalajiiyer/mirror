import "server-only";
import type { Region } from "@/lib/residency";
import { z } from "zod";
import type { Brief } from "@/lib/coach/brief";
import { runAI } from "../client";
import { guardrails } from "../prompts";

export const aiBriefSchema = z.object({
  summary: z.string().min(40).max(1200),
  questions: z.array(z.string().min(10).max(300)).min(3).max(6),
});
export type AIBriefText = z.infer<typeof aiBriefSchema>;

const template = (b: Brief): AIBriefText => ({ summary: b.headline, questions: b.questions.map((q) => q.question).slice(0, 6) });

/** Optional AI polish of the deterministic session-prep brief. Uses only the brief's aggregates. */
export async function generateCoachBrief(params: { brief: Brief; coachId: string; modelChoice?: string | null; region?: Region }) {
  const { brief } = params;
  return runAI({
    feature: "coach_brief",
    region: params.region,
    userId: params.coachId,
    modelChoice: params.modelChoice,
    schema: aiBriefSchema,
    request: {
      system: `${guardrails("balanced")}\nYou are helping a professional coach prepare for a session with their client. Write about the client in the third person using their first name (not "you").`,
      messages: [
        {
          role: "user",
          content: `Prepare a short session brief.

Return JSON: {"summary": 70-120 words: what changed, what to celebrate, what to explore, citing the numbers given, "questions": 4-6 open coaching questions tailored to this data (no yes/no questions, no advice)}.

Data (aggregated, anonymised):
${JSON.stringify({
  client: brief.clientFirstName,
  basedOn: brief.basedOn,
  strengths: brief.strengths,
  growthAreas: brief.growthAreas,
  blindSpot: brief.blindSpot,
  hiddenStrength: brief.hiddenStrength,
  changesSince: brief.comparedWith,
  changes: brief.changes.map((c) => ({ competency: c.name, before: c.before, after: c.after, statements: c.statements })),
  goals: brief.goals,
  openSession: brief.openSession,
})}`,
        },
      ],
      maxTokens: 900,
      temperature: 0.5,
    },
    mock: () => ({ ...template(brief), summary: `${brief.headline} (Sample AI brief — add GROQ_API_KEY for real AI writing.)` }),
    fallback: () => template(brief),
  });
}
