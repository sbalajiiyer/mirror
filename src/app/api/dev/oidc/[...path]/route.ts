import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { signPayload, verifySignedPayload } from "@/lib/tokens";
import { appUrl } from "@/lib/url";

/*
 * A pretend identity provider for local development and end-to-end tests of SSO.
 * DEV_TOOLS_ENABLED only: it signs in whoever the login_hint names, so it must never run in production.
 * Issuer: <app>/api/dev/oidc. ID tokens are HS256-signed with the client secret.
 */

const off = () => process.env.DEV_TOOLS_ENABLED !== "true";
const issuer = () => appUrl("/api/dev/oidc");
type Code = { email: string; nonce: string; clientId: string; redirectUri: string; challenge: string };

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (off()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const path = (await params).path.join("/");
  const url = new URL(req.url);
  if (path === ".well-known/openid-configuration") {
    const i = issuer();
    return NextResponse.json({ issuer: i, authorization_endpoint: `${i}/authorize`, token_endpoint: `${i}/token`, jwks_uri: `${i}/jwks`, id_token_signing_alg_values_supported: ["HS256"] });
  }
  if (path === "jwks") return NextResponse.json({ keys: [] });
  if (path === "authorize") {
    const q = url.searchParams;
    const redirectUri = q.get("redirect_uri") ?? "";
    const email = q.get("login_hint") ?? "";
    if (!redirectUri.startsWith(appUrl("/")) || !email.includes("@")) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    const code: Code = { email, nonce: q.get("nonce") ?? "", clientId: q.get("client_id") ?? "", redirectUri, challenge: q.get("code_challenge") ?? "" };
    const back = new URL(redirectUri);
    back.searchParams.set("code", signPayload(Buffer.from(JSON.stringify(code)).toString("base64url"), 120));
    back.searchParams.set("state", q.get("state") ?? "");
    return NextResponse.redirect(back);
  }
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (off() || (await params).path.join("/") !== "token") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const form = new URLSearchParams(await req.text());
  const raw = verifySignedPayload(form.get("code") ?? "");
  const code = raw ? (JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Code) : null;
  const [id, secret] = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Basic /, ""), "base64").toString().split(":").map(decodeURIComponent);
  const pkce = createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url");
  if (!code || !secret || id !== code.clientId || form.get("redirect_uri") !== code.redirectUri || pkce !== code.challenge) return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  const idToken = await new SignJWT({ email: code.email, email_verified: true, name: code.email.split("@")[0].replace(/\./g, " "), nonce: code.nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer())
    .setAudience(code.clientId)
    .setSubject(createHash("sha256").update(code.email).digest("hex").slice(0, 24))
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
  return NextResponse.json({ access_token: "mock", token_type: "Bearer", id_token: idToken });
}
