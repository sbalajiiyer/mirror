import { afterEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { authorizationUrl, newAuthRequest, validIssuer, verifyIdToken, type OidcMetadata } from "@/lib/sso/oidc";
import { providerAllowedIn } from "@/lib/residency";

describe("secret box", () => {
  it("round-trips and rejects tampering", () => {
    const box = encryptSecret("s3cret");
    expect(box).not.toContain("s3cret");
    expect(decryptSecret(box)).toBe("s3cret");
    expect(encryptSecret("s3cret")).not.toBe(box); // random IV
    const parts = box.split(".");
    parts[3] = Buffer.from("other").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});

describe("OIDC client", () => {
  it("accepts only https issuers without IPs, credentials or queries", () => {
    expect(validIssuer("https://acme.okta.com/")).toBe("https://acme.okta.com");
    expect(validIssuer("https://login.microsoftonline.com/tenant/v2.0")).toBe("https://login.microsoftonline.com/tenant/v2.0");
    expect(validIssuer("http://acme.okta.com")).toBeNull();
    expect(validIssuer("https://10.0.0.1")).toBeNull();
    expect(validIssuer("https://user:pw@acme.com")).toBeNull();
    expect(validIssuer("https://acme.com/?x=1")).toBeNull();
    expect(validIssuer("not a url")).toBeNull();
  });

  it("builds a PKCE authorization request", () => {
    const r = newAuthRequest();
    const m: OidcMetadata = { issuer: "https://idp.test", authorization_endpoint: "https://idp.test/auth", token_endpoint: "https://idp.test/token", jwks_uri: "https://idp.test/jwks" };
    const u = new URL(authorizationUrl(m, { clientId: "c", redirectUri: "https://app/cb", state: r.state, nonce: r.nonce, challenge: r.challenge, loginHint: "a@b.com" }));
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ response_type: "code", client_id: "c", code_challenge_method: "S256", scope: "openid email profile", login_hint: "a@b.com" });
    expect(r.challenge).not.toBe(r.verifier);
  });

  describe("ID token verification", () => {
    const m: OidcMetadata = { issuer: "https://idp.test", authorization_endpoint: "https://idp.test/auth", token_endpoint: "https://idp.test/token", jwks_uri: "https://idp.test/jwks" };
    afterEach(() => vi.unstubAllGlobals());

    it("verifies RS256 tokens against the issuer's JWKS and checks nonce and audience", async () => {
      const { publicKey, privateKey } = await generateKeyPair("RS256");
      const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } })));
      const sign = (claims: Record<string, unknown>, aud = "client") =>
        new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer("https://idp.test").setAudience(aud).setIssuedAt().setExpirationTime("5m").sign(privateKey);
      const ok = await verifyIdToken(m, await sign({ email: "a@acme.com", nonce: "n1" }), "client", "unused", "n1");
      expect(ok.email).toBe("a@acme.com");
      await expect(verifyIdToken(m, await sign({ nonce: "other" }), "client", "unused", "n1")).rejects.toThrow(/Nonce/);
      await expect(verifyIdToken(m, await sign({ nonce: "n1" }, "someone-else"), "client", "unused", "n1")).rejects.toThrow();
    });

    it("verifies HS256 tokens with the client secret only", async () => {
      const sign = (secret: string) => new SignJWT({ nonce: "n" }).setProtectedHeader({ alg: "HS256" }).setIssuer("https://idp.test").setAudience("client").setExpirationTime("5m").sign(new TextEncoder().encode(secret));
      expect((await verifyIdToken(m, await sign("right-secret-value"), "client", "right-secret-value", "n")).nonce).toBe("n");
      await expect(verifyIdToken(m, await sign("wrong-secret-value"), "client", "right-secret-value", "n")).rejects.toThrow();
    });
  });
});

describe("data residency", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("blocks non-EU AI providers for EU data unless listed", () => {
    expect(providerAllowedIn("groq", "us")).toBe(true);
    expect(providerAllowedIn("groq", "eu")).toBe(false);
    vi.stubEnv("AI_EU_PROVIDERS", "anthropic, openai");
    expect(providerAllowedIn("openai", "eu")).toBe(true);
    expect(providerAllowedIn("groq", "eu")).toBe(false);
  });
});
