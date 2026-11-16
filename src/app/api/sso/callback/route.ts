import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { signIn } from "@/auth";
import { DomainError } from "@/lib/errors";
import { completeSso, SSO_COOKIE } from "@/lib/services/sso";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const cookie = jar.get(SSO_COOKIE)?.value;
  jar.delete({ name: SSO_COOKIE, path: "/api/sso" });
  let result: { ticket: string; callbackUrl: string };
  try {
    result = await completeSso({ code: url.searchParams.get("code"), state: url.searchParams.get("state"), error: url.searchParams.get("error") }, cookie);
  } catch (e) {
    const msg = e instanceof DomainError ? e.message : "Something went wrong with single sign-on.";
    if (!(e instanceof DomainError)) console.error("[sso] callback failed", e);
    return NextResponse.redirect(new URL(`/signin/sso?error=failed&message=${encodeURIComponent(msg)}`, url));
  }
  try {
    await signIn("sso", { ticket: result.ticket, redirectTo: result.callbackUrl });
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error("[sso] session failed", e);
  }
  return NextResponse.redirect(new URL("/signin/sso?error=failed", url));
}
