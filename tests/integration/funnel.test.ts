/** Anonymous funnel counts: totals from existing data, demo/test accounts left out, small numbers hidden. */
import { describe, expect, it } from "vitest";
import { rates, shown } from "@/lib/services/funnel";

const hasDb = !!process.env.TEST_DATABASE_URL;

describe("funnel helpers", () => {
  it("hides small numbers and computes step conversion", () => {
    expect(shown(0)).toBe("0");
    expect(shown(3)).toBe("<5");
    expect(shown(1234)).toBe("1,234");
    const r = rates([
      { key: "a", label: "A", help: "", count: 200 },
      { key: "b", label: "B", help: "", count: 50 },
      { key: "c", label: "C", help: "", count: 25 },
    ]);
    expect(r.map((x) => [x.fromPrev, x.fromStart])).toEqual([
      [null, 100],
      [25, 25],
      [50, 13],
    ]);
  });
});

describe.skipIf(!hasDb)("funnel counts (integration)", async () => {
  const { db } = await import("@/lib/db");
  const { funnel } = await import("@/lib/services/funnel");
  const stamp = Date.now();
  const get = async (includeTest = false) => Object.fromEntries((await funnel({ window: "7", includeTest })).steps.map((s) => [s.key, s.count]));

  it("counts real sign-ups by step, and leaves demo and test accounts out unless asked", async () => {
    const before = await get();
    const beforeAll = await get(true);
    await db.user.create({ data: { email: `real-${stamp}@acme-funnel.com`, ageConfirmedAt: new Date(), profile: { create: { displayName: "Real", goals: [], onboardedAt: new Date() } } } });
    await db.user.create({ data: { email: `agecheck-${stamp}@acme-funnel.com`, ageConfirmedAt: new Date() } });
    await db.user.create({ data: { email: `seed-${stamp}@test.local`, ageConfirmedAt: new Date() } });
    const after = await get();
    expect(after.signed_up - before.signed_up).toBe(2);
    expect(after.age_ok - before.age_ok).toBe(2);
    expect(after.onboarded - before.onboarded).toBe(1);
    expect(after.created - before.created).toBe(0);
    expect((await get(true)).signed_up - beforeAll.signed_up).toBe(3);
  }, 30000);

  it("returns only totals: no ids, emails or names", async () => {
    const f = await funnel({ window: "all", includeTest: true });
    const json = JSON.stringify(f);
    expect(json).not.toMatch(/@|cuid|"id"/);
    expect(f.raters.map((r) => r.key)).toEqual(["invited", "started", "submitted"]);
  }, 30000);
});
