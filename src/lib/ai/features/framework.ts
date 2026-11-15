import "server-only";
import { z } from "zod";
import { goalLabel } from "@/lib/constants";
import { runAI } from "../client";
import { guardrails } from "../prompts";

export type FrameworkOption = { slug: string; name: string; competencies: { key: string; name: string; description: string }[] };

const schema = z.object({
  frameworkSlug: z.string(),
  focus: z.array(z.string()).min(2).max(4),
  reason: z.string().max(700),
});
export type FrameworkRecommendation = z.infer<typeof schema>;

/** Deterministic fallback: which competencies matter most for each goal. */
const GOAL_FOCUS: Record<string, string[]> = {
  promotion: ["strategic_thinking", "leadership", "communication", "execution"],
  new_role: ["communication", "collaboration", "growth_mindset", "execution"],
  leadership_growth: ["leadership", "emotional_intelligence", "communication", "strategic_thinking"],
  career_change: ["growth_mindset", "collaboration", "communication", "execution"],
  self_awareness: ["emotional_intelligence", "growth_mindset", "communication", "collaboration"],
};

export function fallbackRecommendation(goal: string, options: FrameworkOption[]): FrameworkRecommendation {
  const fw = options[0];
  const keys = new Set(fw.competencies.map((c) => c.key));
  const focus = (GOAL_FOCUS[goal] ?? GOAL_FOCUS.self_awareness).filter((k) => keys.has(k));
  return {
    frameworkSlug: fw.slug,
    focus,
    reason: `For “${goalLabel(goal)}”, these competencies usually carry the most weight. Keep all seven for a full picture, or trim to these to make the survey shorter.`,
  };
}

export async function recommendFramework(params: {
  userId: string;
  modelChoice: string;
  goal: string;
  profile: { jobTitle?: string | null; seniority?: string | null; industry?: string | null };
  options: FrameworkOption[];
}): Promise<{ recommendation: FrameworkRecommendation; usedAI: boolean; error?: string }> {
  const { options } = params;
  const res = await runAI({
    feature: "framework",
    userId: params.userId,
    modelChoice: params.modelChoice,
    fast: true,
    schema,
    request: {
      system: guardrails("balanced"),
      messages: [
        {
          role: "user",
          content: `Recommend which framework and which 3-4 competencies to focus on for this person's 360.
Goal: ${goalLabel(params.goal)}. Role: ${params.profile.jobTitle || "not given"}. Career stage: ${params.profile.seniority || "not given"}. Industry: ${params.profile.industry || "not given"}.
Frameworks: ${JSON.stringify(options)}
Return JSON: {"frameworkSlug": one slug from the list, "focus": 3-4 competency keys from that framework, "reason": 2-3 sentences addressed to them}.`,
        },
      ],
      maxTokens: 600,
      temperature: 0.3,
    },
    mock: () => fallbackRecommendation(params.goal, options),
    fallback: () => fallbackRecommendation(params.goal, options),
  });
  const rec = res.ok ? res.data : res.fallback;
  // Validate against the real catalog; never trust ids from the model.
  const fw = options.find((o) => o.slug === rec.frameworkSlug) ?? options[0];
  const keys = new Set(fw.competencies.map((c) => c.key));
  const focus = rec.focus.filter((k) => keys.has(k));
  if (focus.length < 2) return { recommendation: fallbackRecommendation(params.goal, options), usedAI: false };
  return { recommendation: { ...rec, frameworkSlug: fw.slug, focus }, usedAI: res.ok && res.generatedBy === "ai", error: res.ok ? undefined : res.error };
}
