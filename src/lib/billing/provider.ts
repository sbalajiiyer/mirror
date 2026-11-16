import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appUrl } from "@/lib/url";

/**
 * Payment providers (Phase 9). Owner decision 2026-11-16: payments are stubbed until a Stripe account
 * exists. The stub shows a clearly labelled test checkout inside Mirror; no money moves.
 * Set PAYMENTS_PROVIDER=stripe with STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to switch.
 */
export type CheckoutRequest = { paymentId: string; label: string; amountCents: number; currency: string; email?: string | null };
export interface PaymentProvider {
  readonly name: "stub" | "stripe";
  /** Returns the URL to send the buyer to. */
  createCheckout(req: CheckoutRequest): Promise<{ url: string; providerRef?: string }>;
}

export const stubProvider: PaymentProvider = {
  name: "stub",
  async createCheckout(req) {
    return { url: appUrl(`/billing/checkout/${req.paymentId}`) };
  },
};

/** Stripe Checkout via its REST API (no SDK). Not exercised until a key is configured. */
export const stripeProvider: PaymentProvider = {
  name: "stripe",
  async createCheckout(req) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    const body = new URLSearchParams({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": req.currency,
      "line_items[0][price_data][unit_amount]": String(req.amountCents),
      "line_items[0][price_data][product_data][name]": req.label,
      client_reference_id: req.paymentId,
      success_url: appUrl(`/billing?paid=${req.paymentId}`),
      cancel_url: appUrl(`/billing?canceled=${req.paymentId}`),
      ...(req.email ? { customer_email: req.email } : {}),
    });
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" }, body });
    if (!res.ok) throw new Error(`Stripe error ${res.status}`);
    const s = (await res.json()) as { id: string; url: string };
    return { url: s.url, providerRef: s.id };
  },
};

export function paymentProvider(): PaymentProvider {
  return process.env.PAYMENTS_PROVIDER === "stripe" ? stripeProvider : stubProvider;
}

/** Verify a Stripe-Signature header (t=…,v1=…) over the raw body; 5-minute tolerance. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, now = Date.now()) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300 || !parts.v1) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
