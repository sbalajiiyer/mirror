import { describe, expect, it } from "vitest";
import { bandLabel, computeNorms, percentileOf, quantile } from "@/lib/benchmarks";
import { matchWidget, toCsv, toText } from "@/lib/dashboards/widgets";

describe("benchmark norms", () => {
  const people = (n: number, seniority = "Senior") => Array.from({ length: n }, (_, i) => ({ scores: { communication: 2.5 + (i % 20) * 0.1 }, seniority, goal: "promotion" }));
  it("needs 30 people for everyone and 10 for a slice", () => {
    expect(computeNorms(people(29)).filter((x) => x.slice === "all")).toEqual([]);
    expect(computeNorms(people(9)).length).toBe(0);
    const n = computeNorms([...people(25), ...people(5, "Manager")]);
    expect(n.find((x) => x.slice === "all")!.n).toBe(30);
    expect(n.find((x) => x.slice === "seniority:Senior")!.n).toBe(25);
    expect(n.find((x) => x.slice === "seniority:Manager")).toBeUndefined(); // only 5
  });
  it("stores ordered percentiles and places a score between them", () => {
    const [all] = computeNorms(people(40)).filter((x) => x.slice === "all");
    expect(all.p10 <= all.p25 && all.p25 <= all.p50 && all.p50 <= all.p75 && all.p75 <= all.p90).toBe(true);
    expect(percentileOf(all.p50, all)).toBe(50);
    expect(percentileOf(all.p75, all)).toBe(75);
    expect(percentileOf(5, all)).toBe(99);
    expect(percentileOf(1, all)).toBe(1);
    expect(quantile([1, 2, 3, 4], 50)).toBe(2.5);
    expect([95, 80, 60, 30, 10].map(bandLabel)).toEqual(["Top 10%", "Top quarter", "Above the middle", "Below the middle", "Bottom quarter"]);
  });
});

describe("dashboard widgets", () => {
  it("matches plain-English questions to the scope's widgets", () => {
    expect(matchWidget("How are my goals going?", "PERSONAL")).toBe("goals");
    expect(matchWidget("How do I compare to others like me?", "PERSONAL")).toBe("benchmarks");
    expect(matchWidget("Show my progress over time", "PERSONAL")).toBe("trend");
    expect(matchWidget("Which team has the biggest spread?", "ORG")).toBe("team_profile");
    expect(matchWidget("What's the response rate for each round?", "ORG")).toBe("org_participation");
    expect(matchWidget("common blind spots across clients", "COACH")).toBe("client_patterns");
    expect(matchWidget("banana", "PERSONAL")).toBeNull();
  });
  it("exports safe CSV (quotes, commas, spreadsheet formulas) and plain text", () => {
    const csv = toCsv({ columns: ["Name", "Score"], rows: [["Ana, \"A\"", 3.5], ["=HYPERLINK(1)", -0.2], [null, 4]] });
    expect(csv).toBe('Name,Score\r\n"Ana, ""A""",3.5\r\n"\'=HYPERLINK(1)",-0.2\r\n,4\r\n');
    expect(toText({ title: "T", columns: ["A", "B"], rows: [["x", 3.456]] })).toBe("T\n  A · B\n  x · 3.46");
    expect(toText({ title: "T", columns: [], rows: [], locked: "Needs 5 people" })).toBe("T\n  Needs 5 people");
  });
});
