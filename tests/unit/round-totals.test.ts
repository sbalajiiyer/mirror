import { describe, expect, it } from "vitest";
import { addToTotals, profileFromTotals, type RoundTotals } from "@/lib/org/round-totals";
import { groupProfile } from "@/lib/org/analytics";
import type { ReportData } from "@/lib/report/compute";

const rep = (comm: number | null, exec: number, self: number | null, overall: number | null) =>
  ({
    competencies: [
      { key: "comm", name: "Communication", self, others: { mean: comm } },
      { key: "exec", name: "Execution", self: 4, others: { mean: exec } },
    ],
    summary: { overallOthers: overall },
  }) as unknown as ReportData;

const empty: RoundTotals = { people: 0, competencies: {}, overallN: 0, overallSum: 0 };

describe("round totals", () => {
  const reports = [rep(3.2, 4, 4, 3.6), rep(3.8, 3.5, null, 3.65), rep(4.1, 4.2, 3, 4.15), rep(null, 3.9, 5, 3.9), rep(2.9, 4.4, 4, 3.65), rep(3.5, 3.1, 4, 3.3)];
  const totals = reports.reduce(addToTotals, empty);

  it("gives the same profile as computing from the reports", () => {
    expect(profileFromTotals(totals, 5)).toEqual(groupProfile(reports, 5));
  });

  it("hides everything below the minimum group size (never below 5)", () => {
    const four = reports.slice(0, 4).reduce(addToTotals, empty);
    expect(profileFromTotals(four, 3)).toEqual({ people: 4, available: false, competencies: [], overall: null });
  });

  it("does not mutate the totals it is given", () => {
    const snapshot = JSON.stringify(totals);
    addToTotals(totals, reports[0]);
    expect(JSON.stringify(totals)).toBe(snapshot);
  });
});
