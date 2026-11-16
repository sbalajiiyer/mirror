/**
 * AI model catalog. "free" is the default for everyone (Groq free tier, open-weight gpt-oss).
 * Premium models are opt-in per user and metered per use (billing arrives with Phase 9);
 * each is only offered when its API key is configured AND PREMIUM_AI_ENABLED=true.
 *
 * Model names come from env so they can be updated without a code change.
 */
export type AIModelEntry = {
  id: string;
  label: string;
  description: string;
  tier: "free" | "premium";
  provider: "groq" | "anthropic" | "openai" | "mock";
  /** Provider model id for long-form writing (summaries, plans). */
  model: string;
  /** Cheaper/faster model for short tasks (de-identification, invite drafts). */
  fastModel: string;
  /** Price charged to the user, micro-dollars per 1K tokens (input+output). 0 = free. */
  priceMicrosPer1k: number;
  available: boolean;
};

const env = (k: string, d = "") => process.env[k] ?? d;
const premiumOn = () => env("PREMIUM_AI_ENABLED") === "true";

export function aiCatalog(): AIModelEntry[] {
  const useMock = env("AI_PROVIDER") === "mock" || (!env("GROQ_API_KEY") && process.env.NODE_ENV !== "production");
  return [
    {
      id: "free",
      label: "Standard (free)",
      description: "Open-weight gpt-oss, hosted by Groq. Included for everyone.",
      tier: "free",
      provider: useMock ? "mock" : "groq",
      model: env("GROQ_MODEL", "openai/gpt-oss-120b"),
      fastModel: env("GROQ_FAST_MODEL", "openai/gpt-oss-20b"),
      priceMicrosPer1k: 0,
      available: useMock || !!env("GROQ_API_KEY"),
    },
    {
      id: "premium-claude",
      label: "Premium — Claude",
      description: "Anthropic Claude. More nuanced writing; charged per use.",
      tier: "premium",
      provider: "anthropic",
      model: env("ANTHROPIC_MODEL"),
      fastModel: env("ANTHROPIC_FAST_MODEL", env("ANTHROPIC_MODEL")),
      priceMicrosPer1k: Number(env("PREMIUM_CLAUDE_PRICE_MICROS_PER_1K", "20000")),
      available: premiumOn() && !!env("ANTHROPIC_API_KEY") && !!env("ANTHROPIC_MODEL"),
    },
    {
      id: "premium-gpt",
      label: "Premium — GPT",
      description: "OpenAI GPT. Charged per use.",
      tier: "premium",
      provider: "openai",
      model: env("OPENAI_MODEL"),
      fastModel: env("OPENAI_FAST_MODEL", env("OPENAI_MODEL")),
      priceMicrosPer1k: Number(env("PREMIUM_GPT_PRICE_MICROS_PER_1K", "20000")),
      available: premiumOn() && !!env("OPENAI_API_KEY") && !!env("OPENAI_MODEL"),
    },
  ];
}

/** Resolve a user's choice to an available model, falling back to the free tier. */
export function resolveModel(choice: string | null | undefined): AIModelEntry {
  const catalog = aiCatalog();
  const picked = catalog.find((m) => m.id === choice && m.available);
  return picked ?? catalog[0];
}

export function costMicros(entry: AIModelEntry, inputTokens: number, outputTokens: number) {
  return Math.round(((inputTokens + outputTokens) / 1000) * entry.priceMicrosPer1k);
}
