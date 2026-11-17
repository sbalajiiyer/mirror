/**
 * Subscriptions and product labels. Isomorphic.
 *
 * Credits (2026-11): personal users, coaches and companies pay with credits ($1 = 1 credit), bought
 * in any amount. What things cost in credits is the pricing policy in the database (/admin/pricing),
 * not this file. Only subscriptions (coach plans, the company plan) still have prices here. Products
 * marked `retired` are no longer sold; they stay so old payments keep their names.
 */

export type PlanKey = "FREE" | "PRO" | "COACH_FREE" | "COACH_STARTER" | "COACH_PRO";

export const COACH_CLIENT_LIMIT: Record<"COACH_FREE" | "COACH_STARTER" | "COACH_PRO", number> = { COACH_FREE: 3, COACH_STARTER: 10, COACH_PRO: 40 };
export const REFERRAL_FEE_RATE = 0.1; // of one session price, billed to the coach
export const REFERRAL_FEE_MIN_CENTS = 1500;

export const PLANS: Record<PlanKey, { label: string; summary: string; features: string[] }> = {
  FREE: { label: "Pay as you go", summary: "Your first 360 is free; then pay with credits", features: ["First 360 free", "Unlimited raters and PDF export on every survey", "AI coach: 30 messages a day on the free model", "Premium AI models charged per use"] },
  PRO: { label: "Pro (earlier plan)", summary: "Surveys included until the plan ends", features: ["Surveys included until the plan ends", "AI coach: 100 messages a day"] },
  COACH_FREE: { label: "Coach Free", summary: "Up to 3 active clients", features: ["Up to 3 active clients", "Session prep and analytics"] },
  COACH_STARTER: { label: "Coach Starter", summary: "Up to 10 active clients", features: ["Up to 10 active clients", "White-label branding", "Marketplace listing"] },
  COACH_PRO: { label: "Coach Pro", summary: "Up to 40 active clients", features: ["Up to 40 active clients", "White-label branding", "Marketplace listing", "Priority in the marketplace"] },
};

export type ProductKey = "credits" | "full_360" | "pro_yearly" | "ai_credits_5" | "coach_starter_month" | "coach_pro_month" | "coach_report_credits_5" | "org_seats_25" | "org_seats_100" | "company_platform_month";

export const PRODUCTS: Record<ProductKey, { label: string; description: string; amountCents: number; kind: "one_off" | "subscription"; plan?: PlanKey; days?: number; retired?: boolean }> = {
  credits: { label: "Credits", description: "Any number of credits; $1 = 1 credit plus card and processing fees", amountCents: 0, kind: "one_off" },
  full_360: { label: "Full 360", description: "Unlimited raters and PDF export for one 360", amountCents: 4900, kind: "one_off", retired: true },
  pro_yearly: { label: "Pro (1 year)", description: PLANS.PRO.features.join(" · "), amountCents: 9900, kind: "subscription", plan: "PRO", days: 365, retired: true },
  ai_credits_5: { label: "5 AI credits", description: "AI questionnaires or premium AI conversations", amountCents: 1999, kind: "one_off", retired: true },
  coach_starter_month: { label: "Coach Starter (1 month)", description: PLANS.COACH_STARTER.features.join(" · "), amountCents: 2900, kind: "subscription", plan: "COACH_STARTER", days: 30 },
  coach_pro_month: { label: "Coach Pro (1 month)", description: PLANS.COACH_PRO.features.join(" · "), amountCents: 7900, kind: "subscription", plan: "COACH_PRO", days: 30 },
  coach_report_credits_5: { label: "5 client report credits", description: "Gift a full 360 to a client (wholesale, $35 each)", amountCents: 17500, kind: "one_off", retired: true },
  org_seats_25: { label: "Cohort package: 25 seats", description: "25 participant seats for 360 rounds ($11.96 each)", amountCents: 29900, kind: "one_off", retired: true },
  org_seats_100: { label: "100 participant seats", description: "100 seats for 360 rounds ($10 each)", amountCents: 100000, kind: "one_off", retired: true },
  // Phase 11e: placeholder price, change freely before real payments.
  company_platform_month: { label: "Company plan (1 month)", description: "Company workspace: rounds, analytics, roles, SSO, audit log. Rounds are paid with credits.", amountCents: 4900, kind: "subscription", days: 30 },
};

export const formatCents = (c: number, currency = "usd") => new Intl.NumberFormat("en", { style: "currency", currency }).format(c / 100);

export function referralFeeCents(sessionPriceCents: number | null | undefined) {
  return Math.max(REFERRAL_FEE_MIN_CENTS, Math.round((sessionPriceCents ?? 0) * REFERRAL_FEE_RATE));
}
