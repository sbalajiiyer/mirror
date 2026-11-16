/**
 * Data residency (Phase 10). Each organization picks where its data should stay. Today all data is
 * stored in one database (Neon, AWS us-east-1) and served from Vercel iad1; the region setting
 * controls which processors may receive it. For "eu" organizations, 360 round data is never sent
 * to an AI provider unless that provider is listed in AI_EU_PROVIDERS (e.g. an EU-hosted endpoint).
 */
export type Region = "us" | "eu";

export const REGIONS: Record<Region, { label: string; storage: string; ai: string }> = {
  us: { label: "United States", storage: "Neon Postgres, AWS us-east-1 (N. Virginia); app servers on Vercel iad1", ai: "AI features use the configured providers (US-hosted)" },
  eu: {
    label: "European Union",
    storage: "Today the same US database as other organizations (an EU database is on the roadmap); data is only moved there on request",
    ai: "AI features are off for round data unless an EU-hosted AI provider is configured; standard (non-AI) summaries are used instead",
  },
};

export const isRegion = (x: unknown): x is Region => x === "us" || x === "eu";

export function providerAllowedIn(provider: string, region: Region) {
  if (region === "us") return true;
  const eu = (process.env.AI_EU_PROVIDERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return eu.includes(provider);
}
