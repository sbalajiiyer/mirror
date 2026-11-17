import { describe, expect, it } from "vitest";
import { atLeast, TAB_ROLE } from "@/lib/org/roles";

describe("company roles", () => {
  it("orders roles Member < Analyst < Admin < Owner", () => {
    expect(atLeast("OWNER", "ADMIN")).toBe(true);
    expect(atLeast("ADMIN", "ANALYST")).toBe(true);
    expect(atLeast("ANALYST", "ADMIN")).toBe(false);
    expect(atLeast("MEMBER", "ANALYST")).toBe(false);
    expect(atLeast("NOT_A_ROLE", "MEMBER")).toBe(false);
  });

  it("analysts get overview and analytics; settings are owner-only", () => {
    const tabsFor = (r: string) => Object.entries(TAB_ROLE).filter(([, min]) => atLeast(r, min)).map(([k]) => k);
    expect(tabsFor("ANALYST")).toEqual(["overview", "analytics"]);
    expect(tabsFor("ADMIN")).not.toContain("settings");
    expect(tabsFor("OWNER")).toContain("settings");
  });
});
