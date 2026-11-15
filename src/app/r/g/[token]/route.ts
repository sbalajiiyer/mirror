import { NextResponse, type NextRequest } from "next/server";
import { inviteFromGroupLink } from "@/lib/services/raters";

/**
 * Shareable group link. The first visit creates an anonymous invite in that group and
 * remembers it in an httpOnly cookie, so refreshing resumes the same questionnaire.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cookieName = `mirror_g_${token.slice(0, 12)}`;
  const existing = req.cookies.get(cookieName)?.value;
  if (existing) return NextResponse.redirect(new URL(`/r/${existing}`, req.url));
  const inviteToken = await inviteFromGroupLink(token);
  if (!inviteToken) return NextResponse.redirect(new URL(`/r/invalid-link-${"x".repeat(40)}`, req.url));
  const res = NextResponse.redirect(new URL(`/r/${inviteToken}`, req.url));
  res.cookies.set(cookieName, inviteToken, { httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 60 });
  return res;
}
