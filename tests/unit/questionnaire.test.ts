import { describe, expect, it } from "vitest";
import { customFrameworkSchema, slugify, toFirstPerson } from "@/lib/questionnaire";

describe("toFirstPerson", () => {
  it.each([
    ["{name} communicates ideas clearly.", "I communicate ideas clearly."],
    ["{name} is calm under pressure.", "I am calm under pressure."],
    ["{name} has a clear plan.", "I have a clear plan."],
    ["{name} does what they promise.", "I do what they promise."],
    ["{name} watches their tone.", "I watch my tone."],
    ["{name} carries the team.", "I carry the team."],
    ["{name} pushes back when needed.", "I push back when needed."],
    ["{name} listens.", "I listen."],
  ])("%s → %s", (input, expected) => {
    expect(toFirstPerson(input)).toBe(expected);
  });
  it("falls back to simple substitution when {name} isn't first", () => {
    expect(toFirstPerson("Meetings run by {name} start on time.")).toBe("Meetings run by me start on time.");
    expect(toFirstPerson("People trust {name}'s judgement.")).toBe("People trust my judgement.");
  });
});

describe("custom questionnaire validation", () => {
  const section = (name: string, n: number) => ({ name, description: "", questions: Array.from({ length: n }, (_, i) => ({ text: `{name} does thing ${i}`, selfText: `I do thing ${i}` })) });
  it("accepts a reasonable questionnaire", () => {
    expect(customFrameworkSchema.safeParse({ name: "My 360", competencies: [section("Delivery", 3), section("Teamwork", 2)] }).success).toBe(true);
  });
  it("requires at least 5 statements in total", () => {
    const r = customFrameworkSchema.safeParse({ name: "My 360", competencies: [section("Delivery", 4)] });
    expect(r.success).toBe(false);
  });
  it("rejects duplicate section names and oversize sections", () => {
    expect(customFrameworkSchema.safeParse({ name: "My 360", competencies: [section("A b", 3), section("a B", 3)] }).success).toBe(false);
    expect(customFrameworkSchema.safeParse({ name: "My 360", competencies: [section("A", 9)] }).success).toBe(false);
  });
  it("slugifies section names into keys", () => {
    expect(slugify("Stakeholder Management & Influence")).toBe("stakeholder_management_influence");
    expect(slugify("!!!")).toBe("section");
  });
});
