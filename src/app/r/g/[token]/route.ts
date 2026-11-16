import { NextResponse, type NextRequest } from "next/server";
import { inviteFromGroupLink } from "@/lib/services/raters";
import { hit, ipFromRequest } from "@/lib/rate-limit";

/**
 * Shareable group link. The first visit creates an anonymous invite in that group and
 * remembers it in an httpOnly cookie, so refreshing resumes the same questionnaire.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cookieName = `mirror_g_${token.slice(0, 12)}`;
  const existing = req.cookies.get(cookieName)?.value;
  if (existing) return NextResponse.redirect(new URL(`/r/${existing}`, req.url));
  const [ip, link] = await Promise.all([hit("groupLinkIp", ipFromRequest(req)), hit("groupLinkToken", token)]);
  if (!ip.ok || !link.ok) {
    return new NextResponse(
      "<!doctype html><meta name=viewport content='width=device-width'><title>Please slow down</title><body style='font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem'><h1>Please slow down</h1><p>This feedback link has had a lot of requests. Please wait a while and try again.</p>",
      { status: 429, headers: { "content-type": "text/html; charset=utf-8", "retry-after": String(Math.max(ip.retryAfterSec, link.retryAfterSec)) } },
    );
  }
  const inviteToken = await inviteFromGroupLink(token);
  if (!inviteToken) return NextResponse.redirect(new URL(`/r/invalid-link-${"x".repeat(40)}`, req.url));
  const res = NextResponse.redirect(new URL(`/r/${inviteToken}`, req.url));
  res.cookies.set(cookieName, inviteToken, { httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 60 });
  return res;
}
