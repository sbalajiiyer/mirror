import { describe, expect, it } from "vitest";
import { buildBrief, crossClient, MIN_CLIENTS, questionsFor, withoutComments } from "@/lib/coach/brief";
import type { ReportData } from "@/lib/report/compute";

const report = (o: { scores: Record<string, number>; blind?: string | null; growth?: string[]; strengths?: string[] }): ReportData =>
  ({
    assessment: { id: "a", title: "T", goal: "promotion", subjectFirstName: "Sam", scaleMax: 5 },
    anonymity: { available: true, othersN: 7 },
    competencies: Object.entries(o.scores).map(([key, v]) => ({ key, name: key[0].toUpperCase() + key.slice(1), others: { mean: v }, self: 4 })),
    questions: [],
    summary: { strengths: o.strengths ?? [], growthAreas: o.growth ?? [], blindSpot: o.blind ?? null, hiddenStrength: null, overallOthers: 3.5 },
    comments: {
      themes: [{ key: "t", label: "Clarity", count: 2, sentiment: 0, comments: [{ text: "secret words", group: "Peers", sentiment: "neutral" }] }],
      competency: { communication: [{ text: "more secret", group: "Peers" }] },
      ssc: { START: [{ key: "s", label: "Delegate", count: 1, sentiment: 0, comments: [{ text: "start secret", group: "Peers", sentiment: "neutral" }] }], STOP: [], CONTINUE: [] },
      wordCloud: [{ word: "secret", count: 3 }],
      total: 3,
    },
  }) as unknown as ReportData;

describe("session-prep brief", () => {
  it("summarises the latest report and suggests questions for the blind spot and growth areas", () => {
    const b = buildBrief({
      clientFirstName: "Sam",
      latest: { report: report({ scores: { communication: 3, leadership: 4 }, blind: "communication", growth: ["communication"], strengths: ["leadership"] }), label: "S2 · Full 360", date: "2026-11-01T00:00:00Z", point: null },
      previous: null,
      goals: [],
      openSession: null,
    });
    expect(b.headline).toMatch(/strongest in Leadership/);
    expect(b.headline).toMatch(/blind spot: Communication/);
    expect(b.questions.every((q) => q.competency === "Communication")).toBe(true);
    expect(b.questions[0].question).toBe(questionsFor("communication", "Communication")[0]);
  });
  it("handles a client who hasn't shared a report", () => {
    const b = buildBrief({ clientFirstName: "Sam", latest: null, previous: null, goals: [], openSession: "S1 is collecting" });
    expect(b.basedOn).toBeNull();
    expect(b.questions.length).toBe(3);
    expect(b.openSession).toBe("S1 is collecting");
  });
});

describe("cross-client analytics", () => {
  const snap = (comm: number, blind: string | null, first?: number) => ({
    latest: report({ scores: { communication: comm, leadership: 4 }, blind, growth: ["communication"] }),
    first: first == null ? null : report({ scores: { communication: first, leadership: 3.8 } }),
  });
  it(`is hidden below ${MIN_CLIENTS} clients`, () => {
    const x = crossClient([snap(3, "communication"), snap(3.2, null)]);
    expect(x).toMatchObject({ clients: 2, available: false, blindSpots: [], distribution: [], improvement: [] });
  });
  it("counts blind spots, spans the distribution and averages improvement", () => {
    const x = crossClient([snap(3, "communication", 2.8), snap(3.2, "communication", 3), snap(3.4, null, 3), snap(3.6, "leadership", 3.2), snap(3.8, null, 3.6)]);
    expect(x.available).toBe(true);
    expect(x.blindSpots[0]).toEqual({ key: "communication", name: "Communication", clients: 2 });
    const comm = x.distribution.find((d) => d.key === "communication")!;
    expect(comm).toMatchObject({ clients: 5, mean: 3.4, min: 3, max: 3.8 });
    expect(x.improvementAvailable).toBe(true);
    expect(x.improvement.find((d) => d.key === "communication")!.meanDelta).toBe(0.28);
  });
});

describe("withoutComments", () => {
  it("removes every verbatim comment but keeps theme counts", () => {
    const r = withoutComments(report({ scores: { communication: 3 } }));
    expect(JSON.stringify(r)).not.toContain("secret");
    expect(r.comments.themes[0]).toMatchObject({ label: "Clarity", count: 2, comments: [] });
    expect(r.comments.total).toBe(3);
    expect(r.commentsHidden).toBe(true);
  });
});
