import { NextResponse } from "next/server";
import { DomainError } from "@/lib/errors";
import { beginSso, SSO_COOKIE } from "@/lib/services/sso";
import { hit, ipFromRequest } from "@/lib/rate-limit";

const safe = (u: string | null) => (u && u.startsWith("/") && !u.startsWith("//") ? u : "/dashboard");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get("email") ?? "";
  const back = (code: string) => NextResponse.redirect(new URL(`/signin/sso?error=${code}&email=${encodeURIComponent(email)}`, url));
  if (!(await hit("magicLinkIp", ipFromRequest(req))).ok) return back("rate");
  try {
    const { url: to, cookie } = await beginSso(email, safe(url.searchParams.get("callbackUrl")));
    const res = NextResponse.redirect(to);
    res.cookies.set(SSO_COOKIE, cookie, { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/api/sso", maxAge: 600 });
    return res;
  } catch (e) {
    if (e instanceof DomainError) return back(e.code === "no_sso" ? "no_sso" : "start");
    console.error("[sso] start failed", e);
    return back("start");
  }
}
