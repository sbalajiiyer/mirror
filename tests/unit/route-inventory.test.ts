/**
 * Phase 11b: every page, API route and server action must check who is calling, or be listed here
 * as deliberately public with the reason. A new route without either fails this test.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../src/app");
const ROUTE_FILE = /(^|\/)(page\.tsx|route\.ts|actions\.ts|[\w-]+-actions\.ts)$/;
const GUARD =
  /requireUserId|requireOnboardedUser|adminPage|liveSessionUserId|requireSignedIn|requireOwnedAssessment|\bauth\(\)|requireWorkspaceRole|apiRoute(<[^>]*>)?\(|CRON_SECRET|isPlatformAdmin|verifySignedPayload|verifyStripeSignature/;

/** Public on purpose. Each entry says what protects it instead. */
const PUBLIC: Record<string, string> = {
  "(app)/privacy/page.tsx": "legal page",
  "(app)/terms/page.tsx": "legal page",
  "(app)/copyright/page.tsx": "legal page (DMCA agent)",
  "(app)/security/page.tsx": "public security overview",
  "(app)/dpa/page.tsx": "legal page (data processing agreement)",
  ".well-known/security.txt/route.ts": "public RFC 9116 contact file",
  "api/unsubscribe/route.ts": "signed unsubscribe token (one-click, RFC 8058)",
  "u/[token]/page.tsx": "signed unsubscribe token; the change needs a button press",
  "(app)/signin/check-email/page.tsx": "static confirmation",
  "(app)/dev/outbox/page.tsx": "404 unless DEV_TOOLS_ENABLED",
  "api/auth/[...nextauth]/route.ts": "Auth.js",
  "api/client-error/route.ts": "rate-limited error reports, scrubbed",
  "api/dev/oidc/[...path]/route.ts": "test identity provider, 404 unless DEV_TOOLS_ENABLED",
  "api/health/route.ts": "health check, no data; deep check rate-limited",
  "api/sso/callback/route.ts": "OIDC state + nonce",
  "api/sso/start/route.ts": "starts OIDC for a verified domain",
  "r/[token]/page.tsx": "rater link token",
  "r/actions.ts": "rater link token",
  "r/g/[token]/route.ts": "group link token, rate-limited",
  "s/[id]/badge.svg/route.ts": "share link id, revocable, rate-limited",
  "s/[id]/page.tsx": "share link id, revocable, rate-limited",
  "tech/actions.ts": "password gate, rate-limited",
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("route inventory", () => {
  const files = walk(ROOT)
    .map((p) => relative(ROOT, p))
    .filter((p) => ROUTE_FILE.test(p));

  it("finds the app's routes", () => {
    expect(files.length).toBeGreaterThan(60);
  });

  it("every route checks the caller or is deliberately public", () => {
    const unguarded = files.filter((f) => !GUARD.test(readFileSync(join(ROOT, f), "utf8")) && !(f in PUBLIC));
    expect(unguarded).toEqual([]);
  });

  it("the public list has no stale entries", () => {
    expect(Object.keys(PUBLIC).filter((f) => !files.includes(f))).toEqual([]);
  });
});
