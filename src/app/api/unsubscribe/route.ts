import { NextResponse } from "next/server";
import { emailFromUnsubscribeToken, suppress } from "@/lib/email/unsubscribe";

/**
 * RFC 8058 one-click unsubscribe: mail clients POST here (List-Unsubscribe-Post). GET just sends
 * people to the page with a button, so link scanners never unsubscribe anyone.
 */
export async function POST(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const email = emailFromUnsubscribeToken(t);
  if (!email) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await suppress(email, "one-click");
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  return NextResponse.redirect(new URL(`/u/${encodeURIComponent(t)}`, req.url));
}
