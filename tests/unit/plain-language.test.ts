import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
const captured: { schema?: { safeParse: (v: unknown) => { success: boolean } }; system?: string } = {};
vi.mock("@/lib/ai/client", () => ({
  runAI: async (o: { schema: typeof captured.schema; request: { system: string } }) => {
    captured.schema = o.schema;
    captured.system = o.request.system;
    return { ok: false, error: "test", fallback: null };
  },
}));
import { computeReport, type ReportInput } from "@/lib/report/compute";
import { plainLanguageRules } from "@/lib/ai/prompts";
import { groupComments } from "@/lib/text/themes";
import { generateAISummary, quotesAComment, reportDigest } from "@/lib/ai/features/summary";

type Sub = ReportInput["submissions"][number];
let n = 0;
const sub = (groupId: string, vals: number[], text?: string, isSelf = false): Sub => ({
  id: `s${n++}`,
  groupId,
  isSelf,
  responses: vals.map((v, i) => ({ questionId: `q${i + 1}`, value: v })),
  comments: text ? [{ kind: "GENERAL", competencyKey: null, text }] : [],
});
const input = (subs: Sub[]): ReportInput => ({
  assessment: { id: "a1", title: "T", goal: "promotion", scaleMax: 5, minRatersPerGroup: 3, showManagerSeparately: true, subjectFirstName: "Alex" },
  groups: [
    { id: "self", kind: "SELF", name: "Self", order: 0 },
    { id: "manager", kind: "MANAGER", name: "Manager", order: 1 },
    { id: "peers", kind: "PEER", name: "Peers", order: 2 },
  ],
  questions: [
    { id: "q1", competencyKey: "comm", competency: "Communication", text: "Q1", order: 0, type: "RATING" },
    { id: "q2", competencyKey: "exec", competency: "Execution", text: "Q2", order: 1, type: "RATING" },
  ],
  submissions: subs,
});

describe("plain-language rules", () => {
  it("states the ASD-STE100 limits for each use", () => {
    const q = plainLanguageRules("questionnaire");
    expect(q).toMatch(/at most 15 words/);
    expect(q).toMatch(/warm and conversational/);
    expect(q).toMatch(/observable behaviours/);
    const s = plainLanguageRules("summary");
    expect(s).toMatch(/at most 20 words/);
    expect(s).toMatch(/paraphrase/);
    expect(s).toMatch(/at least 2 raters/);
  });
});

describe("theme rater counts", () => {
  it("counts distinct raters, not comments", () => {
    const [t] = groupComments([
      { text: "Clear communication", group: "Peers", sid: "a" },
      { text: "Explains things clearly", group: "Peers", sid: "a" },
    ]);
    expect(t.count).toBe(2);
    expect(t.raters).toBe(1);
  });
});

describe("summary digest anonymity", () => {
  const report = computeReport(
    input([
      sub("self", [4, 4], undefined, true),
      sub("manager", [3, 3], "Communication in meetings could be much clearer for the whole team"),
      sub("peers", [4, 5], "Explains decisions clearly and listens to everyone in the room"),
      sub("peers", [4, 4], "Very clear communication in every weekly update"),
      sub("peers", [5, 4], "Delivers on time, every time, without fuss"),
    ]),
  );
  const d = reportDigest(report);

  it("never has a group under 3 raters: a lone manager is pooled with others", () => {
    expect(report.anonymity.groups.every((g) => g.n >= 3 && !g.exempt)).toBe(true);
    expect(d.groups).not.toContain("Manager");
    expect(JSON.stringify(d)).not.toMatch(/\(Manager\)/);
  });

  it("only sends themes that at least 2 raters support", () => {
    expect(d.commentThemes.length).toBeGreaterThan(0);
    for (const t of d.commentThemes) expect(t.raters).toBeGreaterThanOrEqual(2);
    expect(d.commentThemes.map((t) => t.theme)).not.toContain("Delivery & follow-through");
  });
});

describe("verbatim quote check", () => {
  const comment = "Explains decisions clearly and listens to everyone in the room";
  it("flags 8 or more copied words", () => {
    expect(quotesAComment("Peers say you explains decisions clearly and listens to everyone in meetings.", [comment])).toBe(true);
  });
  it("allows a paraphrase", () => {
    expect(quotesAComment("Peers say you explain your choices well and you listen.", [comment])).toBe(false);
  });
});

describe("summary schema", () => {
  it("rejects AI output that copies a comment it was sent, and accepts a paraphrase", async () => {
    const report = computeReport(
      input([
        sub("self", [4, 4], undefined, true),
        sub("peers", [4, 5], "Explains decisions clearly and listens to everyone in the room"),
        sub("peers", [4, 4], "Very clear communication in every weekly update to the team"),
        sub("peers", [5, 4], "Clear communication in planning and in every review"),
      ]),
    );
    await generateAISummary({ report, userId: "u", modelChoice: "free", tone: "balanced" });
    expect(captured.system).toMatch(/ASD-STE100/);
    const base = { strengths: [], growth: [] };
    const sentExample = reportDigest(report).commentThemes[0].examples[0].replace(/ \([^)]*\)$/, "");
    expect(captured.schema!.safeParse({ ...base, summary: `Peers note this: ${sentExample}. That helps the team a lot.` }).success).toBe(false);
    expect(captured.schema!.safeParse({ ...base, summary: "Peers say you explain your choices well and you listen to people. This helps the team." }).success).toBe(true);
  });
});
