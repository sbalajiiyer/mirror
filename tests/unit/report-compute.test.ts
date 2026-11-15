import { describe, expect, it } from "vitest";
import { computeReport, type ReportInput } from "@/lib/report/compute";

type Sub = ReportInput["submissions"][number];

/** Two competencies × two questions; groups: self, peers, reports, clients. */
function makeInput(subs: Sub[], opts: Partial<ReportInput["assessment"]> = {}): ReportInput {
  return {
    assessment: { id: "a1", title: "T", goal: "promotion", scaleMax: 5, minRatersPerGroup: 3, showManagerSeparately: false, subjectFirstName: "Alex", ...opts },
    groups: [
      { id: "self", kind: "SELF", name: "Self", order: 0 },
      { id: "manager", kind: "MANAGER", name: "Manager", order: 1 },
      { id: "peers", kind: "PEER", name: "Peers", order: 2 },
      { id: "reports", kind: "DIRECT_REPORT", name: "Direct reports", order: 3 },
      { id: "clients", kind: "CLIENT", name: "Clients", order: 4 },
    ],
    questions: [
      { id: "q1", competencyKey: "comm", competency: "Communication", text: "Q1", order: 0, type: "RATING" },
      { id: "q2", competencyKey: "comm", competency: "Communication", text: "Q2", order: 1, type: "RATING" },
      { id: "q3", competencyKey: "exec", competency: "Execution", text: "Q3", order: 2, type: "RATING" },
      { id: "q4", competencyKey: "exec", competency: "Execution", text: "Q4", order: 3, type: "RATING" },
    ],
    submissions: subs,
  };
}
let n = 0;
const sub = (groupId: string, vals: (number | null)[], comments: Sub["comments"] = [], isSelf = false): Sub => ({
  id: `s${n++}`,
  groupId,
  isSelf,
  responses: vals.map((v, i) => ({ questionId: `q${i + 1}`, value: v })),
  comments,
});

describe("computeReport", () => {
  it("returns no scores or comments while below the anonymity threshold", () => {
    const r = computeReport(makeInput([sub("self", [5, 5, 5, 5], [], true), sub("peers", [1, 1, 1, 1], [{ kind: "GENERAL", competencyKey: null, text: "secret" }]), sub("peers", [2, 2, 2, 2])]));
    expect(r.anonymity.available).toBe(false);
    expect(r.competencies).toEqual([]);
    expect(r.questions).toEqual([]);
    expect(r.comments.total).toBe(0);
    expect(JSON.stringify(r)).not.toContain("secret");
  });

  it("averages per rater first, then across raters, and computes the gap", () => {
    const r = computeReport(
      makeInput([
        sub("self", [5, 5, 3, 3], [], true),
        sub("peers", [3, 3, 5, 5]),
        sub("peers", [2, 4, 4, 4]),
        sub("peers", [3, null, 4, 5]), // null = don't know, excluded
      ]),
    );
    const comm = r.competencies.find((c) => c.key === "comm")!;
    // rater scores: 3, 3, 3 → mean 3
    expect(comm.others.mean).toBe(3);
    expect(comm.self).toBe(5);
    expect(comm.gap).toBe(2);
    const exec = r.competencies.find((c) => c.key === "exec")!;
    expect(exec.others.mean).toBeCloseTo((5 + 4 + 4.5) / 3, 2);
    expect(exec.gap).toBeLessThan(0);
  });

  it("identifies blind spot, hidden strength, strengths and Johari quadrants", () => {
    const r = computeReport(makeInput([sub("self", [5, 5, 2, 2], [], true), sub("peers", [3, 3, 5, 5]), sub("peers", [3, 3, 5, 4]), sub("peers", [2, 3, 4, 5])]));
    expect(r.summary.blindSpot).toBe("comm");
    expect(r.summary.hiddenStrength).toBe("exec");
    expect(r.summary.strengths[0]).toBe("exec");
    expect(r.competencies.find((c) => c.key === "comm")!.quadrant).toBe("blind_spot");
    expect(r.competencies.find((c) => c.key === "exec")!.quadrant).toBe("hidden_strength");
    expect(r.summary.narrative).toContain("3 people shared feedback");
  });

  it("builds per-question distributions and agreement", () => {
    const r = computeReport(makeInput([sub("peers", [4, 1, 3, 3]), sub("peers", [4, 5, 3, 3]), sub("peers", [4, 3, 3, 3])]));
    const q1 = r.questions.find((q) => q.id === "q1")!;
    expect(q1.distribution).toEqual([0, 0, 0, 3, 0]);
    expect(q1.agreement).toBe("high");
    expect(r.questions.find((q) => q.id === "q2")!.agreement).toBe("low");
  });

  it("suppresses a group's question cell when too few people answered it", () => {
    const subs = [
      ...[1, 2, 3].map(() => sub("peers", [4, 4, 4, 4])),
      sub("reports", [2, 2, 2, 2]),
      sub("reports", [2, 2, 2, 2]),
      sub("reports", [2, null, 2, 2]),
    ];
    const r = computeReport(makeInput(subs));
    const q2 = r.questions.find((q) => q.id === "q2")!;
    const reportsId = r.anonymity.groups.find((g) => g.label.startsWith("Direct"))!.id;
    const peersId = r.anonymity.groups.find((g) => g.label === "Peers")!.id;
    expect(q2.byGroup[reportsId].suppressed).toBe(true);
    expect(q2.byGroup[reportsId].mean).toBeNull();
    // Complementary suppression: peers is hidden too, else reports = all − peers.
    expect(q2.byGroup[peersId].suppressed).toBe(true);
    expect(q2.others.mean).not.toBeNull();
  });

  it("labels comments by reporting group, never by individual, and groups themes", () => {
    const r = computeReport(
      makeInput([
        sub("peers", [4, 4, 4, 4], [{ kind: "START", competencyKey: null, text: "Start delegating more to the team." }]),
        sub("peers", [4, 4, 4, 4], [{ kind: "STOP", competencyKey: null, text: "Stop interrupting in meetings." }]),
        sub("peers", [4, 4, 4, 4], [{ kind: "COMPETENCY", competencyKey: "comm", text: "Very clear communicator." }]),
        sub("clients", [4, 4, 4, 4], [{ kind: "GENERAL", competencyKey: null, text: "Always delivers on time." }]),
      ]),
    );
    expect(r.comments.total).toBe(4);
    const groupsSeen = new Set(r.comments.themes.flatMap((t) => t.comments.map((c) => c.group)));
    // Clients (1 rater) was merged into Peers, so no comment is labelled "Clients" alone.
    expect([...groupsSeen]).toEqual(["Peers + Clients"]);
    expect(r.comments.ssc.START[0].key).toBe("delegation");
    expect(r.comments.competency.comm).toHaveLength(1);
    expect(JSON.stringify(r)).not.toMatch(/"s\d+"/); // no submission ids leak
  });

  it("shows an opted-in manager separately", () => {
    const r = computeReport(makeInput([sub("manager", [5, 5, 5, 5]), ...[1, 2, 3].map(() => sub("peers", [3, 3, 3, 3]))], { showManagerSeparately: true }));
    const m = r.anonymity.groups.find((g) => g.exempt)!;
    expect(r.competencies[0].byGroup[m.id].mean).toBe(5);
    expect(r.competencies[0].others.mean).toBe(3.5);
  });
});
