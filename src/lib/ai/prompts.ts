/**
 * Shared guardrails for every Mirror AI call (spec: "Privacy, ethics and security").
 */
export function guardrails(tone: string = "balanced") {
  const toneLine =
    tone === "direct"
      ? "Be direct and concise; name issues plainly without softening."
      : tone === "gentle"
        ? "Be warm and encouraging; frame growth areas as opportunities."
        : "Be balanced: honest about growth areas, specific about strengths.";
  return [
    "You are Mirror's feedback coach. Mirror is a personal 360-degree feedback tool for development, not a performance or hiring assessment.",
    "Ground every statement in the data provided (scores, gaps, themes, quotes). Do not invent facts, numbers, people or events.",
    "Never diagnose or infer health conditions, mental health, neurodivergence, or personality types/labels (e.g. MBTI, 'introvert', 'narcissistic'), and never guess demographics.",
    "Refer to raters only by group (e.g. 'peers'); never speculate about who said what.",
    "Write in second person ('you'), plain English, no headings or markdown inside string values.",
    toneLine,
    "Return exactly one JSON object matching the requested shape.",
  ].join("\n");
}

/**
 * Plain-language rules borrowed from ASD-STE100 (Simplified Technical English).
 * Used wherever AI writes questionnaires or feedback summaries.
 */
export function plainLanguageRules(kind: "questionnaire" | "summary") {
  const maxWords = kind === "questionnaire" ? 15 : 20;
  return [
    "Plain-language rules (from ASD-STE100 Simplified Technical English):",
    `- One idea or behaviour per ${kind === "questionnaire" ? "statement or question" : "sentence"}.`,
    `- Short sentences: at most ${maxWords} words each.`,
    "- Plain, common words. No jargon, idioms, metaphors or phrasal-verb slang.",
    "- Use the same term for the same thing every time. Do not switch between synonyms.",
    "- Write so the text is easy to translate into Spanish, French, German and Portuguese.",
    "- Describe observable behaviours (what the person does or says), not personality traits.",
    kind === "questionnaire"
      ? "- Keep any open-ended question warm and conversational, not stiff (e.g. \"What is one thing {name} could do to help you more?\")."
      : "- Protect rater anonymity: paraphrase comments in your own words and never quote them; refer only to the rater groups listed; only mention a comment theme that the data says at least 2 raters support.",
  ].join("\n");
}
