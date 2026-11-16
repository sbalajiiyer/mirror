import { describe, expect, it } from "vitest";
import { importQuestionnaire, stripNumbering, toRaterStatement } from "@/lib/import/questionnaire-import";

describe("statement wording", () => {
  it("turns observable behaviours into {name} statements", () => {
    expect(toRaterStatement("Communicates clearly with the team").text).toBe("{name} communicates clearly with the team");
    expect(toRaterStatement("3. Gives credit to others").text).toBe("{name} gives credit to others");
    expect(toRaterStatement("She asks for feedback").text).toBe("{name} asks for feedback");
    expect(toRaterStatement("{name} listens well").text).toBe("{name} listens well");
    expect(toRaterStatement("How well does this person delegate?")).toEqual({ text: "How well does this person delegate?", converted: false });
    expect(toRaterStatement("Is approachable").converted).toBe(false);
  });
  it("strips list numbering", () => {
    expect(stripNumbering("Q12: Plans ahead")).toBe("Plans ahead");
    expect(stripNumbering("b) Plans ahead")).toBe("Plans ahead");
  });
});

describe("importing a questionnaire", () => {
  it("reads the Mirror template layout, filling blank sections and keeping custom self wording", () => {
    const r = importQuestionnaire(
      [
        ["Section", "Statement", "Self-assessment wording (optional)", "Section description (optional)"],
        ["Communication", "Explains decisions clearly", "", "How you share information"],
        ["", "Listens before responding", "I listen before I respond"],
        ["", "Keeps people informed"],
        ["Delivery", "Meets deadlines"],
        ["", "Flags risks early"],
      ],
      "PM 360.xlsx",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout).toBe("template");
    expect(r.draft.name).toBe("PM 360");
    expect(r.draft.competencies.map((c) => [c.name, c.questions.length])).toEqual([["Communication", 3], ["Delivery", 2]]);
    expect(r.draft.competencies[0].description).toBe("How you share information");
    expect(r.draft.competencies[0].questions[1]).toEqual({ text: "{name} listens before responding", selfText: "I listen before I respond", selfEdited: true });
    expect(r.draft.competencies[0].questions[0].selfText).toBe("I explain decisions clearly");
    expect(r.warnings).toEqual([]);
  });

  it("reads a Google Forms responses export: questions from headers, grid items as sections, answers ignored", () => {
    const r = importQuestionnaire(
      [
        ["Timestamp", "Email Address", "Rate Priya on: [Communicates clearly]", "Rate Priya on: [Shares credit]", "Rate Priya on: [Plans ahead]", "What should Priya start doing?", "Overall, how effective is Priya as a leader?"],
        ["2026/10/01 10:00", "a@x.com", "4", "5", "3", "More 1:1s", "4"],
      ],
      "Leadership feedback (Responses).csv",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout).toBe("form_export");
    expect(r.draft.name).toBe("Leadership feedback");
    expect(r.draft.competencies[0].name).toBe("Rate Priya on:");
    expect(r.draft.competencies[0].questions.map((q) => q.text)).toEqual(["{name} communicates clearly", "{name} shares credit", "{name} plans ahead"]);
    expect(r.statements).toBe(5);
    expect(r.warnings.join(" ")).toMatch(/answers were ignored/);
    expect(r.warnings.join(" ")).toMatch(/questions/);
    expect(JSON.stringify(r.draft)).not.toContain("More 1:1s");
  });

  it("reads a Microsoft Forms export (ID, Start time … columns)", () => {
    const r = importQuestionnaire([["ID", "Start time", "Completion time", "Email", "Name", "Takes ownership of mistakes", "Supports teammates", "Communicates priorities", "Gives useful feedback", "Stays calm under pressure"]], "form.xlsx");
    expect(r.ok && r.draft.competencies[0].questions.length).toBe(5);
  });

  it("reads two unlabelled columns and a plain list, splitting long sections", () => {
    const two = importQuestionnaire([["Teamwork", "Helps others"], ["", "Shares knowledge"], ["Focus", "Prioritises well"], ["", "Finishes what they start"], ["", "Avoids distractions"]]);
    expect(two.ok && two.layout).toBe("two_columns");
    const list = importQuestionnaire(Array.from({ length: 12 }, (_, i) => [`Does useful thing number ${i + 1}`]));
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.layout).toBe("list");
    expect(list.draft.competencies.map((c) => [c.name, c.questions.length])).toEqual([["General (1)", 8], ["General (2)", 4]]);
    expect(list.warnings.join(" ")).toMatch(/split into 2 sections/);
  });

  it("enforces limits and explains when there's too little to import", () => {
    const many = importQuestionnaire([["Section", "Statement"], ...Array.from({ length: 90 }, (_, i) => [`S${Math.floor(i / 6)}`, `Behaviour number ${i + 1} happens`])]);
    expect(many.ok).toBe(true);
    if (!many.ok) return;
    expect(many.draft.competencies.length).toBeLessThanOrEqual(10);
    expect(many.statements).toBeLessThanOrEqual(60);
    const few = importQuestionnaire([["Section", "Statement"], ["A", "Listens well"], ["A", "Listens well"], ["A", "ok"]]);
    expect(few).toEqual({ ok: false, error: expect.stringMatching(/Found 1 usable statement; .* at least 5/) });
    expect(importQuestionnaire([])).toEqual({ ok: false, error: "The file is empty." });
  });
});
