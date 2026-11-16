import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/*
 * Minimal OpenID Connect client (authorization code + PKCE) for enterprise SSO (Phase 10).
 * Works with Okta, Microsoft Entra ID, Google Workspace, Auth0, OneLogin, JumpCloud, Keycloak…
 * ID tokens are verified against the issuer's JWKS (RS/ES/PS algorithms), or with the client
 * secret for HS256 as the OIDC spec allows.
 */

export type OidcMetadata = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string };

const trim = (u: string) => u.replace(/\/+$/, "");

/** Issuers must be https (http only for localhost while dev tools are on) and never an IP literal. */
export function validIssuer(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(local && u.protocol === "http:" && process.env.DEV_TOOLS_ENABLED === "true")) return null;
  if (!local && (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname.includes(":"))) return null;
  if (u.username || u.password || u.search || u.hash) return null;
  return trim(u.toString());
}

export async function discover(issuer: string, fetchImpl: typeof fetch = fetch): Promise<OidcMetadata> {
  const res = await fetchImpl(`${trim(issuer)}/.well-known/openid-configuration`, { headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Discovery failed (${res.status})`);
  const m = (await res.json()) as Partial<OidcMetadata>;
  if (!m.issuer || trim(m.issuer) !== trim(issuer)) throw new Error("The issuer in the discovery document doesn't match");
  for (const k of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) if (!m[k] || !/^https?:\/\//.test(m[k]!)) throw new Error(`Discovery document is missing ${k}`);
  return m as OidcMetadata;
}

export function newAuthRequest() {
  const verifier = randomBytes(32).toString("base64url");
  return {
    state: randomBytes(16).toString("base64url"),
    nonce: randomBytes(16).toString("base64url"),
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}

export function authorizationUrl(m: OidcMetadata, p: { clientId: string; redirectUri: string; state: string; nonce: string; challenge: string; loginHint?: string }) {
  const u = new URL(m.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", p.state);
  u.searchParams.set("nonce", p.nonce);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  if (p.loginHint) u.searchParams.set("login_hint", p.loginHint);
  return u.toString();
}

export type IdClaims = JWTPayload & { email?: string; email_verified?: boolean | string; name?: string; nonce?: string };

export async function exchangeCode(
  m: OidcMetadata,
  p: { clientId: string; clientSecret: string; redirectUri: string; code: string; verifier: string; nonce: string },
  fetchImpl: typeof fetch = fetch,
): Promise<IdClaims> {
  const res = await fetchImpl(m.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", authorization: `Basic ${Buffer.from(`${encodeURIComponent(p.clientId)}:${encodeURIComponent(p.clientSecret)}`).toString("base64")}` },
    body: new URLSearchParams({ grant_type: "authorization_code", code: p.code, redirect_uri: p.redirectUri, code_verifier: p.verifier, client_id: p.clientId }),
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("No ID token returned");
  return verifyIdToken(m, body.id_token, p.clientId, p.clientSecret, p.nonce);
}

export async function verifyIdToken(m: OidcMetadata, idToken: string, clientId: string, clientSecret: string, nonce: string): Promise<IdClaims> {
  const alg = JSON.parse(Buffer.from(idToken.split(".")[0] ?? "", "base64url").toString("utf8") || "{}").alg as string | undefined;
  const opts = { issuer: m.issuer, audience: clientId, clockTolerance: 60 };
  const { payload } =
    alg === "HS256"
      ? await jwtVerify(idToken, new TextEncoder().encode(clientSecret), { ...opts, algorithms: ["HS256"] })
      : await jwtVerify(idToken, createRemoteJWKSet(new URL(m.jwks_uri)), { ...opts, algorithms: ["RS256", "RS384", "RS512", "PS256", "ES256", "ES384"] });
  const claims = payload as IdClaims;
  if (claims.nonce !== nonce) throw new Error("Nonce mismatch");
  if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== clientId) throw new Error("Token was issued to another client");
  return claims;
}
