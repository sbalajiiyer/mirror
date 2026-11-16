import { describe, expect, it } from "vitest";
import { behaviourBand, compareGroups, groupProfile, nineBox, participation, strengthsAndGaps, teamHeatmap, type MemberReport } from "@/lib/org/analytics";
import { parseMemberList } from "@/lib/services/org";
import type { ReportData } from "@/lib/report/compute";

const rep = (comm: number, lead = 4, overall = 3.6): ReportData =>
  ({
    assessment: { scaleMax: 5 },
    anonymity: { available: true, othersN: 6 },
    competencies: [
      { key: "communication", name: "Communication", others: { mean: comm }, self: 4 },
      { key: "leadership", name: "Leadership", others: { mean: lead }, self: 4 },
    ],
    summary: { overallOthers: overall },
  }) as unknown as ReportData;
const people = (n: number, named = 0): MemberReport[] => Array.from({ length: n }, (_, i) => ({ memberId: `m${i}`, name: `P${i}`, named: i < named, report: rep(3 + i * 0.1) }));

describe("group profile", () => {
  it("needs at least 5 people (even if the org asks for fewer)", () => {
    expect(groupProfile(people(4).map((p) => p.report), 3)).toMatchObject({ available: false, competencies: [], overall: null });
    const g = groupProfile(people(5).map((p) => p.report), 3);
    expect(g.available).toBe(true);
    expect(g.competencies.find((c) => c.key === "communication")).toMatchObject({ people: 5, others: 3.2, self: 4 });
    expect(g.competencies[0].spread).toBeGreaterThan(0);
    expect(strengthsAndGaps(g).strengths[0].key).toBe("leadership");
  });
});

describe("team heatmap privacy", () => {
  it("shows nobody below the threshold", () => {
    expect(teamHeatmap(people(4, 4), 5).rows).toEqual([]);
  });
  it("names consenting people and folds the rest into one row when that row is big enough", () => {
    const h = teamHeatmap(people(7, 2), 5);
    expect(h.rows.map((r) => r.label)).toEqual(["P0", "P1", "Others (5)"]);
    expect(h.rows[2].values.communication).toBeCloseTo(3.4);
  });
  it("shows only the whole team when the non-consenting remainder is too small", () => {
    const h = teamHeatmap(people(6, 3), 5);
    expect(h.rows.map((r) => r.label)).toEqual(["Whole team (6)"]);
    expect(h.hiddenPeople).toBe(3);
  });
  it("names everyone when everyone consents", () => {
    expect(teamHeatmap(people(5, 5), 5).rows).toHaveLength(5);
  });
});

describe("cohort comparison", () => {
  it("compares only when both sides have enough people", () => {
    const before = Array.from({ length: 5 }, () => rep(3));
    const after = Array.from({ length: 5 }, () => rep(3.4, 4.1));
    const c = compareGroups({ label: "Spring", reports: before }, { label: "Autumn", reports: after }, 5);
    expect(c.available).toBe(true);
    expect(c.rows[0]).toMatchObject({ key: "communication", a: 3, b: 3.4, delta: 0.4 });
    expect(compareGroups({ label: "A", reports: before.slice(0, 4) }, { label: "B", reports: after }, 5).available).toBe(false);
  });
});

describe("talent grid", () => {
  it("bands 360 scores into thirds of the scale", () => {
    expect([2.9, 3.0, 3.99, 4.0].map((s) => behaviourBand(s, 5))).toEqual([1, 2, 2, 3]);
  });
  it("places only people with both a score and a performance rating", () => {
    const g = nineBox([
      { memberId: "a", name: "A", score: 4.2, scaleMax: 5, performance: 3 },
      { memberId: "b", name: "B", score: 3.1, scaleMax: 5, performance: 1 },
      { memberId: "c", name: "C", score: null, scaleMax: 5, performance: 2 },
      { memberId: "d", name: "D", score: 3.5, scaleMax: 5, performance: null },
    ]);
    expect(g.cells).toHaveLength(9);
    expect(g.cells.find((c) => c.behaviours === 3 && c.performance === 3)!.members.map((m) => m.name)).toEqual(["A"]);
    expect(g.cells.find((c) => c.behaviours === 2 && c.performance === 1)!.members.map((m) => m.name)).toEqual(["B"]);
    expect(g.unplaced.map((u) => u.name)).toEqual(["C", "D"]);
  });
});

describe("participation and member lists", () => {
  it("counts the funnel and rater responses", () => {
    const p = participation(4, [
      { status: "CLOSED", selfLockedAt: new Date(), invites: [{ status: "SUBMITTED" }, { status: "INVITED" }] },
      { status: "DRAFT", selfLockedAt: null, invites: [] },
    ]);
    expect(p).toEqual({ invited: 4, started: 2, selfDone: 1, launched: 1, closed: 1, raterInvites: 2, raterResponses: 1 });
  });
  it("parses pasted lists in several formats", () => {
    expect(parseMemberList('Ana Silva <Ana@Example.com>\nben@example.com, Ben Okafor; cara@example.com\nnot-an-email\nana@example.com')).toEqual([
      { email: "ana@example.com", name: "Ana Silva" },
      { email: "ben@example.com", name: "Ben Okafor" },
      { email: "cara@example.com", name: "" },
    ]);
  });
});
