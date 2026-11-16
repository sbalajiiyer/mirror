/** Postgres-backed rate limiter. */
import { describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.TEST_DATABASE_URL;
vi.spyOn(console, "error").mockImplementation(() => {});

describe.skipIf(!hasDb)("rate limits (integration)", async () => {
  const { db } = await import("@/lib/db");
  const rl = await import("@/lib/rate-limit");
  const id = () => `test-${Date.now()}-${Math.random()}`;

  it("allows up to the limit within a window, then blocks", async () => {
    const ip = id();
    const { limit } = rl.LIMITS.raterInvalidIp;
    for (let i = 1; i <= limit; i++) expect((await rl.hit("raterInvalidIp", ip)).ok).toBe(true);
    const over = await rl.hit("raterInvalidIp", ip);
    expect(over.ok).toBe(false);
    expect(over.count).toBe(limit + 1);
    expect(over.retryAfterSec).toBeGreaterThan(0);
    expect((await rl.peek("raterInvalidIp", ip)).ok).toBe(false);
  });

  it("starts a fresh count in the next window", async () => {
    const ip = id();
    const t0 = Date.now();
    const next = t0 + rl.LIMITS.magicLinkEmail.windowSec * 1000;
    for (let i = 0; i < 6; i++) await rl.hit("magicLinkEmail", ip, t0);
    expect((await rl.hit("magicLinkEmail", ip, t0)).ok).toBe(false);
    expect((await rl.hit("magicLinkEmail", ip, next)).count).toBe(1);
  });

  it("keeps scopes and identifiers apart, and never stores raw identifiers", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200)}`;
    await rl.hit("raterViewIp", ip);
    await rl.hit("raterWriteIp", ip);
    expect((await rl.peek("raterViewIp", ip)).count).toBe(1);
    expect((await rl.peek("raterViewIp", ip + "0")).count).toBe(0);
    const rows = await db.rateLimit.findMany({ where: { key: { in: [rl.limitKey("raterViewIp", ip), rl.limitKey("raterWriteIp", ip)] } } });
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.key).not.toContain(ip);
  });

  it("enforce throws a friendly error once any limit is exceeded", async () => {
    const token = id();
    const { limit } = rl.LIMITS.deidentifyToken;
    for (let i = 0; i < limit; i++) await rl.enforce(["deidentifyToken", token]);
    await expect(rl.enforce(["deidentifyToken", token])).rejects.toThrow(rl.RATE_LIMIT_MESSAGE);
  });

  it("can be disabled, and prunes old rows", async () => {
    process.env.RATE_LIMIT_DISABLED = "true";
    expect((await rl.hit("raterInvalidIp", "x")).count).toBe(0);
    delete process.env.RATE_LIMIT_DISABLED;
    await db.rateLimit.create({ data: { key: `old-${id()}`, windowStart: new Date(Date.now() - 3 * 86400000), count: 3 } });
    expect(await rl.pruneRateLimits()).toBeGreaterThanOrEqual(1);
  });
});
