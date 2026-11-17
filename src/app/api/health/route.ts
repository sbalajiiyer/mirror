import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hit, ipFromRequest } from "@/lib/rate-limit";
import { resolveModel } from "@/lib/ai/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check for uptime monitors: GET /api/health → 200 when the app and database are up.
 * ?check=pdf also starts Chromium and prints a test page (rate-limited; no user data involved).
 */
export async function GET(req: Request) {
  const started = Date.now();
  const checks: Record<string, unknown> = {};
  let ok = true;
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = { ok: true, ms: Date.now() - started };
  } catch {
    ok = false;
    checks.database = { ok: false };
  }
  const ai = resolveModel("free");
  checks.ai = { provider: ai.provider, available: ai.available };
  checks.email = { provider: process.env.EMAIL_PROVIDER ?? "console", deliversToRealInboxes: !!process.env.EMAIL_PROVIDER && process.env.EMAIL_PROVIDER !== "console" };
  checks.payments = { provider: process.env.PAYMENTS_PROVIDER ?? "stub" };
  if (new URL(req.url).searchParams.get("check") === "pdf") {
    if (!(await hit("healthDeepIp", ipFromRequest(req))).ok) checks.pdf = { ok: null, skipped: "rate limited" };
    else {
      try {
        const { pdfSelfTest } = await import("@/lib/pdf");
        checks.pdf = { ok: true, ...(await pdfSelfTest()) };
      } catch (e) {
        ok = false;
        checks.pdf = { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "failed" };
        const { recordError } = await import("@/lib/monitoring");
        await recordError(e, { route: "GET /api/health?check=pdf", kind: "job" });
      }
    }
  }
  return NextResponse.json(
    { ok, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev", time: new Date().toISOString(), checks },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
