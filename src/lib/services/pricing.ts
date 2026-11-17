import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import {
  bestDiscount,
  DEFAULT_POLICY,
  DISCOUNT_SCOPES,
  type Policy,
} from "@/lib/billing/pricing";

/**
 * The pricing policy and discounts, stored in the database and edited by platform admins at
 * /admin/pricing. Every change is written to the audit log with the values before and after.
 */
const POLICY_KEYS = Object.keys(DEFAULT_POLICY) as (keyof Policy)[];

export async function getPolicy(): Promise<
  Policy & { updatedAt: Date | null }
> {
  const row = await db.pricingPolicy.findUnique({ where: { id: "default" } });
  if (!row) return { ...DEFAULT_POLICY, updatedAt: null };
  return {
    ...(Object.fromEntries(POLICY_KEYS.map((k) => [k, row[k]])) as Policy),
    updatedAt: row.updatedAt,
  };
}

const cc = (max: number) => z.number().int().min(0).max(max);
export const policySchema = z
  .object({
    survey360: cc(10_000_00),
    followUp: cc(10_000_00),
    pulse: cc(10_000_00),
    coachGift: cc(10_000_00),
    companyParticipant: cc(10_000_00),
    companyWelcomeCredits: cc(100_000_00),
    freeSurveys: z.number().int().min(0).max(10),
    premiumMarkupPct: z
      .number()
      .int()
      .min(100, "Premium AI can't be priced below cost")
      .max(1000),
    cardFeeBps: z.number().int().min(0).max(2000),
    cardFeeFixedCents: z.number().int().min(0).max(1000),
    otherFeeBps: z.number().int().min(0).max(2000),
    otherFeeFixedCents: z.number().int().min(0).max(1000),
    minTopUp: z.number().int().min(1).max(100_000),
    maxTopUp: z.number().int().min(1).max(100_000),
  })
  .refine((p) => p.maxTopUp >= p.minTopUp, {
    message: "The largest top-up must be at least the smallest",
    path: ["maxTopUp"],
  });

export async function updatePolicy(adminId: string, raw: unknown) {
  const input = policySchema.parse(raw);
  const before = await getPolicy();
  await db.pricingPolicy.upsert({
    where: { id: "default" },
    create: { id: "default", ...input, updatedById: adminId },
    update: { ...input, updatedById: adminId },
  });
  const changed = Object.fromEntries(
    POLICY_KEYS.filter((k) => before[k] !== input[k]).map((k) => [
      k,
      { from: before[k], to: input[k] },
    ]),
  );
  await audit(adminId, "pricing.update", "PricingPolicy", "default", changed);
  return changed;
}

// ------------------------------------------------------------------ discounts

const discountRows = (where: { orgId?: string; userId?: string }) =>
  db.priceDiscount.findMany({ where: { ...where, revokedAt: null } });

/** Percent off for a person's own charges. */
export async function userDiscount(
  userId: string,
  scope: "SURVEYS" | "AI",
  now = new Date(),
) {
  return bestDiscount(await discountRows({ userId }), scope, now);
}

/** Percent off for a company's charges. */
export async function orgDiscount(
  orgId: string,
  scope: "SURVEYS" | "AI",
  now = new Date(),
) {
  return bestDiscount(await discountRows({ orgId }), scope, now);
}

export const discountSchema = z
  .object({
    target: z.enum(["org", "user"]),
    /** Organization id, or the person's email. */
    who: z.string().trim().min(1, "Pick who gets the discount"),
    percent: z.number().int().min(1).max(100),
    scope: z.enum(DISCOUNT_SCOPES).default("ALL"),
    note: z.string().trim().max(200).optional(),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
  })
  .refine(
    (d) =>
      !d.startsAt || !d.endsAt || new Date(d.endsAt) > new Date(d.startsAt),
    { message: "The end date must be after the start date", path: ["endsAt"] },
  );

export async function createDiscount(adminId: string, raw: unknown) {
  const d = discountSchema.parse(raw);
  let orgId: string | null = null;
  let userId: string | null = null;
  if (d.target === "org") {
    const org = await db.organization.findUnique({
      where: { id: d.who },
      select: { id: true },
    });
    if (!org) throw new DomainError("Unknown company.");
    orgId = org.id;
  } else {
    const u = await db.user.findFirst({
      where: {
        OR: [
          { email: d.who.toLowerCase() },
          { personalEmail: d.who.toLowerCase() },
        ],
      },
      select: { id: true },
    });
    if (!u) throw new DomainError("No one with that email uses Mirror yet.");
    userId = u.id;
  }
  const row = await db.priceDiscount.create({
    data: {
      orgId,
      userId,
      percent: d.percent,
      scope: d.scope,
      note: d.note || null,
      startsAt: d.startsAt ? new Date(d.startsAt) : null,
      endsAt: d.endsAt ? new Date(d.endsAt) : null,
      createdById: adminId,
    },
  });
  await audit(
    adminId,
    "pricing.discount_create",
    "PriceDiscount",
    row.id,
    { orgId, userId, percent: d.percent, scope: d.scope },
    orgId ? { orgId } : {},
  );
  return row;
}

export async function revokeDiscount(adminId: string, id: string) {
  const r = await db.priceDiscount.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (r.count !== 1) throw new DomainError("Not found", "not_found");
  await audit(adminId, "pricing.discount_revoke", "PriceDiscount", id);
}

export async function listDiscounts() {
  const rows = await db.priceDiscount.findMany({
    where: { revokedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      org: { select: { name: true } },
      user: { select: { email: true, name: true } },
    },
  });
  return rows.map((r) => ({
    ...r,
    label: r.org ? r.org.name : (r.user?.name ?? r.user?.email ?? "Unknown"),
  }));
}
