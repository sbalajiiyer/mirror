import { NextResponse } from "next/server";
import { runPulseReminders, runReminders } from "@/lib/jobs/reminders";
import { pruneRateLimits } from "@/lib/rate-limit";
import { runNudges } from "@/lib/jobs/nudges";
import { rebuildNorms } from "@/lib/services/benchmarks";
import { runScheduledDashboards } from "@/lib/services/dashboards";
import { runRetention } from "@/lib/jobs/retention";
import { pruneSsoTickets } from "@/lib/services/sso";

export const runtime = "nodejs";

/** Scheduled reminder job. Call hourly with "Authorization: Bearer $CRON_SECRET" (Vercel Cron sends this). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const raters = await runReminders();
  const pulses = await runPulseReminders();
  const nudges = await runNudges();
  const dashboards = await runScheduledDashboards();
  const benchmarks = await rebuildNorms();
  const rateLimitRowsPruned = await pruneRateLimits();
  const retention = await runRetention();
  const ssoTicketsPruned = await pruneSsoTickets();
  return NextResponse.json({ raters, pulses, nudges, dashboards, benchmarks, rateLimitRowsPruned, retention, ssoTicketsPruned });
}
