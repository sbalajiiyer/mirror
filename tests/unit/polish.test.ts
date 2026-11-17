import { describe, expect, it } from "vitest";
import { pickLocale, RATER_LOCALES, RATER_STRINGS } from "@/lib/i18n/rater";
import { CORE_360_TRANSLATIONS } from "@/lib/i18n/core-360";
import { CORE_360 } from "@/lib/frameworks/core-360";
import { citationFilter, CITE_MARK } from "@/lib/ai/chat-stream";

describe("rater languages", () => {
  it("picks ?lang, then the saved choice, then the browser, then English", () => {
    expect(pickLocale("de", "fr", "es-ES,es;q=0.9")).toBe("de");
    expect(pickLocale(null, "fr", "es-ES")).toBe("fr");
    expect(pickLocale(undefined, undefined, "pt-BR,pt;q=0.9,en;q=0.8")).toBe("pt");
    expect(pickLocale("xx", "yy", "ja-JP,zh;q=0.8")).toBe("en");
  });

  it("has every string in every language", () => {
    const keys = Object.keys(RATER_STRINGS.en).sort();
    for (const l of RATER_LOCALES) {
      expect(Object.keys(RATER_STRINGS[l]).sort()).toEqual(keys);
      for (const [k, v] of Object.entries(RATER_STRINGS[l])) {
        if (typeof v === "function") expect(String((v as (...a: unknown[]) => string)("Alex", 3)), `${l}.${k}`).not.toBe("");
      }
      expect(Object.keys(RATER_STRINGS[l].ratingLabels)).toHaveLength(5);
    }
  });

  it("translates every built-in statement and competency, keeping {name}", () => {
    for (const pack of Object.values(CORE_360_TRANSLATIONS)) {
      for (const c of CORE_360.competencies) {
        expect(pack.competencies[c.key]).toBeTruthy();
        for (const q of c.questions) expect(pack.questions[q.key]).toContain("{name}");
      }
    }
  });
});

describe("streamed chat citations", () => {
  it("never shows the facts marker, even when it arrives in pieces", () => {
    const f = citationFilter();
    const chunks = ["Focus on ", "listening in ", "meetings.\n[[fa", "cts]] Communication: others 3.2", " | Listening: 2.9"];
    const shown = chunks.map((c) => f.push(c)).join("");
    const end = f.finish();
    expect((shown + end.tail).trimEnd()).toBe("Focus on listening in meetings.");
    expect(shown).not.toContain("[[");
    expect(end.reply).toBe("Focus on listening in meetings.");
    expect(end.citations).toEqual(["Communication: others 3.2", "Listening: 2.9"]);
  });

  it("passes plain replies through untouched", () => {
    const f = citationFilter();
    const shown = ["Hello ", "there, how ", "can I help?"].map((c) => f.push(c)).join("");
    const end = f.finish();
    expect(shown + end.tail).toBe("Hello there, how can I help?");
    expect(end.citations).toEqual([]);
    expect(CITE_MARK).toBe("[[facts]]");
  });
});
