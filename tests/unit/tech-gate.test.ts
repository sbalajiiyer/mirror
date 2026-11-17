import { describe, expect, it } from "vitest";
import { checkTechPassword, hashTechPassword, techPass, validTechPass } from "@/lib/tech-gate";

describe("tech page gate", () => {
  it("accepts only the right password against a scrypt hash", () => {
    const h = hashTechPassword("Correct horse 1$");
    expect(h).toMatch(/^scrypt\$[\w-]+\$[\w-]+$/);
    expect(h).not.toContain("Correct horse");
    expect(checkTechPassword("Correct horse 1$", h)).toBe(true);
    expect(checkTechPassword("correct horse 1$", h)).toBe(false);
    expect(checkTechPassword("", h)).toBe(false);
    expect(checkTechPassword("anything", "")).toBe(false); // not configured → locked
    expect(checkTechPassword("anything", "plain-text")).toBe(false);
  });

  it("issues a signed pass that can't be forged", () => {
    expect(validTechPass(techPass())).toBe(true);
    expect(validTechPass("tech-page")).toBe(false);
    expect(validTechPass(undefined)).toBe(false);
  });
});
