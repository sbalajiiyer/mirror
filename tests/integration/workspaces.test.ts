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
    expect((await ws.listWorkspaces(admin.id))[1]).toMatchObject({ kind: "COMPANY", role: "ADMIN", orgId });
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
      expect(await leaving.purgeExits(new Date(Date.now() + 8 * DAY))).toBe(2);
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
      expect(await leaving.purgeExits(new Date(Date.now() + 8 * DAY))).toBe(0);
      expect(await db.assessment.count({ where: { subjectId: people[4].id, workspaceId: companyWs } })).toBe(1);
    });
  });
});
