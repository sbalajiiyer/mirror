/**
 * Credits arithmetic. Pure and isomorphic so the billing pages show exactly what the server charges.
 *
 * $1 = 1 credit. Every amount is an integer in hundredths of a credit ("cc"): 4900 = 49 credits,
 * 3 = 0.03 credits. Prices come from the PricingPolicy row (edited at /admin/pricing), never from code.
 */
export type Policy = {
  survey360: number;
  followUp: number;
  pulse: number;
  coachGift: number;
  companyParticipant: number;
  companyWelcomeCredits: number;
  freeSurveys: number;
  premiumMarkupPct: number;
  cardFeeBps: number;
  cardFeeFixedCents: number;
  otherFeeBps: number;
  otherFeeFixedCents: number;
  minTopUp: number;
  maxTopUp: number;
};

/** Starting values, used for a new database and as the form's reset values. */
export const DEFAULT_POLICY: Policy = {
  survey360: 4900,
  followUp: 4900,
  pulse: 900,
  coachGift: 3500,
  companyParticipant: 1200,
  companyWelcomeCredits: 12000,
  freeSurveys: 1,
  premiumMarkupPct: 200,
  cardFeeBps: 290,
  cardFeeFixedCents: 30,
  otherFeeBps: 0,
  otherFeeFixedCents: 0,
  minTopUp: 1,
  maxTopUp: 10000,
};

export const DISCOUNT_SCOPES = ["ALL", "SURVEYS", "AI"] as const;
export type DiscountScope = (typeof DISCOUNT_SCOPES)[number];
export const SCOPE_LABEL: Record<DiscountScope, string> = {
  ALL: "Everything",
  SURVEYS: "Surveys only",
  AI: "Premium AI only",
};

export type DiscountRow = {
  percent: number;
  scope: string;
  startsAt: Date | null;
  endsAt: Date | null;
  revokedAt: Date | null;
};

export function isActive(d: DiscountRow, now: Date) {
  return (
    !d.revokedAt &&
    (!d.startsAt || d.startsAt <= now) &&
    (!d.endsAt || d.endsAt > now)
  );
}

/** The best active discount for this kind of charge (they don't stack). */
export function bestDiscount(
  rows: DiscountRow[],
  scope: Exclude<DiscountScope, "ALL">,
  now: Date,
): number {
  return rows
    .filter((d) => isActive(d, now) && (d.scope === "ALL" || d.scope === scope))
    .reduce((m, d) => Math.max(m, Math.min(100, Math.max(0, d.percent))), 0);
}

export const discounted = (cc: number, percent: number) =>
  Math.round((cc * (100 - percent)) / 100);

/**
 * Price of a top-up of `credits` whole credits, in US cents. The buyer pays the fees, so the total
 * is grossed up until, after the percentage fee and fixed fee are taken, the credits are covered.
 */
export function topUpPrice(
  credits: number,
  p: Pick<
    Policy,
    "cardFeeBps" | "cardFeeFixedCents" | "otherFeeBps" | "otherFeeFixedCents"
  >,
) {
  const base = credits * 100;
  const bps = p.cardFeeBps + p.otherFeeBps;
  const fixed = p.cardFeeFixedCents + p.otherFeeFixedCents;
  const total = base === 0 ? 0 : Math.ceil((base + fixed) / (1 - bps / 10000));
  return { creditsCents: base, feeCents: total - base, totalCents: total };
}

/** Premium AI price for one request: provider cost (micro-dollars) times the markup, less any discount. */
export function premiumCharge(
  costMicros: number,
  markupPct: number,
  discountPercent = 0,
) {
  if (costMicros <= 0) return 0;
  const cc = (costMicros * markupPct) / 100 / 10_000; // 10,000 micro-dollars = 1 cent = 0.01 credit
  return Math.max(1, Math.ceil((cc * (100 - discountPercent)) / 100));
}

/** 4900 → "49", 1250 → "12.50", 3 → "0.03". */
export function formatCredits(cc: number) {
  const whole = cc % 100 === 0;
  return (cc / 100).toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export const creditsLabel = (cc: number) =>
  `${formatCredits(cc)} credit${cc === 100 ? "" : "s"}`;

/** Parse "12.5" (credits) into hundredths; null if not a non-negative number with at most 2 decimals. */
export function parseCredits(s: string): number | null {
  const t = s.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
