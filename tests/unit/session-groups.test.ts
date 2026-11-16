import { describe, expect, it } from "vitest";
import { filterSessions, groupSessions, parseTags, reportThemes, scoreBand, type GroupableSession } from "@/lib/session-groups";

const s = (o: Partial<GroupableSession>): GroupableSession => ({
  id: Math.random().toString(36).slice(2),
  rootId: "r1",
  surveyTitle: "Survey A",
  sessionNumber: 1,
  type: "FULL_360",
  status: "CLOSED",
  label: null,
  company: null,
  tags: [],
  date: "2026-03-10T00:00:00.000Z",
  score: 3.4,
  scaleMax: 5,
  themes: [],
  ...o,
});

describe("session grouping", () => {
  const data = [
    s({ id: "a", company: "Acme", date: "2025-11-02T00:00:00Z", score: 3.1, tags: ["promotion"], themes: ["Communication"] }),
    s({ id: "b", company: "acme", date: "2026-02-01T00:00:00Z", score: 3.7, sessionNumber: 2, themes: ["Communication", "Workload"] }),
    s({ id: "c", rootId: "r2", surveyTitle: "Survey B", company: null, date: "2026-08-20T00:00:00Z", score: null }),
  ];

  it("groups by company case-insensitively, with unset last", () => {
    const g = groupSessions(data, "company");
    expect(g.map((x) => x.label)).toEqual(["Acme", "No company set"]);
    expect(g[0].sessions.map((x) => x.id)).toEqual(["b", "a"]);
    expect(g[0].avgScore).toBe(3.4);
  });

  it("groups by year and quarter, newest first", () => {
    expect(groupSessions(data, "year").map((x) => x.label)).toEqual(["2026", "2025"]);
    expect(groupSessions(data, "quarter").map((x) => x.label)).toEqual(["Q3 2026", "Q1 2026", "Q4 2025"]);
  });

  it("puts a session under every theme and tag it has", () => {
    const g = groupSessions(data, "theme");
    expect(g.find((x) => x.label === "Communication")!.sessions).toHaveLength(2);
    expect(g.find((x) => x.label === "#promotion")!.sessions.map((x) => x.id)).toEqual(["a"]);
    expect(g[g.length - 1].label).toBe("No themes yet");
  });

  it("bands scores high to low and keeps sessions without scores apart", () => {
    const g = groupSessions(data, "score");
    expect(g.map((x) => x.label)).toEqual(["3.5–4.0 out of 5", "3.0–3.5 out of 5", "No visible scores yet"]);
    expect(scoreBand(5, 5).label).toBe("4.5–5.0 out of 5");
    expect(scoreBand(8.2, 10).label).toBe("8.0–10.0 out of 10");
  });

  it("filters by company, tag, year and score range", () => {
    expect(filterSessions(data, { company: "ACME" }).map((x) => x.id)).toEqual(["a", "b"]);
    expect(filterSessions(data, { company: "No company set" }).map((x) => x.id)).toEqual(["c"]);
    expect(filterSessions(data, { tag: " Promotion " }).map((x) => x.id)).toEqual(["a"]);
    expect(filterSessions(data, { year: "2026" }).map((x) => x.id)).toEqual(["b", "c"]);
    expect(filterSessions(data, { minScore: 3.5 }).map((x) => x.id)).toEqual(["b"]);
  });

  it("normalises tags and pulls themes from a report", () => {
    expect(parseTags("Promotion,  new   team, promotion, ")).toEqual(["promotion", "new team"]);
    expect(
      reportThemes({
        comments: { themes: [{ label: "Workload", count: 2 }, { label: "Clarity", count: 5 }] },
        summary: { strengths: ["execution"], growthAreas: ["communication"] },
        competencies: [{ key: "execution", name: "Execution" }, { key: "communication", name: "Communication" }],
      }),
    ).toEqual(["Clarity", "Workload", "Communication", "Execution"]);
  });
});
