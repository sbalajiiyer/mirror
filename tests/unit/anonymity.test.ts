import { describe, expect, it } from "vitest";
import { ANONYMITY_FLOOR, effectiveMinRaters, resolveReportingGroups, stableShuffle, suppressCells, type GroupInput } from "@/lib/anonymity";

const G = (id: string, kind: GroupInput["kind"], order: number): GroupInput => ({ id, kind, name: id[0].toUpperCase() + id.slice(1), order });
const groups = [G("self", "SELF", 0), G("manager", "MANAGER", 1), G("peers", "PEER", 2), G("reports", "DIRECT_REPORT", 3), G("clients", "CLIENT", 4)];
const resolve = (counts: Record<string, number>, opts: { min?: number; manager?: boolean } = {}) =>
  resolveReportingGroups({ groups, counts, minRaters: opts.min ?? 3, showManagerSeparately: opts.manager ?? false });

describe("effectiveMinRaters", () => {
  it("never goes below the floor of 3", () => {
    expect(ANONYMITY_FLOOR).toBe(3);
    expect(effectiveMinRaters(1)).toBe(3);
    expect(effectiveMinRaters(0)).toBe(3);
    expect(effectiveMinRaters(null)).toBe(3);
    expect(effectiveMinRaters(5)).toBe(5);
  });
});

describe("resolveReportingGroups", () => {
  it("hides everything when fewer than min people responded", () => {
    const r = resolve({ peers: 2 });
    expect(r.othersVisible).toBe(false);
    expect(r.reportingGroups).toHaveLength(0);
    expect(Object.values(r.groupToReporting).every((v) => v === null)).toBe(true);
  });

  it("shows groups that meet the threshold separately", () => {
    const r = resolve({ peers: 3, reports: 4 });
    expect(r.othersVisible).toBe(true);
    expect(r.reportingGroups.map((g) => g.label)).toEqual(["Peers", "Reports"]);
    expect(r.groupToReporting.peers).not.toBe(r.groupToReporting.reports);
  });

  it("pools small groups when their combined count meets the threshold", () => {
    const r = resolve({ peers: 4, manager: 1, clients: 2 });
    const combined = r.reportingGroups.find((g) => g.id === "rg_combined")!;
    expect(combined.n).toBe(3);
    expect(combined.memberGroupIds.sort()).toEqual(["clients", "manager"]);
    expect(r.groupToReporting.manager).toBe("rg_combined");
  });

  it("merges a too-small pool into the smallest visible group (prevents subtraction attack)", () => {
    const r = resolve({ peers: 5, reports: 3, clients: 2 });
    // Clients (2) can't stand alone or as a pool; merged with Reports (3, smallest visible).
    expect(r.reportingGroups.find((g) => g.label.startsWith("Reports"))!.memberGroupIds).toEqual(["reports", "clients"]);
    // Every reporting group is at or above the threshold, so no group can be derived by subtraction.
    for (const g of r.reportingGroups) expect(g.n).toBeGreaterThanOrEqual(3);
    const total = r.reportingGroups.reduce((s, g) => s + g.n, 0);
    expect(total).toBe(r.othersN);
  });

  it("does not show the manager separately unless the subject opted in", () => {
    const r = resolve({ peers: 3, manager: 1 });
    expect(r.reportingGroups.some((g) => g.exempt)).toBe(false);
    expect(r.reportingGroups.find((g) => g.memberGroupIds.includes("manager"))!.label).toBe("Peers + Manager");
  });

  it("shows an opted-in manager separately even with one rater", () => {
    const r = resolve({ peers: 3, manager: 1 }, { manager: true });
    const m = r.reportingGroups.find((g) => g.exempt)!;
    expect(m.memberGroupIds).toEqual(["manager"]);
    expect(m.n).toBe(1);
  });

  it("requires the non-manager raters alone to meet the threshold when the manager is shown separately", () => {
    // 1 manager + 2 peers = 3 total, but the 2 peers would be exposed by subtracting the manager.
    const r = resolve({ peers: 2, manager: 1 }, { manager: true });
    expect(r.othersVisible).toBe(false);
  });

  it("respects a stricter configured minimum", () => {
    const r = resolve({ peers: 4, reports: 5 }, { min: 5 });
    expect(r.reportingGroups.map((g) => g.label)).toEqual(["Reports + Peers"]);
  });

  it("never treats the self group as a rater group", () => {
    const r = resolve({ self: 1, peers: 3 });
    expect(r.othersN).toBe(3);
    expect(r.groupToReporting.self).toBeNull();
  });
});

describe("suppressCells", () => {
  it("hides cells below the threshold", () => {
    const hidden = suppressCells([{ key: "a", n: 5 }, { key: "b", n: 4 }, { key: "c", n: 2 }], 3);
    expect(hidden.has("c")).toBe(true);
  });

  it("applies complementary suppression so a hidden cell can't be derived from the total", () => {
    // c (n=2) is hidden; hiding it alone leaves total − a − b = c. So the next smallest is hidden too.
    const hidden = suppressCells([{ key: "a", n: 5 }, { key: "b", n: 4 }, { key: "c", n: 2 }], 3);
    expect([...hidden].sort()).toEqual(["b", "c"]);
  });

  it("stops once hidden cells together reach the threshold", () => {
    const hidden = suppressCells([{ key: "a", n: 5 }, { key: "b", n: 2 }, { key: "c", n: 1 }], 3);
    expect([...hidden].sort()).toEqual(["b", "c"]);
  });

  it("never hides exempt cells and ignores empty cells", () => {
    const hidden = suppressCells([{ key: "m", n: 1, exempt: true }, { key: "a", n: 4 }, { key: "z", n: 0 }], 3);
    expect(hidden.size).toBe(0);
  });
});

describe("stableShuffle", () => {
  it("is deterministic and independent of input order", () => {
    const xs = ["one", "two", "three", "four", "five"];
    const a = stableShuffle(xs, (x) => x);
    const b = stableShuffle([...xs].reverse(), (x) => x);
    expect(a).toEqual(b);
    expect(a.sort()).toEqual([...xs].sort());
  });
});
