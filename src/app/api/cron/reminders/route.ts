import { NextResponse } from "next/server";
import { runPulseReminders, runReminders } from "@/lib/jobs/reminders";
import { pruneRateLimits } from "@/lib/rate-limit";
import { runNudges } from "@/lib/jobs/nudges";
import { rebuildNorms } from "@/lib/services/benchmarks";
import { runScheduledDashboards } from "@/lib/services/dashboards";
import { runRetention } from "@/lib/jobs/retention";
import { pruneSsoTickets } from "@/lib/services/sso";
import { purgeScheduledDeletions } from "@/lib/services/my-data";
import { purgeExits } from "@/lib/services/leaving";
import { backfillRoundResults } from "@/lib/services/round-results";
import { pruneErrors, recordError } from "@/lib/monitoring";

export const runtime = "nodejs";

/** Scheduled reminder job. Call hourly with "Authorization: Bearer $CRON_SECRET" (Vercel Cron sends this). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Each job runs on its own: one failure is recorded and the others still run.
  const jobs: Record<string, () => Promise<unknown>> = {
    raters: runReminders,
    pulses: runPulseReminders,
    nudges: runNudges,
    dashboards: runScheduledDashboards,
    benchmarks: rebuildNorms,
    rateLimitRowsPruned: () => pruneRateLimits(),
    retention: () => runRetention(),
    ssoTicketsPruned: pruneSsoTickets,
    accounts: () => purgeScheduledDeletions(),
    errorsPruned: () => pruneErrors(),
    roundResults: () => backfillRoundResults(),
    companyExits: () => purgeExits(),
  };
  const out: Record<string, unknown> = {};
  let failed = 0;
  for (const [name, run] of Object.entries(jobs)) {
    try {
      out[name] = await run();
    } catch (e) {
      failed++;
      out[name] = { error: true };
      await recordError(e, { route: `cron:${name}`, kind: "job" });
    }
  }
  return NextResponse.json({ ok: failed === 0, ...out }, { status: failed ? 500 : 200 });
}
