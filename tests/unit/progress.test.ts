import { describe, expect, it } from "vitest";
import { addMonths, compare, defaultPulseQuestions, goalProgress, streak, trendRows, valueOn, type SeriesPoint } from "@/lib/progress";
import type { ReportData } from "@/lib/report/compute";

const pt = (id: string, date: string, qs: Record<string, [string, number | null, number | null]>, type: "FULL_360" | "PULSE" = "PULSE"): SeriesPoint => {
  const questions: SeriesPoint["questions"] = {};
  const comps: SeriesPoint["competencies"] = {};
  for (const [k, [c, o, s]] of Object.entries(qs)) {
    questions[k] = { competencyKey: c, others: o, self: s };
    comps[c] = { name: c.toUpperCase(), others: null, self: null };
  }
  return { assessmentId: id, title: id, type, date, raters: 5, competencies: comps, questions };
};

// Full 360 measures 4 communication statements; the pulse re-asks only 2 of them.
const full = pt("full", "2026-09-01T00:00:00Z", { "comm.a": ["comm", 2, 4], "comm.b": ["comm", 3, 4], "comm.c": ["comm", 4, 4], "comm.d": ["comm", 5, 4], "exec.a": ["exec", 4, 4] }, "FULL_360");
const pulse = pt("p1", "2026-10-01T00:00:00Z", { "comm.a": ["comm", 3, 4], "comm.b": ["comm", 4, 4] });

describe("like-for-like comparisons", () => {
  it("compares only statements both check-ins asked", () => {
    const [row] = compare(full, pulse);
    expect(row.key).toBe("comm");
    expect(row.statements).toBe(2);
    expect(row.before).toBe(2.5); // (2+3)/2 — not the full 3.5 average
    expect(row.after).toBe(3.5);
    expect(row.delta).toBe(1);
  });

  it("builds trend rows on the common statements and counts measurements", () => {
    const { competencies, rows } = trendRows([pulse, full]);
    const comm = competencies.find((c) => c.key === "comm")!;
    expect(comm).toMatchObject({ measured: 2, statements: 2 });
    expect(competencies.find((c) => c.key === "exec")!.measured).toBe(1);
    expect(rows.map((r) => r.assessmentId)).toEqual(["full", "p1"]); // oldest first
    expect(rows[0]["comm:others"]).toBe(2.5);
    expect(rows[1]["comm:others"]).toBe(3.5);
  });

  it("ignores suppressed (null) statements", () => {
    const p = pt("x", "2026-10-02T00:00:00Z", { "comm.a": ["comm", null, 4], "comm.b": ["comm", 4, 4] });
    expect(valueOn(p, new Set(["comm.a", "comm.b"])).others).toBe(4);
  });
});

describe("goal progress", () => {
  const goal = { competencyKey: "comm", baseline: 3.5, target: 3.4, createdAt: "2026-09-02T00:00:00Z" };
  it("re-measures the baseline on the statements the latest pulse asked", () => {
    const g = goalProgress(goal, [full, pulse]);
    expect(g.baselineNow).toBe(2.5);
    expect(g.latest).toBe(3.5);
    expect(g.achieved).toBe(true);
    expect(g.pct).toBe(100);
    expect(g.measurements).toBe(1);
  });
  it("shows no progress until a later check-in measures the competency", () => {
    const g = goalProgress(goal, [full]);
    expect(g).toMatchObject({ latest: null, pct: 0, achieved: false, measurements: 0 });
  });
  it("computes partial progress", () => {
    const g = goalProgress({ ...goal, target: 4.5 }, [full, pulse]);
    expect(g.pct).toBe(50); // 2.5 → 3.5 of the way to 4.5
  });
});

describe("streak", () => {
  const now = new Date("2026-12-15T00:00:00Z");
  it("counts consecutive on-schedule pulses", () => {
    expect(streak(["2026-09-10", "2026-10-12", "2026-11-14", "2026-12-10"], 1, now)).toEqual({ count: 4, onTrack: true });
  });
  it("breaks on a long gap", () => {
    expect(streak(["2026-05-01", "2026-11-14", "2026-12-10"], 1, now).count).toBe(2);
  });
  it("resets when the latest pulse is overdue", () => {
    expect(streak(["2026-08-01", "2026-09-01"], 1, now)).toEqual({ count: 0, onTrack: false });
  });
  it("handles no cadence and no pulses", () => {
    expect(streak([], 1, now).count).toBe(0);
    expect(streak(["2026-01-01"], null, now)).toEqual({ count: 1, onTrack: true });
  });
  it("adds calendar months", () => {
    expect(addMonths(new Date("2026-01-15T00:00:00Z"), 2).toISOString().slice(0, 10)).toBe("2026-03-15");
  });
});

describe("default pulse questions", () => {
  const q = (id: string, c: string, mean: number) => ({ id, key: id, competencyKey: c, text: id, self: 4, others: { mean, n: 5, suppressed: false }, byGroup: {}, distribution: null, stdDev: null, agreement: null });
  const report = {
    summary: { strengths: [], growthAreas: ["comm", "ei"], blindSpot: "comm", hiddenStrength: null, narrative: "", overallOthers: null, overallSelf: null },
    questions: [q("c1", "comm", 3.1), q("c2", "comm", 2.5), q("c3", "comm", 3.9), q("e1", "ei", 3.0), q("e2", "ei", 3.4), q("l1", "lead", 2.0), q("x1", "exec", 4.5)],
  } as unknown as ReportData;

  it("prioritises goals, then blind spot and growth areas, lowest-rated first", () => {
    const ids = defaultPulseQuestions(report, ["lead"], 10, 5);
    expect(ids[0]).toBe("l1");
    expect(ids.slice(1, 3)).toEqual(["c2", "c1"]);
    expect(ids.length).toBeGreaterThanOrEqual(5);
    expect(ids.length).toBeLessThanOrEqual(10);
  });
  it("tops up to the minimum", () => {
    expect(defaultPulseQuestions(report, [], 10, 7)).toHaveLength(7);
  });
});
