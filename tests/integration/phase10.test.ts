/** Phase 10 against a real database: SSO, residency, retention, audit scoping, export and deletion. */
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { SignJWT } from "jose";

const hasDb = !!process.env.TEST_DATABASE_URL;
vi.spyOn(console, "info").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

describe.skipIf(!hasDb)("enterprise (integration)", async () => {
  const { db } = await import("@/lib/db");
  const sso = await import("@/lib/services/sso");
  const org = await import("@/lib/services/org");
  const settings = await import("@/lib/services/org-settings");
  const activity = await import("@/lib/services/activity");
  const myData = await import("@/lib/services/my-data");
  const { runRetention } = await import("@/lib/jobs/retention");
  const { runAI } = await import("@/lib/ai/client");
  const { audit } = await import("@/lib/audit");
  const svc = await import("@/lib/services/assessments");
  const raters = await import("@/lib/services/raters");
  const { derivedToken } = await import("@/lib/tokens");
  const { syncFramework } = await import("@/lib/frameworks/sync");
  const { CORE_360 } = await import("@/lib/frameworks/core-360");

  const stamp = Date.now();
  const domain = `acme${stamp}.test`;
  const mk = (email: string) => db.user.create({ data: { email, name: email.split("@")[0], profile: { create: { displayName: email.split("@")[0], goals: [], onboardedAt: new Date() } } } });
  const admin = await mk(`admin-${stamp}@${domain}`);
  const orgId = (await org.createOrg(admin.id, `Acme ${stamp}`)).id;

  // A pretend IdP behind an injected fetch.
  const ISSUER = `https://idp-${stamp}.test`;
  const SECRET = "client-secret-value-123";
  const codes = new Map<string, Record<string, unknown>>();
  const idp = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === `${ISSUER}/.well-known/openid-configuration`) return Response.json({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/auth`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/jwks` });
    if (url === `${ISSUER}/token`) {
      const code = new URLSearchParams(String(init?.body)).get("code")!;
      const claims = codes.get(code);
      if (!claims) return new Response("bad", { status: 400 });
      const id_token = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuer(ISSUER).setAudience("acme-client").setExpirationTime("5m").sign(new TextEncoder().encode(SECRET));
      return Response.json({ id_token });
    }
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
  const login = async (email: string, claims: Record<string, unknown> = {}) => {
    const b = await sso.beginSso(email, "/dashboard", idp);
    const q = new URL(b.url).searchParams;
    const code = `code-${Math.random()}`;
    codes.set(code, { email, email_verified: true, nonce: q.get("nonce"), ...claims });
    return { state: q.get("state")!, code, cookie: b.cookie };
  };

  it("sets up SSO only for a verified, non-public domain with a working IdP", async () => {
    await expect(sso.setSsoDomain(admin.id, orgId, "gmail.com")).rejects.toThrow(/Personal email domains/);
    await expect(sso.setSsoDomain(admin.id, orgId, "not a domain")).rejects.toThrow();
    const member = await mk(`m-${stamp}@${domain}`);
    await db.orgMember.create({ data: { orgId, userId: member.id, email: member.email!, status: "ACTIVE" } });
    await expect(sso.setSsoDomain(member.id, orgId, domain)).rejects.toThrow(/Only organization owners/);
    await sso.setSsoDomain(admin.id, orgId, domain);
    const s = await sso.ssoSettings(admin.id, orgId);
    expect(s.verifyRecord).toMatch(/^mirror-verification=/);
    await expect(sso.saveSsoConfig(admin.id, orgId, { issuer: ISSUER, clientId: "acme-client", clientSecret: SECRET, enabled: true, required: false }, idp)).rejects.toThrow(/Verify your domain/);
    await expect(sso.verifySsoDomain(admin.id, orgId, async () => [["mirror-verification=wrong"]])).rejects.toThrow(/couldn't find/);
    await sso.verifySsoDomain(admin.id, orgId, async (host) => (host === `_mirror.${domain}` ? [[s.verifyRecord!]] : []));
    await expect(sso.saveSsoConfig(admin.id, orgId, { issuer: "http://insecure.test", clientId: "x", clientSecret: "y", enabled: true, required: false }, idp)).rejects.toThrow(/https/);
    await expect(sso.saveSsoConfig(admin.id, orgId, { issuer: "https://nothing.test", clientId: "x", clientSecret: "y", enabled: true, required: false }, idp)).rejects.toThrow(/couldn't read/);
    await sso.saveSsoConfig(admin.id, orgId, { issuer: ISSUER, clientId: "acme-client", clientSecret: SECRET, enabled: true, required: true }, idp);
    const o = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(o.ssoClientSecret).not.toContain(SECRET);
    expect(await sso.ssoRequiredFor(`anyone@${domain}`)).toBe(true);
    expect(await sso.ssoRequiredFor("anyone@example.com")).toBe(false);
    // Another org can't claim the same domain.
    const other = await mk(`o-${stamp}@other.test`);
    const otherOrg = (await org.createOrg(other.id, `Other ${stamp}`)).id;
    await expect(sso.setSsoDomain(other.id, otherOrg, domain)).rejects.toThrow(/already claimed/);
  });

  it("signs in through the IdP, provisions the person and issues a single-use ticket", async () => {
    await expect(sso.beginSso("x@example.com", "/", idp)).rejects.toThrow(/isn't set up/);
    const email = `new-${stamp}@${domain}`;
    const l = await login(email, { name: "New Person" });
    const { ticket, callbackUrl } = await sso.completeSso({ code: l.code, state: l.state }, l.cookie, idp);
    expect(callbackUrl).toBe("/dashboard");
    const u = await sso.redeemTicket(ticket);
    expect(u).toMatchObject({ email, name: "New Person" });
    expect(u!.emailVerified).not.toBeNull();
    expect(await sso.redeemTicket(ticket)).toBeNull();
    expect(await db.orgMember.findFirst({ where: { orgId, email } })).toMatchObject({ status: "ACTIVE", role: "MEMBER", userId: u!.id });
    expect(await db.auditLog.findFirst({ where: { action: "auth.sso", orgId, subjectId: u!.id } })).not.toBeNull();
  });

  it("rejects tampered state, other domains and unverified emails", async () => {
    const a = await login(`p-${stamp}@${domain}`);
    await expect(sso.completeSso({ code: a.code, state: "forged" }, a.cookie, idp)).rejects.toThrow(/expired/);
    await expect(sso.completeSso({ code: a.code, state: a.state }, undefined, idp)).rejects.toThrow(/expired/);
    const b = await login(`q-${stamp}@${domain}`, { email: "victim@gmail.com" });
    await expect(sso.completeSso({ code: b.code, state: b.state }, b.cookie, idp)).rejects.toThrow(/Only acme/);
    const c = await login(`r-${stamp}@${domain}`, { email_verified: false });
    await expect(sso.completeSso({ code: c.code, state: c.state }, c.cookie, idp)).rejects.toThrow(/verified email/);
    const d = await login(`s-${stamp}@${domain}`, { nonce: "replayed" });
    await expect(sso.completeSso({ code: d.code, state: d.state }, d.cookie, idp)).rejects.toThrow(/couldn't verify/);
    expect(await db.user.findUnique({ where: { email: "victim@gmail.com" } })).toBeNull();
  });

  it("keeps EU data away from non-EU AI providers", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    const r = await runAI({ feature: "summary", userId: admin.id, region: "eu", request: { system: "s", messages: [{ role: "user", content: "u" }] }, schema: z.object({ x: z.string() }), mock: () => ({ x: "m" }), fallback: () => ({ x: "fallback" }) });
    vi.unstubAllEnvs();
    expect(r).toMatchObject({ ok: false, fallback: { x: "fallback" } });
    expect(await db.aIInteractionLog.findFirst({ where: { userId: admin.id, status: "residency" } })).not.toBeNull();
  });

  it("logs settings changes to the org audit log, admins only, and exports CSV safely", async () => {
    await settings.updateOrgData(admin.id, orgId, { region: "eu", retentionMonths: 12 });
    await expect(settings.updateOrgData(admin.id, orgId, { region: "mars", retentionMonths: 12 })).rejects.toThrow();
    const log = await activity.orgAuditLog(admin.id, orgId);
    expect(log.rows.map((r) => r.action)).toEqual(expect.arrayContaining(["org.settings", "sso.config", "sso.domain_verified", "auth.sso", "org.create"]));
    expect((await activity.orgAuditLog(admin.id, orgId, { action: "org.settings" })).rows).toHaveLength(1);
    const member = await db.orgMember.findFirstOrThrow({ where: { orgId, role: "MEMBER", userId: { not: null } } });
    await expect(activity.orgAuditLog(member.userId!, orgId)).rejects.toThrow(/Only organization admins/);
    const csv = activity.auditCsv([{ at: new Date(0), actor: "=HYPERLINK(1)", label: 'Said "hi", then left', action: "x", entity: "Y" }]);
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
    expect(csv).toContain(`"Said ""hi"", then left"`);
  });

  it("deletes raw answers after the retention period and keeps aggregates", async () => {
    const fw = await syncFramework(db, CORE_360);
    const full = await db.framework.findUniqueOrThrow({ where: { id: fw.id }, include: { competencies: { include: { questions: true } } } });
    const qs = full.competencies.flatMap((c) => c.questions.map((q) => ({ competencyKey: c.key, questionKey: q.key, text: q.text, selfText: q.selfText })));
    const subject = await db.user.findFirstOrThrow({ where: { email: `new-${stamp}@${domain}` } });
    const camp = await org.createCampaign(admin.id, orgId, { name: "Round", frameworkId: fw.id, teamMode: false, dueInDays: 14 });
    const make = async (title: string) => {
      const a = await svc.createAssessment(subject.id, { title, goal: "self_awareness", frameworkId: fw.id, questions: qs, orgCampaignId: title === "Old" ? camp.id : undefined, groups: [{ kind: "PEER", name: "Peers", shareLink: false, raters: [1, 2, 3].map((i) => ({ name: `P${i}`, email: `${title}${i}-${stamp}@t.local` })) }], inviteMessage: "Please give me feedback, thank you.", dueAt: null, minRatersPerGroup: 3, showManagerSeparately: false });
      const aq = await db.assessmentQuestion.findMany({ where: { assessmentId: a.id } });
      const ans = { ratings: Object.fromEntries(aq.map((q) => [q.id, 4])), competencyComments: {}, start: "A specific comment", stop: "", continue: "", general: "", deidentify: false };
      await svc.submitSelfAssessment(subject.id, a.id, ans);
      await svc.launchAssessment(subject.id, a.id);
      for (const inv of await db.raterInvite.findMany({ where: { assessmentId: a.id } })) await raters.submitRaterResponse(derivedToken("invite", inv.id), ans);
      await svc.closeAssessment(subject.id, a.id);
      return a;
    };
    const old = await make("Old");
    const recent = await make("Recent");
    await db.assessment.update({ where: { id: old.id }, data: { closedAt: new Date(Date.now() - 400 * 86400000) } });
    await db.assessment.update({ where: { id: recent.id }, data: { closedAt: new Date(Date.now() - 400 * 86400000) } }); // not an org round
    const before = await db.report.findFirstOrThrow({ where: { assessmentId: old.id } });
    const r = await runRetention();
    expect(r.assessments).toBeGreaterThanOrEqual(1);
    expect(await db.submission.count({ where: { assessmentId: old.id } })).toBe(0);
    expect(await db.submission.count({ where: { assessmentId: recent.id } })).toBeGreaterThan(0);
    const after = await db.report.findFirstOrThrow({ where: { id: before.id } });
    const d = after.data as { retentionPurgedAt?: string; competencies: unknown[]; comments: { ssc: { START: { comments: unknown[] }[] } } };
    expect(d.retentionPurgedAt).toBeTruthy();
    expect(d.competencies).toEqual((before.data as { competencies: unknown[] }).competencies);
    expect(d.comments.ssc.START.every((t) => t.comments.length === 0)).toBe(true);
    expect(await db.auditLog.findFirst({ where: { action: "retention.purge", orgId, subjectId: subject.id } })).not.toBeNull();
    expect((await runRetention()).assessments).toBe(0); // idempotent
  });

  it("shows people who touched their data, exports it, and deletes the account", async () => {
    const u = await mk(`self-${stamp}@solo.test`);
    await audit(null, "share.view", "ShareLink", "x", undefined, { subjectId: u.id });
    await audit(admin.id, "coach.view_report", "Assessment", "y", undefined, { subjectId: u.id });
    const rows = await activity.personalActivity(u.id);
    expect(rows.map((r) => `${r.actor}|${r.label}`)).toEqual(expect.arrayContaining(["Someone with the link|Opened your share link", `${admin.name}|Viewed a shared report`]));

    const exp = await myData.exportMyData(u.id);
    expect(exp.user.email).toBe(u.email);
    expect(exp.activity.length).toBeGreaterThanOrEqual(2);

    // Sole admin of an org with other people can't delete until someone else is admin.
    await expect(myData.deleteMyAccount(admin.id, admin.email!)).rejects.toThrow(/only owner/);
    await expect(myData.deleteMyAccount(u.id, "wrong@solo.test")).rejects.toThrow(/Type your email/);
    const soloOrg = (await org.createOrg(u.id, `Solo ${stamp}`)).id;
    const custom = await db.framework.create({ data: { slug: `c-${stamp}`, name: "Mine", description: "", isBuiltIn: false, ownerId: u.id, source: "custom" } });
    await myData.deleteMyAccount(u.id, u.email!.toUpperCase());
    expect(await db.user.findUnique({ where: { id: u.id } })).toBeNull();
    expect(await db.organization.findUnique({ where: { id: soloOrg } })).toBeNull();
    expect(await db.framework.findUnique({ where: { id: custom.id } })).toBeNull(); // unused by others, so deleted
  });
});
