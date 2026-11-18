import { describe, expect, it } from "vitest";
import { ageFrom, birthYears, isOldEnough } from "@/lib/age";
import { purchaseTerms } from "@/lib/billing/catalog";

describe("neutral age screen", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  it("never overstates age: the birth month counts as not yet reached", () => {
    expect(ageFrom(2010, 10, now)).toBe(16); // October 2010: 16 by November 2026
    expect(ageFrom(2010, 11, now)).toBe(15); // November 2010: may not be 16 yet
    expect(ageFrom(2010, 12, now)).toBe(15);
    expect(isOldEnough(2010, 10, 16, now)).toBe(true);
    expect(isOldEnough(2010, 11, 16, now)).toBe(false);
  });
  it("offers 100 years including ones under the minimum, so the question gives nothing away", () => {
    const years = birthYears(now);
    expect(years[0]).toBe(2026);
    expect(years).toHaveLength(100);
  });
});

describe("purchase terms beside every buy button", () => {
  it("say plainly that plans don't renew and credits are one-time", () => {
    expect(purchaseTerms("coach_starter_month")).toBe(
      "$29.00 for 30 days, paid once. It doesn't renew automatically and you won't be charged again; buy another month before it ends to keep it. Buying early adds 30 days to the end date.",
    );
    expect(purchaseTerms("company_platform_month")).toMatch(/doesn't renew automatically/);
    expect(purchaseTerms("credits")).toMatch(/One-time payment.*Credits don't expire/);
  });
});
