import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PRODUCTS, formatCents, referralFeeCents } from "@/lib/billing/catalog";
import { verifyStripeSignature } from "@/lib/billing/provider";

describe("billing catalog", () => {
  it("prices products in cents and formats them", () => {
    expect(PRODUCTS.full_360.amountCents).toBe(4900);
    expect(PRODUCTS.pro_yearly).toMatchObject({ kind: "subscription", plan: "PRO", days: 365 });
    expect(formatCents(1999)).toBe("$19.99");
  });
  it("charges 10% of one session as the referral fee, at least $15", () => {
    expect(referralFeeCents(null)).toBe(1500);
    expect(referralFeeCents(10000)).toBe(1500);
    expect(referralFeeCents(30000)).toBe(3000);
  });
});

describe("Stripe webhook signature", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ type: "checkout.session.completed" });
  const now = 1_800_000_000_000;
  const sign = (t: number, b = body) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${b}`).digest("hex")}`;
  it("accepts a fresh, correct signature", () => {
    expect(verifyStripeSignature(body, sign(now / 1000), secret, now)).toBe(true);
  });
  it("rejects tampering, wrong secrets, stale timestamps and missing headers", () => {
    expect(verifyStripeSignature(body + " ", sign(now / 1000), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(now / 1000), "other", now)).toBe(false);
    expect(verifyStripeSignature(body, sign(now / 1000 - 301), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, null, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, "t=abc", secret, now)).toBe(false);
  });
});
