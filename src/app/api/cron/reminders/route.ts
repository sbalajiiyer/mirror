import { NextResponse } from "next/server";
import { runPulseReminders, runReminders } from "@/lib/jobs/reminders";
import { pruneRateLimits } from "@/lib/rate-limit";
import { runNudges } from "@/lib/jobs/nudges";

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
  const rateLimitRowsPruned = await pruneRateLimits();
  return NextResponse.json({ raters, pulses, nudges, rateLimitRowsPruned });
}
