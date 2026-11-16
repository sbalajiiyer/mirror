import { describe, expect, it } from "vitest";
import { normalizeEmail } from "@/lib/email-address";

describe("normalizeEmail", () => {
  it("accepts and lower-cases normal addresses", () => {
    expect(normalizeEmail("  Alex.Morgan+360@Example.COM ")).toBe("alex.morgan+360@example.com");
  });
  it("folds look-alike characters before validating, so they can't smuggle a second address", () => {
    expect(normalizeEmail("victim@example.com＠attacker.com")).toBeNull(); // full-width @ becomes a second @
    expect(normalizeEmail("ａｌｅｘ@example.com")).toBe("alex@example.com");
  });
  it("rejects non-ASCII, missing or extra @, and bad domains", () => {
    for (const bad of ["alex", "a@b", "a@@b.com", "a@b..com", "алекс@example.com", "a b@example.com", "@example.com"]) expect(normalizeEmail(bad)).toBeNull();
  });
});
