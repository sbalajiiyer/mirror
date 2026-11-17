/** Organizations (Phase 6) against a real database: membership, consent and aggregate-only access. */
import { describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.TEST_DATABASE_URL;
vi.spyOn(console, "info").mockImplementation(() => {});

describe.skipIf(!hasDb)("organizations (integration)", async () => {
  const { db } = await import("@/lib/db");
  const org = await import("@/lib/services/org");
  const svc = await import("@/lib/services/assessments");
  const raters = await import("@/lib/services/raters");
  const { derivedToken } = await import("@/lib/tokens");
  const { syncFramework } = await import("@/lib/frameworks/sync");
  const { CORE_360 } = await import("@/lib/frameworks/core-360");

  const stamp = Date.now();
  const mk = (name: string) => db.user.create({ data: { email: `${name}-${stamp}@test.local`, name, profile: { create: { displayName: name, goals: ["promotion"], onboardedAt: new Date() } } } });
  const admin = await mk("admin");
  const people = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => mk(`emp${i}`)));
  const outsider = await mk("outsider");
  const fw = await syncFramework(db, CORE_360);
  const full = await db.framework.findUniqueOrThrow({ where: { id: fw.id }, include: { competencies: { include: { questions: true } } } });
  const qs = full.competencies.flatMap((c) => c.questions.map((q) => ({ competencyKey: c.key, questionKey: q.key, text: q.text, selfText: q.selfText })));
  let orgId = "";
  let teamId = "";
  let campaignId = "";

  const tokenFor = async (to: string) => (await db.notification.findFirst({ where: { to }, orderBy: { createdAt: "desc" } }))!.body.match(/orgs\/invite\/([A-Za-z0-9_-]+)/)![1];

  it("creates an org with its creator as admin and invites people by a pasted list", async () => {
    orgId = (await org.createOrg(admin.id, "Acme Test")).id;
    const r = await org.inviteMembers(admin.id, orgId, people.map((p) => `${p.name} <${p.email}>`).join("\n") + `\n${people[0].email}`);
    expect(r.added).toHaveLength(6);
    await expect(org.inviteMembers(people[0].id, orgId, "x@y.com")).rejects.toThrow(/Not found/);
    // A forwarded invitation doesn't work for someone else.
    await expect(org.respondOrgInviteToken(outsider.id, await tokenFor(people[0].email!), true)).rejects.toThrow(/different email/);
    for (const p of people) await org.respondOrgInviteToken(p.id, await tokenFor(p.email!), true);
    expect(await db.orgMember.count({ where: { orgId, status: "ACTIVE" } })).toBe(7);
  });

  it("runs a team 360 round: members set up their own 360 on the fixed questionnaire, once", async () => {
    const team = await org.createGroup(admin.id, orgId, "TEAM", "Platform");
    teamId = team.id;
    const members = await db.orgMember.findMany({ where: { orgId, role: "MEMBER" } });
    await org.setGroupMembers(admin.id, orgId, teamId, members.map((m) => m.id));
    campaignId = (await org.createCampaign(admin.id, orgId, { name: "Q1 team 360", groupId: teamId, frameworkId: fw.id, teamMode: true, dueInDays: 14 })).id;
    expect(await db.notification.count({ where: { template: "org-campaign", to: { in: people.map((p) => p.email!) } } })).toBe(6);
    const ctx = await org.campaignContext(people[0].id, campaignId);
    expect(ctx.teammates).toHaveLength(5);
    await expect(org.campaignContext(outsider.id, campaignId)).rejects.toThrow(/isn't for you/);
    expect((await org.memberTasks(people[0].id)).map((t) => t.campaignId)).toContain(campaignId);

    for (const [i, p] of people.entries()) {
      const a = await svc.createAssessment(p.id, {
        title: "Q1 team 360",
        goal: "promotion",
        frameworkId: fw.id,
        questions: qs,
        groups: [{ kind: "PEER", name: "Teammates", shareLink: false, raters: [1, 2, 3].map((k) => ({ name: `R${k}`, email: `r${k}-${i}-${stamp}@t.local` })) }],
        inviteMessage: "Please give me feedback, thank you.",
        dueAt: null,
        minRatersPerGroup: 3,
        showManagerSeparately: false,
        orgCampaignId: campaignId,
      });
      const aq = await db.assessmentQuestion.findMany({ where: { assessmentId: a.id } });
      const ans = (v: number) => ({ ratings: Object.fromEntries(aq.map((q) => [q.id, v])), competencyComments: {}, start: "Keep sharing context early", stop: "", continue: "", general: "", deidentify: false });
      await svc.submitSelfAssessment(p.id, a.id, ans(4));
      await svc.launchAssessment(p.id, a.id);
      for (const inv of await db.raterInvite.findMany({ where: { assessmentId: a.id } })) await raters.submitRaterResponse(derivedToken("invite", inv.id), ans(3 + (i % 2)));
      await svc.closeAssessment(p.id, a.id);
    }
    await expect(
      svc.createAssessment(people[0].id, { title: "again", goal: "promotion", frameworkId: fw.id, questions: qs, groups: [{ kind: "PEER", name: "P", shareLink: false, raters: [] }], inviteMessage: "Please give me feedback, thanks", dueAt: null, minRatersPerGroup: 3, showManagerSeparately: false, orgCampaignId: campaignId }),
    ).rejects.toThrow(/already started/);
    expect((await org.memberTasks(people[0].id)).map((t) => t.campaignId)).not.toContain(campaignId);
  });

  it("gives admins aggregates only, and names people only with consent", async () => {
    const o = await org.orgOverview(admin.id, orgId);
    expect(o.campaigns[0].stats).toMatchObject({ invited: 6, started: 6, closed: 6 });
    expect(o.profile.available).toBe(true);
    let t = await org.teamAnalytics(admin.id, orgId, teamId);
    expect(t.heatmap.rows.map((r) => r.label)).toEqual(["Whole team (6)"]);
    const m0 = await db.orgMember.findFirstOrThrow({ where: { orgId, userId: people[0].id } });
    const a0 = await db.assessment.findFirstOrThrow({ where: { subjectId: people[0].id, orgCampaignId: campaignId } });
    await expect(org.adminMemberReport(admin.id, orgId, m0.id, a0.id)).rejects.toThrow(/hasn't shared/);
    await org.updateConsent(people[0].id, orgId, { shareReports: true, shareTalentGrid: true });
    t = await org.teamAnalytics(admin.id, orgId, teamId);
    expect(t.heatmap.rows.map((r) => r.label)).toEqual(["emp1", "Others (5)"]);
    const r = await org.adminMemberReport(admin.id, orgId, m0.id, a0.id);
    expect(JSON.stringify(r.report)).not.toContain("Keep sharing context early");
    // Admins can't change someone's consent, and non-admins can't see analytics.
    await expect(org.teamAnalytics(people[1].id, orgId, teamId)).rejects.toThrow(/Only people who can see organization results/);
    await expect(org.orgOverview(outsider.id, orgId)).rejects.toThrow(/Not found/);
  });

  it("personal 360s never count for the org", async () => {
    const before = (await org.orgOverview(admin.id, orgId)).profile.people;
    const personal = await svc.createAssessment(people[1].id, { title: "Mine", goal: "promotion", frameworkId: fw.id, questions: qs, groups: [{ kind: "PEER", name: "P", shareLink: false, raters: [] }], inviteMessage: "Please give me feedback, thanks", dueAt: null, minRatersPerGroup: 3, showManagerSeparately: false });
    expect(personal.orgCampaignId ?? null).toBeNull();
    expect((await org.orgOverview(admin.id, orgId)).profile.people).toBe(before);
  });

  it("talent grid lists only consenting people, with admin-entered performance", async () => {
    const m0 = await db.orgMember.findFirstOrThrow({ where: { orgId, userId: people[0].id } });
    let g = await org.talentGrid(admin.id, orgId);
    expect(g.consenting.map((c) => c.id)).toEqual([m0.id]);
    expect(g.grid.unplaced[0].reason).toMatch(/performance/);
    await org.setPerformance(admin.id, orgId, m0.id, 3);
    await expect(org.setPerformance(admin.id, orgId, m0.id, 5)).rejects.toThrow(/low, medium or high/);
    g = await org.talentGrid(admin.id, orgId);
    expect(g.grid.cells.flatMap((c) => c.members).map((m) => m.memberId)).toEqual([m0.id]);
  });

  it("protects the last owner and stops access when someone leaves", async () => {
    const adminMember = await db.orgMember.findFirstOrThrow({ where: { orgId, userId: admin.id } });
    expect(adminMember.role).toBe("OWNER");
    await expect(org.setRole(admin.id, orgId, adminMember.id, "MEMBER")).rejects.toThrow(/at least one owner/);
    await expect(org.leaveOrg(admin.id, orgId)).rejects.toThrow(/someone else an owner/);
    await org.leaveOrg(people[0].id, orgId);
    const m0 = await db.orgMember.findFirstOrThrow({ where: { orgId, userId: people[0].id } });
    expect(m0).toMatchObject({ status: "REMOVED", shareReports: false, shareTalentGrid: false });
    const a0 = await db.assessment.findFirstOrThrow({ where: { subjectId: people[0].id, orgCampaignId: campaignId } });
    await expect(org.adminMemberReport(admin.id, orgId, m0.id, a0.id)).rejects.toThrow(/Not found/);
    expect((await org.teamAnalytics(admin.id, orgId, teamId)).withResults).toBe(5);
  });
});
