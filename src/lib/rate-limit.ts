import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";

/**
 * Fixed-window rate limits for public endpoints, counted in Postgres (no extra service).
 *
 * Privacy: keys are HMAC(scope + identifier), so raw IPs, tokens and emails are never stored.
 * Per-IP and per-token counters are separate rows with no shared field, so they can't be joined
 * to tie a rater's link to a network address. Rows older than a day are deleted by the cron job.
 *
 * Fails open: if the database call errors, the request is allowed (and logged).
 */
export const LIMITS = {
  /** Rater pages viewed from one network. */
  raterViewIp: { limit: 120, windowSec: 600 },
  /** Unrecognised rater links tried from one network: the guard against guessing links. */
  raterInvalidIp: { limit: 10, windowSec: 900 },
  /** Draft saves / submits / declines from one network (a shared office may have many raters). */
  raterWriteIp: { limit: 300, windowSec: 600 },
  /** Writes on a single rater link. */
  raterWriteToken: { limit: 120, windowSec: 600 },
  /** AI de-identification previews on a single rater link (each costs an AI call). */
  deidentifyToken: { limit: 15, windowSec: 3600 },
  /** New anonymous invites created from group share links, per network. */
  groupLinkIp: { limit: 10, windowSec: 3600 },
  /** New invites created from one group share link. */
  groupLinkToken: { limit: 200, windowSec: 86400 },
  /** Magic-link emails to one address. */
  magicLinkEmail: { limit: 5, windowSec: 3600 },
  /** Magic-link requests from one network. */
  magicLinkIp: { limit: 20, windowSec: 3600 },
  /** Public share-link views from one network (Phase 7). */
  shareViewIp: { limit: 120, windowSec: 600 },
  /** Demo sign-ins from one network. */
  demoLoginIp: { limit: 60, windowSec: 600 },
} as const satisfies Record<string, { limit: number; windowSec: number }>;

export type LimitName = keyof typeof LIMITS;
export type LimitResult = { ok: boolean; count: number; limit: number; retryAfterSec: number };

export const RATE_LIMIT_MESSAGE = "Too many requests. Please wait a few minutes and try again.";

function secret() {
  return process.env.AUTH_SECRET ?? "dev-rate-limit";
}

export function limitKey(name: LimitName, id: string) {
  return `${name}:${createHmac("sha256", secret()).update(`ratelimit:${name}:${id}`).digest("base64url").slice(0, 32)}`;
}

function disabled() {
  return process.env.RATE_LIMIT_DISABLED === "true";
}

function windowFor(name: LimitName, now: number) {
  const ms = LIMITS[name].windowSec * 1000;
  const start = Math.floor(now / ms) * ms;
  return { start: new Date(start), retryAfterSec: Math.max(1, Math.ceil((start + ms - now) / 1000)) };
}

/** Count one request and report whether it is within the limit. */
export async function hit(name: LimitName, id: string, now = Date.now()): Promise<LimitResult> {
  const { limit } = LIMITS[name];
  const { start, retryAfterSec } = windowFor(name, now);
  if (disabled()) return { ok: true, count: 0, limit, retryAfterSec };
  try {
    const rows = await db.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${limitKey(name, id)}, ${start}, 1)
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."windowStart" = EXCLUDED."windowStart" THEN "RateLimit"."count" + 1 ELSE 1 END,
        "windowStart" = EXCLUDED."windowStart"
      RETURNING "count"`;
    const count = Number(rows[0]?.count ?? 1);
    return { ok: count <= limit, count, limit, retryAfterSec };
  } catch (e) {
    console.error("rate-limit: failing open", e);
    return { ok: true, count: 0, limit, retryAfterSec };
  }
}

/** Read the current count without adding to it. */
export async function peek(name: LimitName, id: string, now = Date.now()): Promise<LimitResult> {
  const { limit } = LIMITS[name];
  const { start, retryAfterSec } = windowFor(name, now);
  if (disabled()) return { ok: true, count: 0, limit, retryAfterSec };
  try {
    const row = await db.rateLimit.findUnique({ where: { key: limitKey(name, id) } });
    const count = row && row.windowStart.getTime() === start.getTime() ? row.count : 0;
    return { ok: count < limit, count, limit, retryAfterSec };
  } catch (e) {
    console.error("rate-limit: failing open", e);
    return { ok: true, count: 0, limit, retryAfterSec };
  }
}

/** Throw a user-facing error when any of the given limits is exceeded (all are counted). */
export async function enforce(...checks: [LimitName, string][]) {
  const results = await Promise.all(checks.map(([n, id]) => hit(n, id)));
  if (results.some((r) => !r.ok)) throw new DomainError(RATE_LIMIT_MESSAGE, "rate_limited");
}

/** Client IP as seen by the platform. On Vercel the first X-Forwarded-For entry is set by the edge. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export function ipFromRequest(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Housekeeping for the daily cron. */
export async function pruneRateLimits(olderThanHours = 25) {
  const { count } = await db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - olderThanHours * 3600000) } } });
  return count;
}
