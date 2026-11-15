import { describe, expect, it } from "vitest";
import { derivedToken, hashToken, looksLikeToken, newToken, signPayload, verifySignedPayload } from "@/lib/tokens";
import { parseRaterLines } from "@/lib/rater-input";

describe("tokens", () => {
  it("creates unguessable, well-formed tokens and stores only hashes", () => {
    const t = newToken();
    expect(looksLikeToken(t)).toBe(true);
    expect(hashToken(t)).toHaveLength(64);
    expect(hashToken(t)).not.toContain(t);
    expect(newToken()).not.toBe(t);
  });

  it("derives a stable token per invite, different per purpose", () => {
    expect(derivedToken("invite", "abc")).toBe(derivedToken("invite", "abc"));
    expect(derivedToken("invite", "abc")).not.toBe(derivedToken("group", "abc"));
    expect(looksLikeToken(derivedToken("invite", "abc"))).toBe(true);
  });

  it("verifies signed payloads and rejects tampering or expiry", () => {
    const now = Date.now();
    const t = signPayload("print:a1:u1", 60, now);
    expect(verifySignedPayload(t, now)).toBe("print:a1:u1");
    expect(verifySignedPayload(t, now + 61_000)).toBeNull();
    const forged = Buffer.from(Buffer.from(t, "base64url").toString().replace("u1", "u2")).toString("base64url");
    expect(verifySignedPayload(forged, now)).toBeNull();
  });
});

describe("parseRaterLines", () => {
  it("parses common pasted formats", () => {
    expect(parseRaterLines("Sam Patel <Sam@Example.com>\nriya@example.com\nChris, chris@x.io\nnot-an-email")).toEqual([
      { name: "Sam Patel", email: "sam@example.com" },
      { name: "", email: "riya@example.com" },
      { name: "Chris", email: "chris@x.io" },
    ]);
  });
});

describe("appUrl", () => {
  it("prefers APP_URL, then Vercel's own URL, then localhost", async () => {
    const { appUrl } = await import("@/lib/url");
    const saved = { ...process.env };
    try {
      process.env.APP_URL = "https://mirror.example.com/";
      expect(appUrl("/r/x")).toBe("https://mirror.example.com/r/x");
      delete process.env.APP_URL;
      delete process.env.AUTH_URL;
      process.env.VERCEL_ENV = "production";
      process.env.VERCEL_PROJECT_PRODUCTION_URL = "mirror.vercel.app";
      expect(appUrl("/r/x")).toBe("https://mirror.vercel.app/r/x");
      process.env.VERCEL_ENV = "preview";
      process.env.VERCEL_BRANCH_URL = "mirror-git-x.vercel.app";
      expect(appUrl("r/x")).toBe("https://mirror-git-x.vercel.app/r/x");
      delete process.env.VERCEL_ENV;
      delete process.env.VERCEL_BRANCH_URL;
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
      delete process.env.VERCEL_URL;
      expect(appUrl()).toBe("http://localhost:3000/");
    } finally {
      process.env = saved;
    }
  });
});
