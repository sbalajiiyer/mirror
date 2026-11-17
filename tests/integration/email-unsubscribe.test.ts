/** Unsubscribe link, postal address and suppression in every non-essential email (CAN-SPAM / RFC 8058). */
import { describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.TEST_DATABASE_URL;
vi.spyOn(console, "info").mockImplementation(() => {});

describe.skipIf(!hasDb)("email unsubscribe (integration)", async () => {
  const { db } = await import("@/lib/db");
  const { sendEmail } = await import("@/lib/email");
  const u = await import("@/lib/email/unsubscribe");
  const { pulseDueEmail, magicLinkEmail } = await import("@/lib/email/templates");
  const to = `unsub-${Date.now()}@example.com`;
  process.env.MAIL_POSTAL_ADDRESS = "123 Example St, Springfield, IL 62701, USA";

  it("adds the postal address, an unsubscribe link and one-click headers", async () => {
    const sent: { text: string; headers?: Record<string, string> }[] = [];
    const r = await sendEmail(pulseDueEmail({ to, name: "Sam", link: "https://x", title: "T" }), { name: "test", send: async (m) => (sent.push(m), {}) });
    expect(r.ok).toBe(true);
    expect(sent[0].text).toContain("Mirror · 123 Example St, Springfield, IL 62701, USA");
    expect(sent[0].text).toMatch(/Unsubscribe: http.*\/u\//);
    expect(sent[0].headers?.["List-Unsubscribe"]).toMatch(/^<http.*\/api\/unsubscribe\?t=.+>$/);
    expect(sent[0].headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const row = await db.notification.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.body).toContain("Unsubscribe:");
  });

  it("tokens round-trip, are tamper-proof, and unsubscribing stops non-essential emails only", async () => {
    const token = u.unsubscribeToken(to.toUpperCase());
    expect(u.emailFromUnsubscribeToken(token)).toBe(to);
    expect(u.emailFromUnsubscribeToken(token.slice(0, -2) + "xx")).toBeNull();
    await u.suppress(to);
    const send = vi.fn(async () => ({}));
    const r = await sendEmail(pulseDueEmail({ to, name: "Sam", link: "https://x", title: "T" }), { name: "test", send });
    expect(r).toMatchObject({ ok: false, error: "unsubscribed" });
    expect(send).not.toHaveBeenCalled();
    expect((await db.notification.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("SUPPRESSED");
    // A sign-in link the person asked for still arrives, without a marketing footer.
    const sent: { text: string }[] = [];
    await sendEmail(magicLinkEmail({ to, url: "https://x/signin" }), { name: "test", send: async (m) => (sent.push(m), {}) });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).not.toContain("Unsubscribe");
    await u.resubscribe(to);
    expect(await u.isSuppressed(to)).toBe(false);
  });
});
