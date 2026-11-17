/** Phase 11a: workspaces are assigned by the database, and company round results are frozen. */
import { describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.TEST_DATABASE_URL;
vi.spyOn(console, "info").mockImplementation(() => {});
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined), set: (k: string, v: string) => void jar.set(k, v) }) }));

describe.skipIf(!hasDb)("workspaces (integration)", async () => {
  const { db } = await import("@/lib/db");
  const org = await import("@/lib/services/org");
  const svc = await import("@/lib/services/assessments");
  const raters = await import("@/lib/services/raters");
  const rr = await import("@/lib/services/round-results");
  const { groupProfile } = await import("@/lib/org/analytics");
  const { derivedToken } = await import("@/lib/tokens");
  const { syncFramework } = await import("@/lib/frameworks/sync");
  const { CORE_360 } = await import("@/lib/frameworks/core-360");

  const stamp = Date.now();
  const mk = (name: string) => db.user.create({ data: { email: `${name}-ws-${stamp}@test.local`, name, profile: { create: { displayName: name, goals: ["promotion"], onboardedAt: new Date() } } } });
  const admin = await mk("wsadmin");
  const people = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => mk(`wsemp${i}`)));
  const fw = await syncFramework(db, CORE_360);
  const full = await db.framework.findUniqueOrThrow({ where: { id: fw.id }, include: { competencies: { include: { questions: true } } } });
  const qs = full.competencies.flatMap((c) => c.questions.map((q) => ({ competencyKey: c.key, questionKey: q.key, text: q.text, selfText: q.selfText })));
  const personalWs = async (userId: string) => (await db.workspace.findUniqueOrThrow({ where: { ownerId: userId } })).id;
  const tokenFor = async (to: string) => (await db.notification.findFirst({ where: { to }, orderBy: { createdAt: "desc" } }))!.body.match(/orgs\/invite\/([A-Za-z0-9_-]+)/)![1];
  const base = { goal: "promotion" as const, frameworkId: fw.id, questions: qs, inviteMessage: "Please give me feedback, thank you.", dueAt: null, minRatersPerGroup: 3, showManagerSeparately: false };
  let orgId = "";
  let teamId = "";
  let campaignId = "";
  let companyWs = "";

  async function run360(userId: string, i: number, extra: { orgCampaignId?: string; title: string }) {
    const a = await svc.createAssessment(userId, { ...base, ...extra, groups: [{ kind: "PEER", name: "Peers", shareLink: false, raters: [1, 2, 3].map((k) => ({ name: `R${k}`, email: `r${k}-${i}-${extra.title.length}-${stamp}@t.local` })) }] });
    const aq = await db.assessmentQuestion.findMany({ where: { assessmentId: a.id } });
    const ans = (v: number) => ({ ratings: Object.fromEntries(aq.map((q) => [q.id, v])), competencyComments: {}, start: `Share plans earlier please ${stamp}`, stop: "", continue: "", general: "", deidentify: false });
    await svc.submitSelfAssessment(userId, a.id, ans(4));
    await svc.launchAssessment(userId, a.id);
    for (const inv of await db.raterInvite.findMany({ where: { assessmentId: a.id } })) await raters.submitRaterResponse(derivedToken("invite", inv.id), ans(2 + (i % 3)));
    await svc.closeAssessment(userId, a.id);
    return a.id;
  }

  it("gives every new user a Personal workspace and every new org a company workspace", async () => {
    expect(await db.workspace.findUnique({ where: { ownerId: admin.id } })).toMatchObject({ kind: "PERSONAL" });
    orgId = (await org.createOrg(admin.id, "Workspace Co")).id;
    const w = await db.workspace.findUniqueOrThrow({ where: { orgId } });
    expect(w.kind).toBe("COMPANY");
    companyWs = w.id;
    await org.inviteMembers(admin.id, orgId, people.map((p) => p.email).join("\n"));
    for (const p of people) await org.respondOrgInviteToken(p.id, await tokenFor(p.email!), true);
    teamId = (await org.createGroup(admin.id, orgId, "TEAM", "Core")).id;
    const members = await db.orgMember.findMany({ where: { orgId, role: "MEMBER" } });
    await org.setGroupMembers(admin.id, orgId, teamId, members.map((m) => m.id));
    campaignId = (await org.createCampaign(admin.id, orgId, { name: "Round 1", groupId: teamId, frameworkId: fw.id, teamMode: false, dueInDays: 14 })).id;
  });

  it("puts personal 360s in Personal and round 360s in the company workspace; related rows follow", async () => {
    const mine = await svc.createAssessment(people[0].id, { ...base, title: "Mine", groups: [{ kind: "PEER", name: "P", shareLink: false, raters: [] }] });
    expect((await db.assessment.findUniqueOrThrow({ where: { id: mine.id } })).workspaceId).toBe(await personalWs(people[0].id));
    for (const [i, p] of people.entries()) await run360(p.id, i, { title: "Round 1", orgCampaignId: campaignId });
    const roundOnes = await db.assessment.findMany({ where: { orgCampaignId: campaignId } });
    expect(roundOnes.every((a) => a.workspaceId === companyWs)).toBe(true);
    const link = await db.shareLink.create({ data: { id: `sl-${stamp}`, userId: people[0].id, assessmentId: roundOnes[0].id, kind: "BADGE" } });
    expect(link.workspaceId).toBe(companyWs);
    const goal = await db.goal.create({ data: { userId: people[0].id, assessmentId: mine.id, competencyKey: "comm", competencyName: "Communication", title: "Listen more", target: 4 } });
    expect(goal.workspaceId).toBe(await personalWs(people[0].id));
  });

  it("keeps a workspace the app passes explicitly", async () => {
    const t = await db.apiToken.create({ data: { userId: admin.id, name: "x", tokenHash: `t-${stamp}`, prefix: "x", workspaceId: companyWs } });
    expect(t.workspaceId).toBe(companyWs);
  });

  it("freezes round totals that match the live group results, once per 360", async () => {
    const reports = (await db.assessment.findMany({ where: { orgCampaignId: campaignId }, include: { reports: { orderBy: { generatedAt: "desc" }, take: 1 } } })).map((a) => a.reports[0].data as never);
    const live = groupProfile(reports, 5);
    const frozen = await rr.roundProfile(orgId, campaignId, "org", 5);
    expect(frozen.people).toBe(6);
    expect(frozen.available).toBe(true);
    const rows = (p: typeof live) => p.competencies.map((c) => [c.key, c.others, c.self, c.spread]).sort((x, y) => String(x[0]).localeCompare(String(y[0])));
    expect(rows(frozen)).toEqual(rows(live));
    expect(frozen.overall).toBe(live.overall);
    expect((await rr.roundProfile(orgId, campaignId, teamId, 5)).people).toBe(6);
    // Idempotent: retries and the backfill job never count a 360 twice.
    const a0 = await db.assessment.findFirstOrThrow({ where: { orgCampaignId: campaignId } });
    expect(await rr.contributeToRound(a0.id)).toBe(false);
    await rr.backfillRoundResults(); // other test files may have their own pending rounds; this one must not change
    expect((await rr.roundProfile(orgId, campaignId, "org", 5)).people).toBe(6);
    // Nothing identifying is stored.
    const row = await db.roundResult.findFirstOrThrow({ where: { campaignId, scope: "org" } });
    const text = JSON.stringify(row);
    for (const p of people) expect(text).not.toContain(p.id);
    expect(text).not.toContain(a0.id);
    // Another org can't read this round.
    expect((await rr.roundProfile("someone-else", campaignId, "org", 5)).available).toBe(false);
  });

  it("does not change past round results when someone deletes their account", async () => {
    const before = await rr.roundProfile(orgId, campaignId, "org", 5);
    await db.user.delete({ where: { id: people[5].id } });
    expect(await db.workspace.findUnique({ where: { ownerId: people[5].id } })).toBeNull();
    expect(await rr.roundProfile(orgId, campaignId, "org", 5)).toEqual(before);
  });

  it("lists Personal first, then companies with the right role, and checks access on the server", async () => {
    const ws = await import("@/lib/workspace");
    const list = await ws.listWorkspaces(people[0].id);
    expect(list.map((w) => [w.kind, w.role])).toEqual([["PERSONAL", "OWNER"], ["COMPANY", "MEMBER"]]);
    expect((await ws.listWorkspaces(admin.id))[1]).toMatchObject({ kind: "COMPANY", role: "OWNER", orgId });
    await expect(ws.requireWorkspaceRole(people[0].id, companyWs, "ADMIN")).rejects.toThrow(/Not found/);
    await expect(ws.requireWorkspaceRole(people[0].id, await personalWs(people[1].id))).rejects.toThrow(/Not found/);
    expect((await ws.requireWorkspaceRole(admin.id, companyWs, "ADMIN")).orgId).toBe(orgId);
  });

  it("remembers the active workspace, but never one the user isn't in", async () => {
    const ws = await import("@/lib/workspace");
    jar.clear();
    expect((await ws.activeWorkspace(people[0].id)).kind).toBe("PERSONAL");
    await ws.setActiveWorkspace(people[0].id, `org:${orgId}`);
    expect((await ws.activeWorkspace(people[0].id)).id).toBe(companyWs);
    // A forged cookie for another company falls back to Personal.
    jar.set(ws.WORKSPACE_COOKIE, "org:not-mine");
    expect((await ws.activeWorkspace(people[0].id)).kind).toBe("PERSONAL");
    expect(await ws.setActiveWorkspace(people[0].id, "org:not-mine")).toBeNull();
  });

  it("personal 360s never add to round totals", async () => {
    await run360(people[1].id, 9, { title: "Just me" });
    expect((await rr.roundProfile(orgId, campaignId, "org", 5)).people).toBe(6);
  });

  describe("leaving a company", async () => {
    const leaving = await import("@/lib/services/leaving");
    const DAY = 24 * 3600 * 1000;

    it("keeps the leaver's data for 7 days and offers a copy without raw comments", async () => {
      const before = await org.teamAnalytics(admin.id, orgId, teamId, campaignId);
      await org.leaveOrg(people[2].id, orgId);
      const [x] = await leaving.pendingExits(people[2].id);
      expect(x).toMatchObject({ orgName: "Workspace Co", copyAllowed: true, copied: false, reports: 1 });
      expect(x.deleteAt.getTime() - Date.now()).toBeGreaterThan(6.9 * DAY);

      expect(await leaving.copyReportsToPersonal(people[2].id, x.memberId)).toBe(1);
      const copy = await db.assessment.findFirstOrThrow({ where: { subjectId: people[2].id, copiedFrom: "Workspace Co" }, include: { reports: true } });
      expect(copy.workspaceId).toBe(await personalWs(people[2].id));
      expect(copy.orgCampaignId).toBeNull();
      const text = JSON.stringify(copy.reports[0].data);
      expect(text).not.toContain(String(stamp));
      expect((copy.reports[0].data as { competencies: unknown[] }).competencies.length).toBeGreaterThan(0);
      await expect(leaving.copyReportsToPersonal(people[2].id, x.memberId)).rejects.toThrow(/already copied/);
      // The copy can't start new sessions (it has no questions or raters).
      const sessions = await import("@/lib/services/sessions");
      await expect(sessions.rerunSurvey(people[2].id, copy.id, {})).rejects.toThrow(/copy of a company report/);

      // Round results for that round don't move.
      expect((await org.teamAnalytics(admin.id, orgId, teamId, campaignId)).profile).toEqual(before.profile);
    });

    it("refuses copies when the company switched them off", async () => {
      await db.organization.update({ where: { id: orgId }, data: { allowPersonalCopy: false } });
      const m = await db.orgMember.findFirstOrThrow({ where: { orgId, userId: people[3].id } });
      await org.removeMember(admin.id, orgId, m.id);
      const [x] = await leaving.pendingExits(people[3].id);
      expect(x.copyAllowed).toBe(false);
      await expect(leaving.copyReportsToPersonal(people[3].id, x.memberId)).rejects.toThrow(/doesn't allow/);
      await db.organization.update({ where: { id: orgId }, data: { allowPersonalCopy: true } });
    });

    it("deletes company data after the grace period; copies, round results and comparisons stay", async () => {
      const before = await org.teamAnalytics(admin.id, orgId, teamId, campaignId);
      const cmp = await org.compareCohorts(admin.id, orgId, { groupId: teamId, campaignId }, { campaignId });
      expect(await leaving.purgeExits(new Date(Date.now() + 6 * DAY))).toBe(0);
      // Other test files may have their own leavers in the same database.
      expect(await leaving.purgeExits(new Date(Date.now() + 8 * DAY))).toBeGreaterThanOrEqual(2);
      expect(await db.assessment.count({ where: { subjectId: { in: [people[2].id, people[3].id] }, workspaceId: companyWs } })).toBe(0);
      expect(await db.assessment.count({ where: { subjectId: people[2].id, copiedFrom: "Workspace Co" } })).toBe(1);
      expect((await org.teamAnalytics(admin.id, orgId, teamId, campaignId)).profile).toEqual(before.profile);
      expect(await org.compareCohorts(admin.id, orgId, { groupId: teamId, campaignId }, { campaignId })).toEqual(cmp);
      expect(await leaving.pendingExits(people[2].id)).toEqual([]);
    });

    it("rejoining within the grace period keeps everything", async () => {
      await org.leaveOrg(people[4].id, orgId);
      await org.inviteMembers(admin.id, orgId, people[4].email!);
      await org.respondOrgInviteToken(people[4].id, await tokenFor(people[4].email!), true);
      await leaving.purgeExits(new Date(Date.now() + 8 * DAY));
      expect(await db.assessment.count({ where: { subjectId: people[4].id, workspaceId: companyWs } })).toBe(1);
    });
  });

  describe("company roles", () => {
    it("owners set roles; analysts read results only; admins can't touch owner settings", async () => {
      const member = (id: string) => db.orgMember.findFirstOrThrow({ where: { orgId, userId: id, status: "ACTIVE" } });
      const analyst = people[0];
      const adminP = people[1];
      await org.setRole(admin.id, orgId, (await member(analyst.id)).id, "ANALYST");
      await org.setRole(admin.id, orgId, (await member(adminP.id)).id, "ADMIN");
      // Only owners change roles.
      await expect(org.setRole(adminP.id, orgId, (await member(analyst.id)).id, "OWNER")).rejects.toThrow(/Only organization owners/);
      // Analysts see group results, but can't manage people or rounds.
      expect((await org.orgOverview(analyst.id, orgId)).profile).toBeDefined();
      expect((await org.teamAnalytics(analyst.id, orgId, teamId, campaignId)).profile.available).toBe(true);
      await expect(org.inviteMembers(analyst.id, orgId, "x@y.com")).rejects.toThrow(/Only organization admins/);
      await expect(org.talentGrid(analyst.id, orgId)).rejects.toThrow(/Only organization admins/);
      // Admins manage people but not data settings or billing, and can't remove an owner.
      const settings = await import("@/lib/services/org-settings");
      await expect(settings.updateOrgData(adminP.id, orgId, { region: "us", retentionMonths: null, allowPersonalCopy: true })).rejects.toThrow(/Only organization owners/);
      await expect(org.removeMember(adminP.id, orgId, (await member(admin.id)).id)).rejects.toThrow(/Only owners can remove an owner/);
      // Workspace roles follow.
      const ws = await import("@/lib/workspace");
      const w = (await ws.listWorkspaces(analyst.id)).find((x) => x.orgId === orgId)!;
      expect(w.role).toBe("ANALYST");
      expect(ws.isCompanyAdmin(w)).toBe(true);
      // A second owner lets the first one step down.
      await org.setRole(admin.id, orgId, (await member(adminP.id)).id, "OWNER");
      await org.setRole(adminP.id, orgId, (await member(admin.id)).id, "ADMIN");
      await expect(org.setRole(adminP.id, orgId, (await member(adminP.id)).id, "MEMBER")).rejects.toThrow(/at least one owner/);
    });
  });

  describe("company AI rules and retention", () => {
    it("uses premium models only where the company allows them, and records usage against the workspace", async () => {
      const ctx = await import("@/lib/ai/context");
      const { runAI } = await import("@/lib/ai/client");
      const { z } = await import("zod");
      Object.assign(process.env, { PREMIUM_AI_ENABLED: "true", ANTHROPIC_API_KEY: "test", ANTHROPIC_MODEL: "claude-test" });
      try {
        expect((await ctx.modelForWorkspace("premium-claude", await personalWs(admin.id))).id).toBe("premium-claude");
        expect((await ctx.modelForWorkspace("premium-claude", companyWs)).id).toBe("free");
        const settings = await import("@/lib/services/org-settings");
        const owner = (await db.orgMember.findFirstOrThrow({ where: { orgId, role: "OWNER", status: "ACTIVE" } })).userId!;
        await expect(settings.updateOrgAi(owner, orgId, { allowedAiModels: ["made-up"] })).rejects.toThrow(/Unknown AI model/);
        await settings.updateOrgAi(owner, orgId, { allowedAiModels: ["premium-claude"] });
        expect((await ctx.modelForWorkspace("premium-claude", companyWs)).id).toBe("premium-claude");
      } finally {
        delete process.env.PREMIUM_AI_ENABLED;
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.ANTHROPIC_MODEL;
      }
      // Usage inside withAiWorkspace is logged against that workspace.
      process.env.AI_PROVIDER = "mock";
      try {
        await ctx.withAiWorkspace(companyWs, () => runAI({ feature: "nl_query", userId: people[0].id, request: { system: "s", messages: [] }, schema: z.object({ x: z.string() }), mock: () => ({ x: "m" }), fallback: () => ({ x: "f" }) }));
      } finally {
        delete process.env.AI_PROVIDER;
      }
      const log = await db.aIInteractionLog.findFirstOrThrow({ where: { userId: people[0].id, feature: "nl_query" }, orderBy: { createdAt: "desc" } });
      expect(log.workspaceId).toBe(companyWs);
    });

    it("retention also removes old AI chats and plans in the company workspace, not in Personal", async () => {
      const { runRetention } = await import("@/lib/jobs/retention");
      await db.organization.update({ where: { id: orgId }, data: { retentionMonths: 12 } });
      const old = new Date(Date.now() - 400 * 24 * 3600 * 1000);
      const a = await db.assessment.findFirstOrThrow({ where: { workspaceId: companyWs } });
      const chat = await db.coachChat.create({ data: { userId: a.subjectId, assessmentId: a.id, mode: "REPORT", title: "old" } });
      await db.$executeRaw`UPDATE "CoachChat" SET "updatedAt" = ${old} WHERE "id" = ${chat.id}`;
      const mine = await db.coachChat.create({ data: { userId: a.subjectId, mode: "REPORT", title: "personal" } });
      await db.$executeRaw`UPDATE "CoachChat" SET "updatedAt" = ${old} WHERE "id" = ${mine.id}`;
      expect(chat.workspaceId).toBe(companyWs);
      const r = await runRetention();
      expect(r.chats).toBeGreaterThanOrEqual(1);
      expect(await db.coachChat.findUnique({ where: { id: chat.id } })).toBeNull();
      expect(await db.coachChat.findUnique({ where: { id: mine.id } })).not.toBeNull();
      await db.organization.update({ where: { id: orgId }, data: { retentionMonths: null } });
    });
  });

  describe("company billing and AI budgets", () => {
    const owner = async () => (await db.orgMember.findFirstOrThrow({ where: { orgId, role: "OWNER", status: "ACTIVE" } })).userId!;

    it("needs an active company plan to start rounds; paying extends it", async () => {
      const billing = await import("@/lib/services/billing");
      await db.organization.update({ where: { id: orgId }, data: { createdAt: new Date(Date.now() - 60 * 24 * 3600 * 1000), platformPaidUntil: new Date(Date.now() - 1000) } });
      await expect(org.createCampaign(await owner(), orgId, { name: "Late round", frameworkId: fw.id, teamMode: false, dueInDays: 14 })).rejects.toThrow(/company plan has ended/);
      await expect(billing.startCheckout(people[0].id, "company_platform_month", { orgId })).rejects.toThrow(/Only organization owners/);
      const { paymentId } = await billing.startCheckout(await owner(), "company_platform_month", { orgId });
      expect((await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).workspaceId).toBe(companyWs);
      await billing.completeStubPayment(await owner(), paymentId, true);
      const o = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
      expect(o.platformPaidUntil!.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
    });

    it("falls back to the free model when the company or per-person AI budget is used up", async () => {
      const ctx = await import("@/lib/ai/context");
      Object.assign(process.env, { PREMIUM_AI_ENABLED: "true", ANTHROPIC_API_KEY: "test", ANTHROPIC_MODEL: "claude-test" });
      try {
        await db.organization.update({ where: { id: orgId }, data: { allowedAiModels: ["premium-claude"], aiBudgetCents: 1000, aiPerPersonCents: 200 } });
        const u = people[0].id;
        expect((await ctx.modelForWorkspace("premium-claude", companyWs, u)).id).toBe("premium-claude");
        // Spend $2.50 as this person: over their $2 share, the company still has budget.
        await db.aIInteractionLog.create({ data: { userId: u, workspaceId: companyWs, feature: "chat_premium", modelId: "premium-claude", provider: "anthropic", tier: "premium", costMicros: 2_500_000, status: "ok" } });
        expect((await ctx.modelForWorkspace("premium-claude", companyWs, u)).id).toBe("free");
        expect((await ctx.modelForWorkspace("premium-claude", companyWs, people[1].id)).id).toBe("premium-claude");
        // Company total over $10: everyone falls back.
        await db.aIInteractionLog.create({ data: { userId: people[1].id, workspaceId: companyWs, feature: "chat_premium", modelId: "premium-claude", provider: "anthropic", tier: "premium", costMicros: 8_000_000, status: "ok" } });
        expect((await ctx.modelForWorkspace("premium-claude", companyWs, people[4].id)).id).toBe("free");
        // Personal use is never limited by the company.
        expect((await ctx.modelForWorkspace("premium-claude", await personalWs(u), u)).id).toBe("premium-claude");
        // Owners see spend per person.
        const settings = await import("@/lib/services/org-settings");
        const usage = await settings.orgAiUsage(await owner(), orgId);
        expect(usage.totalCents).toBe(1050);
        expect(usage.people[0]).toMatchObject({ cents: 800 });
        await expect(settings.orgAiUsage(people[0].id, orgId)).rejects.toThrow(/Only organization owners/);
      } finally {
        delete process.env.PREMIUM_AI_ENABLED;
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.ANTHROPIC_MODEL;
      }
    });

    it("company premium chats use company credits, not the employee's", async () => {
      const chat = await import("@/lib/services/chat");
      Object.assign(process.env, { PREMIUM_AI_ENABLED: "true", ANTHROPIC_API_KEY: "test", ANTHROPIC_MODEL: "claude-test", BILLING_ENFORCED: "true" });
      try {
        await db.organization.update({ where: { id: orgId }, data: { aiBudgetCents: null, aiPerPersonCents: null } });
        await db.workspace.update({ where: { id: companyWs }, data: { credits: 5000 } });
        const u = people[4].id;
        await db.subjectProfile.update({ where: { userId: u }, data: { aiModel: "premium-claude" } });
        const mine = await personalWs(u);
        await db.workspace.update({ where: { id: mine }, data: { credits: 0 } });
        const c = await chat.startChat(u, { mode: "ROLEPLAY", preset: "say_no", premium: true }, companyWs);
        expect(c).toMatchObject({ tier: "premium", workspaceId: companyWs });
        // In Personal, premium needs the person's own credits.
        await expect(chat.startChat(u, { mode: "ROLEPLAY", preset: "say_no", premium: true }, mine)).rejects.toThrow(/Add credits/);
        // A company with no credits falls back to the free model.
        await db.workspace.update({ where: { id: companyWs }, data: { credits: 0 } });
        await expect(chat.startChat(u, { mode: "ROLEPLAY", preset: "say_no", premium: true }, companyWs)).rejects.toThrow(/no credits/);
      } finally {
        delete process.env.PREMIUM_AI_ENABLED;
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.ANTHROPIC_MODEL;
        process.env.BILLING_ENFORCED = "false";
      }
    });
  });

  describe("company coaching", () => {
    it("is offered by an admin, accepted by the employee, then the coach; the company sees status only", async () => {
      const cc = await import("@/lib/services/company-coaching");
      const coach = await import("@/lib/services/coach");
      const owner = (await db.orgMember.findFirstOrThrow({ where: { orgId, role: "OWNER", status: "ACTIVE" } })).userId!;
      const emp = people[4];
      const m = await db.orgMember.findFirstOrThrow({ where: { orgId, userId: emp.id, status: "ACTIVE" } });
      const coachUser = await mk("wscoach");
      await expect(cc.offerCoaching(emp.id, orgId, m.id, coachUser.email!)).rejects.toThrow(/Only organization admins/);
      const link = await cc.offerCoaching(owner, orgId, m.id, coachUser.email!);
      await expect(cc.offerCoaching(owner, orgId, m.id, coachUser.email!)).rejects.toThrow(/already has/);
      // The coach can't accept before the employee does.
      await expect(coach.respondToInvite(coachUser.id, link.id, true)).rejects.toThrow(/no longer valid/);
      expect((await coach.clientCoaching(emp.id)).offers.map((o) => o.id)).toEqual([link.id]);
      await cc.respondToCompanyOffer(emp.id, link.id, true);
      const mail = await db.notification.findFirstOrThrow({ where: { to: coachUser.email!, template: "client-invites-coach" }, orderBy: { createdAt: "desc" } });
      const token = mail.body.match(/coaching\/invite\/([A-Za-z0-9_-]+)/)![1];
      await coach.respondToInviteToken(coachUser.id, token, true);
      const active = await db.coachClientLink.findUniqueOrThrow({ where: { id: link.id } });
      expect(active).toMatchObject({ status: "ACTIVE", coachId: coachUser.id, clientId: emp.id, orgId, shareComments: false });
      // The admin list shows who and the status, nothing else.
      const list = await cc.companyCoaching(owner, orgId);
      expect(list.find((l) => l.id === link.id)).toEqual({ id: link.id, person: expect.any(String), coach: expect.any(String), status: "Active", open: true });
      // Company-paid clients don't count against the coach's own plan.
      expect(await db.coachClientLink.count({ where: { coachId: coachUser.id, orgId: null, status: { in: ["ACTIVE", "PENDING"] } } })).toBe(0);
      // Leaving the company ends the coaching it paid for.
      await org.leaveOrg(emp.id, orgId);
      expect((await db.coachClientLink.findUniqueOrThrow({ where: { id: link.id } })).status).toBe("REVOKED");
    });

    it("an employee can decline", async () => {
      const cc = await import("@/lib/services/company-coaching");
      const owner = (await db.orgMember.findFirstOrThrow({ where: { orgId, role: "OWNER", status: "ACTIVE" } })).userId!;
      const emp = await db.orgMember.findFirstOrThrow({ where: { orgId, status: "ACTIVE", userId: people[0].id } });
      const link = await cc.offerCoaching(owner, orgId, emp.id, `declined-coach-${stamp}@t.local`);
      await cc.respondToCompanyOffer(emp.userId!, link.id, false);
      expect((await db.coachClientLink.findUniqueOrThrow({ where: { id: link.id } })).status).toBe("DECLINED");
      await expect(cc.respondToCompanyOffer(emp.userId!, link.id, true)).rejects.toThrow(/Not found/);
    });
  });

  describe("personal sign-in email", () => {
    it("is verified by the same account, unique, and never a company-SSO address", async () => {
      const pe = await import("@/lib/services/personal-email");
      const u = people[1];
      const address = `me-${stamp}@personal.test`;
      await expect(pe.requestPersonalEmail(u.id, u.email!)).rejects.toThrow(/already your sign-in email/);
      await expect(pe.requestPersonalEmail(u.id, people[0].email!)).rejects.toThrow(/can't be used/);
      await pe.requestPersonalEmail(u.id, address);
      const mail = await db.notification.findFirstOrThrow({ where: { to: address, template: "personal-email-verify" }, orderBy: { createdAt: "desc" } });
      const token = mail.body.match(/personal-email\/([A-Za-z0-9_-]+)/)![1];
      // Only the account that asked can confirm.
      await expect(pe.verifyPersonalEmail(people[0].id, token)).rejects.toThrow(/isn't valid/);
      expect(await pe.verifyPersonalEmail(u.id, token)).toBe(address);
      expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).personalEmail).toBe(address);
      // Nobody else can claim it.
      await expect(pe.requestPersonalEmail(people[0].id, address)).rejects.toThrow(/can't be used/);
      // A domain whose company requires SSO can't be a personal email.
      await db.organization.update({ where: { id: orgId }, data: { ssoDomain: "corp-sso.test", ssoDomainVerifiedAt: new Date(), ssoEnabled: true, ssoRequired: true, ssoIssuer: "https://idp.test", ssoClientId: "x" } });
      await expect(pe.requestPersonalEmail(u.id, `me@corp-sso.test`)).rejects.toThrow(/requires its own sign-in/);
      await db.organization.update({ where: { id: orgId }, data: { ssoDomain: null, ssoDomainVerifiedAt: null, ssoEnabled: false, ssoRequired: false } });
      await pe.removePersonalEmail(u.id);
      expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).personalEmail).toBeNull();
    });
  });
});
