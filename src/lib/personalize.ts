/**
 * Personalization v2 (Phase 7): adaptive question selection for the 360 wizard and goal-aware pulses.
 * Pure and isomorphic so the wizard can explain its suggestion and tests can pin the rules.
 */

/** Competencies that matter most for each goal (built-in framework keys), most important first. */
export const GOAL_FOCUS: Record<string, string[]> = {
  promotion: ["strategic_thinking", "leadership", "execution", "communication"],
  new_role: ["collaboration", "communication", "execution", "growth_mindset"],
  leadership_growth: ["leadership", "emotional_intelligence", "communication", "strategic_thinking"],
  career_change: ["growth_mindset", "collaboration", "communication"],
  self_awareness: ["emotional_intelligence", "growth_mindset", "communication"],
};

const EARLY = /student|entry/i;
const PEOPLE_LEADER = /manager|director|executive|founder|lead|head|vp|chief|ceo|cto|coo/i;

export type AdaptiveInput = {
  competencies: { key: string; name: string; questions: { key: string }[] }[];
  goal: string;
  seniority?: string | null;
  jobTitle?: string | null;
};

export type AdaptiveResult = { keep: string[]; focus: string[]; reasons: string[] };

/**
 * Suggest which statements to ask: every statement in the focus competencies for the goal (and
 * leadership for people leaders), two from each other competency, and a shorter questionnaire for
 * students and early-career people. Never fewer than 5 statements.
 */
export function adaptiveQuestions(input: AdaptiveInput): AdaptiveResult {
  const keys = new Set(input.competencies.map((c) => c.key));
  const focus = (GOAL_FOCUS[input.goal] ?? []).filter((k) => keys.has(k));
  const reasons: string[] = [];
  const early = EARLY.test(input.seniority ?? "");
  const leader = PEOPLE_LEADER.test(`${input.seniority ?? ""} ${input.jobTitle ?? ""}`) && !early;
  if (focus.length) reasons.push(`Your goal puts the most weight on ${focus.map((k) => input.competencies.find((c) => c.key === k)!.name).join(", ")}.`);
  if (leader && keys.has("leadership") && !focus.includes("leadership")) {
    focus.push("leadership");
    reasons.push("You lead people, so all leadership statements are included.");
  }
  // Early career: keep the focus but trim the rest, and ask less about leading others.
  const othersPer = early ? 1 : 2;
  if (early) reasons.push("Shorter for your career stage: one statement from each other area.");
  const keep: string[] = [];
  for (const c of input.competencies) {
    const all = c.questions.map((q) => `${c.key}.${q.key}`);
    if (focus.includes(c.key)) keep.push(...(early && c.key === "leadership" ? all.slice(0, 2) : all));
    else keep.push(...all.slice(0, early && c.key === "leadership" ? 1 : othersPer));
  }
  if (!focus.length) {
    // Custom questionnaires (no known keys): keep everything.
    return { keep: input.competencies.flatMap((c) => c.questions.map((q) => `${c.key}.${q.key}`)), focus: [], reasons: ["Your questionnaire is used as written."] };
  }
  if (keep.length < 5) return { keep: input.competencies.flatMap((c) => c.questions.map((q) => `${c.key}.${q.key}`)).slice(0, 5), focus, reasons };
  return { keep, focus, reasons };
}

/**
 * Competencies to lead a pulse with: active goal competencies first, then the person's chosen goals'
 * focus areas that were also growth areas or the blind spot, then the remaining growth areas.
 */
export function pulseFocus(p: { goalCompetencies: string[]; profileGoals: string[]; growthAreas: string[]; blindSpot: string | null }): string[] {
  const weak = new Set([...(p.blindSpot ? [p.blindSpot] : []), ...p.growthAreas]);
  const goalFocus = p.profileGoals.flatMap((g) => GOAL_FOCUS[g] ?? []).filter((k) => weak.has(k));
  return [...new Set([...p.goalCompetencies, ...goalFocus, ...(p.blindSpot ? [p.blindSpot] : []), ...p.growthAreas])];
}
