import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
const { fingerprint, isPlatformAdmin } = await import("@/lib/monitoring");

describe("error monitoring", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("groups the same error regardless of ids and numbers", () => {
    const stack = "Error: x\n    at handler (/app/route.js:10:5)";
    expect(fingerprint("User 123 not found (cmabc123def456)", stack, "GET /x")).toBe(fingerprint("User 456 not found (cmzzz999yyy888)", stack, "GET /x"));
    expect(fingerprint("User 1 not found", stack, "GET /x")).not.toBe(fingerprint("User 1 not found", stack, "GET /y"));
  });
  it("only listed emails are platform admins", () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "ops@mirror.test, Owner@Mirror.test");
    expect(isPlatformAdmin("owner@mirror.test")).toBe(true);
    expect(isPlatformAdmin("someone@mirror.test")).toBe(false);
    expect(isPlatformAdmin(null)).toBe(false);
  });
});
