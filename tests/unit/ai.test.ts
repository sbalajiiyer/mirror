import { afterEach, describe, expect, it } from "vitest";
import { extractJson } from "@/lib/ai/client";
import { aiCatalog, costMicros, resolveModel } from "@/lib/ai/models";
import { scrubIdentifiers } from "@/lib/ai/scrub";
import { guardrails } from "@/lib/ai/prompts";
import { fallbackRecommendation } from "@/lib/ai/features/framework";
import { CORE_360 } from "@/lib/frameworks/core-360";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("extractJson", () => {
  it("parses plain, fenced and prose-wrapped JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Sure! Here it is: {"a":3} Hope that helps.')).toEqual({ a: 3 });
  });
  it("throws when there is no object", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("scrubIdentifiers", () => {
  it("removes emails, links, phone numbers and handles", () => {
    const out = scrubIdentifiers("Email me at sam.p@acme.com or call +1 (555) 123-4567, see https://x.io/a and ping @sam_p");
    expect(out).not.toMatch(/acme|555|x\.io|@sam_p/);
    expect(out).toContain("[email]");
    expect(out).toContain("[phone]");
    expect(out).toContain("[link]");
    expect(out).toContain("[handle]");
  });
  it("leaves ordinary feedback alone", () => {
    expect(scrubIdentifiers("Listens well in 1:1s and ships on time.")).toBe("Listens well in 1:1s and ships on time.");
  });
});

describe("model catalog", () => {
  it("uses the free Groq model by default and the mock without a key outside production", () => {
    delete process.env.GROQ_API_KEY;
    expect(resolveModel(null).provider).toBe("mock");
    process.env.GROQ_API_KEY = "gsk_test";
    const free = resolveModel(undefined);
    expect(free.id).toBe("free");
    expect(free.provider).toBe("groq");
    expect(free.model).toBe("openai/gpt-oss-120b");
    expect(free.priceMicrosPer1k).toBe(0);
  });

  it("only offers premium models when enabled and configured; otherwise falls back to free", () => {
    process.env.GROQ_API_KEY = "gsk_test";
    delete process.env.PREMIUM_AI_ENABLED;
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    process.env.ANTHROPIC_MODEL = "some-claude-model";
    expect(resolveModel("premium-claude").id).toBe("free");
    process.env.PREMIUM_AI_ENABLED = "true";
    expect(resolveModel("premium-claude").id).toBe("premium-claude");
    expect(aiCatalog().find((m) => m.id === "premium-gpt")!.available).toBe(false);
  });

  it("charges premium usage per 1K tokens and nothing for free", () => {
    process.env.PREMIUM_AI_ENABLED = "true";
    process.env.ANTHROPIC_API_KEY = "k";
    process.env.ANTHROPIC_MODEL = "m";
    process.env.PREMIUM_CLAUDE_PRICE_MICROS_PER_1K = "20000";
    const premium = aiCatalog().find((m) => m.id === "premium-claude")!;
    expect(costMicros(premium, 1500, 500)).toBe(40000); // 2K tokens × $0.02 = $0.04
    expect(costMicros(aiCatalog()[0], 1500, 500)).toBe(0);
  });
});

describe("guardrails", () => {
  it("forbids diagnoses and personality labels and adapts tone", () => {
    expect(guardrails()).toMatch(/Never diagnose/);
    expect(guardrails()).toMatch(/personality/);
    expect(guardrails("direct")).toMatch(/direct/i);
    expect(guardrails("gentle")).toMatch(/warm/i);
  });
});

describe("fallback framework recommendation", () => {
  const options = [{ slug: CORE_360.slug, name: CORE_360.name, competencies: CORE_360.competencies.map((c) => ({ key: c.key, name: c.name, description: c.description })) }];
  it("picks goal-relevant competencies that exist in the framework", () => {
    const r = fallbackRecommendation("leadership_growth", options);
    expect(r.frameworkSlug).toBe("mirror-core-360");
    expect(r.focus).toContain("leadership");
    expect(r.focus.length).toBeGreaterThanOrEqual(3);
    for (const k of r.focus) expect(CORE_360.competencies.some((c) => c.key === k)).toBe(true);
  });
});
