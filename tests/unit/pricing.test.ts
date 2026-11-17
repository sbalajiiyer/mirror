import { describe, expect, it } from "vitest";
import { bestDiscount, creditsLabel, DEFAULT_POLICY, discounted, formatCredits, parseCredits, premiumCharge, topUpPrice } from "@/lib/billing/pricing";

describe("credits arithmetic", () => {
  it("grosses up a top-up so the buyer pays the card fee", () => {
    const p = topUpPrice(50, DEFAULT_POLICY); // 2.9% + 30¢
    expect(p.creditsCents).toBe(5000);
    expect(p.totalCents).toBe(Math.ceil(5030 / 0.971));
    // After the provider takes its fee, at least the credits' value is left.
    expect(p.totalCents - Math.round(p.totalCents * 0.029) - 30).toBeGreaterThanOrEqual(5000);
    expect(p.feeCents).toBe(p.totalCents - 5000);
  });

  it("adds other costs on top of card fees, and nothing when fees are zero", () => {
    const withOther = topUpPrice(100, { ...DEFAULT_POLICY, otherFeeBps: 100, otherFeeFixedCents: 20 });
    expect(withOther.totalCents).toBe(Math.ceil(10050 / (1 - 0.039)));
    expect(topUpPrice(7, { cardFeeBps: 0, cardFeeFixedCents: 0, otherFeeBps: 0, otherFeeFixedCents: 0 })).toEqual({ creditsCents: 700, feeCents: 0, totalCents: 700 });
  });

  it("picks the best active discount for the scope; they don't stack", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    const rows = [
      { percent: 10, scope: "ALL", startsAt: null, endsAt: null, revokedAt: null },
      { percent: 30, scope: "AI", startsAt: null, endsAt: null, revokedAt: null },
      { percent: 50, scope: "SURVEYS", startsAt: null, endsAt: new Date("2026-11-01"), revokedAt: null }, // ended
      { percent: 60, scope: "SURVEYS", startsAt: new Date("2026-12-01"), endsAt: null, revokedAt: null }, // not started
      { percent: 70, scope: "ALL", startsAt: null, endsAt: null, revokedAt: new Date("2026-11-02") }, // removed
    ];
    expect(bestDiscount(rows, "SURVEYS", now)).toBe(10);
    expect(bestDiscount(rows, "AI", now)).toBe(30);
    expect(bestDiscount([], "AI", now)).toBe(0);
    expect(discounted(4900, 25)).toBe(3675);
    expect(discounted(4900, 100)).toBe(0);
  });

  it("charges premium AI at cost x markup, at least 0.01 for any paid request", () => {
    expect(premiumCharge(0, 200)).toBe(0);
    expect(premiumCharge(100, 200)).toBe(1); // tiny requests round up to 0.01 credit
    expect(premiumCharge(50_000, 200)).toBe(10); // 5¢ cost → 10¢ = 0.10 credit
    expect(premiumCharge(50_000, 200, 50)).toBe(5);
    expect(premiumCharge(50_000, 100)).toBe(5);
  });

  it("formats and parses credits in hundredths", () => {
    expect(formatCredits(4900)).toBe("49");
    expect(formatCredits(1250)).toBe("12.50");
    expect(formatCredits(3)).toBe("0.03");
    expect(formatCredits(1_234_500)).toBe("12,345");
    expect(creditsLabel(100)).toBe("1 credit");
    expect(creditsLabel(4900)).toBe("49 credits");
    expect(parseCredits("12.5")).toBe(1250);
    expect(parseCredits("49")).toBe(4900);
    expect(parseCredits("-1")).toBeNull();
    expect(parseCredits("1.234")).toBeNull();
  });
});
