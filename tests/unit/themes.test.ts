import { describe, expect, it } from "vitest";
import { groupComments, sentimentOf, themesFor, wordFrequencies } from "@/lib/text/themes";

describe("open-text analysis", () => {
  it("assigns comments to their best-matching theme", () => {
    expect(themesFor("Please delegate more and stop micromanaging")[0]).toBe("delegation");
    expect(themesFor("Great long-term vision and strategy")[0]).toBe("strategy");
    expect(themesFor("Nice person")).toEqual([]);
  });

  it("puts unmatched comments in Other, listed last", () => {
    const g = groupComments([
      { text: "Nice person", group: "Peers" },
      { text: "Clear communication", group: "Peers" },
      { text: "Explains things clearly", group: "Peers" },
    ]);
    expect(g[0].key).toBe("communication");
    expect(g[0].count).toBe(2);
    expect(g[g.length - 1].key).toBe("other");
  });

  it("scores sentiment", () => {
    expect(sentimentOf("Always helpful and supportive").label).toBe("positive");
    expect(sentimentOf("Too often late and hard to reach").label).toBe("negative");
  });

  it("counts words excluding stopwords and the subject's name", () => {
    const w = wordFrequencies(["Alex runs great meetings", "Meetings with Alex are great", "the the the"], ["Alex"]);
    expect(w.map((x) => x.word)).toEqual(["great", "meetings"]);
  });
});
