import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifySignedPayload } from "@/lib/tokens";

/** One-click unsubscribe from weekly nudges (signed link from the email; no sign-in needed). */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const payload = verifySignedPayload(t);
  const ok = !!payload?.startsWith("nudge-off:");
  if (ok) await db.subjectProfile.updateMany({ where: { userId: payload!.slice("nudge-off:".length) }, data: { nudgeDay: null } });
  const msg = ok ? "Weekly nudges are off. You can turn them back on in Settings." : "This link has expired. You can turn nudges off in Settings.";
  return new NextResponse(
    `<!doctype html><meta name=viewport content='width=device-width'><title>Mirror</title><body style='font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem'><h1>${ok ? "Unsubscribed" : "Link expired"}</h1><p>${msg}</p>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
