import { describe, expect, it } from "vitest";
import { CORE_360 } from "@/lib/frameworks/core-360";
import { adaptiveQuestions, pulseFocus } from "@/lib/personalize";
import { pickAction } from "@/lib/jobs/nudges";
import { linkedInAddUrl, linkedInShareUrl } from "@/lib/services/share";

const comps = CORE_360.competencies.map((c) => ({ key: c.key, name: c.name, questions: c.questions.map((q) => ({ key: q.key })) }));
const total = comps.reduce((n, c) => n + c.questions.length, 0);

describe("adaptive question selection", () => {
  it("keeps every statement in the goal's focus areas and two from each other area", () => {
    const r = adaptiveQuestions({ competencies: comps, goal: "promotion", seniority: "Senior" });
    expect(r.focus).toEqual(["strategic_thinking", "leadership", "execution", "communication"]);
    for (const k of r.focus) for (const q of comps.find((c) => c.key === k)!.questions) expect(r.keep).toContain(`${k}.${q.key}`);
    const other = comps.find((c) => !r.focus.includes(c.key))!;
    expect(r.keep.filter((k) => k.startsWith(`${other.key}.`))).toHaveLength(2);
    expect(r.keep.length).toBeLessThan(total);
    expect(r.reasons[0]).toMatch(/Strategic thinking/);
  });
  it("adds leadership for people leaders and shortens for early career", () => {
    const lead = adaptiveQuestions({ competencies: comps, goal: "new_role", jobTitle: "Engineering Manager" });
    expect(lead.focus).toContain("leadership");
    const student = adaptiveQuestions({ competencies: comps, goal: "career_change", seniority: "Student" });
    expect(student.keep.length).toBeLessThan(adaptiveQuestions({ competencies: comps, goal: "career_change", seniority: "Senior" }).keep.length);
    expect(student.keep.filter((k) => k.startsWith("leadership.")).length).toBe(1);
  });
  it("leaves custom questionnaires as written", () => {
    const r = adaptiveQuestions({ competencies: [{ key: "x", name: "X", questions: [{ key: "q1" }, { key: "q2" }] }], goal: "promotion" });
    expect(r.keep).toEqual(["x.q1", "x.q2"]);
  });
});

describe("personalized pulses", () => {
  it("puts active goals first, then growth areas linked to the person's chosen goals", () => {
    expect(pulseFocus({ goalCompetencies: ["communication"], profileGoals: ["leadership_growth"], growthAreas: ["execution", "emotional_intelligence"], blindSpot: null })).toEqual([
      "communication",
      "emotional_intelligence",
      "execution",
    ]);
  });
});

describe("weekly nudges", () => {
  it("rotates through open plan actions week by week and skips done ones", () => {
    const plan = { intro: "", generatedBy: "template" as const, areas: [{ competency: "C", competencyKey: "c", why: "", exercise: "", resources: [], milestones: { d30: "", d60: "", d90: "" }, helpers: [], actions: [{ id: "1", title: "A", detail: "", done: false }, { id: "2", title: "B", detail: "", done: true }, { id: "3", title: "C", detail: "", done: false }] }] };
    const week = 7 * 86400000;
    const a = pickAction(plan as never, new Date(0));
    const b = pickAction(plan as never, new Date(week));
    expect([a, b].sort()).toEqual(["A", "C"]);
    expect(pickAction(null, new Date())).toBeNull();
  });
});

describe("LinkedIn links", () => {
  it("builds the free add-certification and share URLs", () => {
    const u = new URL(linkedInAddUrl({ name: "Verified strengths: Execution", url: "https://m.app/s/abc", id: "abc", issued: new Date(Date.UTC(2026, 10, 1)) }));
    expect(u.origin + u.pathname).toBe("https://www.linkedin.com/profile/add");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ startTask: "CERTIFICATION_NAME", organizationName: "Mirror", issueYear: "2026", issueMonth: "11", certUrl: "https://m.app/s/abc", certId: "abc" });
    expect(linkedInShareUrl("https://m.app/s/abc")).toBe("https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fm.app%2Fs%2Fabc");
  });
});
