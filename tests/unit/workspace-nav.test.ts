import { describe, expect, it } from "vitest";
import { navFor } from "@/lib/workspace-nav";

const labels = (x: Parameters<typeof navFor>[0]) => navFor(x).map((l) => l.label);

describe("menus by workspace", () => {
  it("Personal has personal features, including billing and coaching", () => {
    expect(labels({ kind: "PERSONAL", orgId: null, admin: false, isCoach: false })).toEqual(["My 360s", "Progress", "Questionnaires", "Dashboards", "AI coach", "Coaching", "Billing", "Settings"]);
    expect(labels({ kind: "PERSONAL", orgId: null, admin: false, isCoach: true })).toContain("Coach");
  });

  it("a company member sees no billing, marketplace or company admin pages", () => {
    const l = labels({ kind: "COMPANY", orgId: "o1", admin: false, isCoach: true });
    expect(l).toEqual(["My rounds", "Progress", "AI coach", "Settings"]);
  });

  it("a company admin also gets the company pages", () => {
    const n = navFor({ kind: "COMPANY", orgId: "o1", admin: true, isCoach: false });
    expect(n.map((x) => x.label)).toEqual(["My rounds", "Progress", "AI coach", "Company", "Dashboards", "Settings"]);
    expect(n.find((x) => x.label === "Company")?.href).toBe("/orgs/o1");
  });
});
