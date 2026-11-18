/** Coach workspace (Phase 5) against a real database: consent, sharing scopes and privacy. */
import { describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.TEST_DATABASE_URL;
vi.spyOn(console, "info").mockImplementation(() => {});

describe.skipIf(!hasDb)("coach workspace (integration)", async () => {
  const { db } = await import("@/lib/db");
  const coach = await import("@/lib/services/coach");
  const { syncFramework } = await import("@/lib/frameworks/sync");
  const { CORE_360 } = await import("@/lib/frameworks/core-360");
  const svc = await import("@/lib/services/assessments");
  const raters = await import("@/lib/services/raters");
  const { derivedToken } = await import("@/lib/tokens");
  const { frameworksForUser, assertCanUseFramework, saveCustomFramework } = await import("@/lib/services/frameworks");

  const stamp = Date.now();
  const mk = async (name: string) =>
    db.user.create({ data: { email: `${name}-${stamp}@test.local`, name, profile: { create: { displayName: name, goals: ["promotion"], onboardedAt: new Date() } } } });
  const coachU = await mk("coachy");
  const client = await mk("clienty");
  const stranger = await mk("strangy");
  const outboxToken = async (to: string) => {
    const n = await db.notification.findFirst({ where: { to }, orderBy: { createdAt: "desc" } });
    return n!.body.match(/coaching\/invite\/([A-Za-z0-9_-]+)/)![1];
  };

  // A closed 360 with comments for the client.
  const fw = await syncFramework(db, CORE_360);
  const full = await db.framework.findUniqueOrThrow({ where: { id: fw.id }, include: { competencies: { include: { questions: true } } } });
  const qs = full.competencies.flatMap((c) => c.questions.map((q) => ({ competencyKey: c.key, questionKey: q.key, text: q.text, selfText: q.selfText })));
  const a = await svc.createAssessment(client.id, {
    title: "Client 360",
    goal: "promotion",
    frameworkId: fw.id,
    questions: qs,
    groups: [{ kind: "PEER", name: "Peers", shareLink: false, raters: [1, 2, 3, 4, 5].map((i) => ({ name: `P${i}`, email: `p${i}-${stamp}@t.local` })) }],
    inviteMessage: "Please give me feedback, thank you.",
    dueAt: null,
    minRatersPerGroup: 3,
    showManagerSeparately: false,
  });
  const answers = async (v: number, comment = "") => {
    const aq = await db.assessmentQuestion.findMany({ where: { assessmentId: a.id } });
    return { ratings: Object.fromEntries(aq.map((q) => [q.id, v])), competencyComments: {}, start: comment, stop: "", continue: "", general: "", deidentify: false };
  };
  await svc.submitSelfAssessment(client.id, a.id, await answers(4));
  await svc.launchAssessment(client.id, a.id);
  for (const inv of await db.raterInvite.findMany({ where: { assessmentId: a.id } })) await raters.submitRaterResponse(derivedToken("invite", inv.id), await answers(3, "Start sharing the roadmap with the whole team earlier"));
  await svc.closeAssessment(client.id, a.id);

  it("needs a coach profile to invite clients, and an invitation only works for the invited address", async () => {
    await expect(coach.inviteClient(coachU.id, client.email!)).rejects.toThrow(/coach profile/);
    await coach.saveCoachProfile(coachU.id, { displayName: "Coachy", brandName: "Coachy & Co", brandColor: "#0f766e" });
    await coach.inviteClient(coachU.id, client.email!.toUpperCase());
    await expect(coach.inviteClient(coachU.id, client.email!)).rejects.toThrow(/already waiting/);
    const token = await outboxToken(client.email!);
    expect(await coach.inviteByToken(token)).toMatchObject({ from: "Coachy", youAre: "client" });
    // Before accepting, the coach sees nothing.
    await expect(coach.clientDetail(coachU.id, client.id)).rejects.toThrow(/not found/i);
    // A forwarded link doesn't work for someone else.
    await expect(coach.respondToInviteToken(stranger.id, token, true)).rejects.toThrow(/Sign in with that address/);
    await coach.respondToInviteToken(client.id, token, true);
    expect(await coach.inviteByToken(token)).toBeNull(); // single use
  });

  it("shows shared reports without verbatim comments unless the client shares them", async () => {
    const r1 = await coach.coachReport(coachU.id, client.id, a.id);
    expect(r1.report.summary.overallOthers).toBeGreaterThan(0);
    expect(JSON.stringify(r1.report)).not.toContain("roadmap with the whole team");
    expect((r1.report as { commentsHidden?: boolean }).commentsHidden).toBe(true);
    const link = await db.coachClientLink.findFirstOrThrow({ where: { coachId: coachU.id, clientId: client.id } });
    await coach.updateSharing(client.id, link.id, { shareReports: true, shareComments: true, shareGoals: true, sharePlan: false, showBranding: true });
    const r2 = await coach.coachReport(coachU.id, client.id, a.id);
    expect(JSON.stringify(r2.report)).toContain("roadmap with the whole team");
    // The coach can't change what is shared.
    await expect(coach.updateSharing(coachU.id, link.id, { shareReports: true, shareComments: true, shareGoals: true, sharePlan: true, showBranding: true })).rejects.toThrow(/not found/i);
  });

  it("respects each sharing switch, and comments can't be shared without reports", async () => {
    const link = await db.coachClientLink.findFirstOrThrow({ where: { coachId: coachU.id, clientId: client.id } });
    await coach.updateSharing(client.id, link.id, { shareReports: false, shareComments: true, shareGoals: false, sharePlan: false, showBranding: false });
    expect((await db.coachClientLink.findUniqueOrThrow({ where: { id: link.id } })).shareComments).toBe(false);
    await expect(coach.coachReport(coachU.id, client.id, a.id)).rejects.toThrow(/hasn't shared/);
    const d = await coach.clientDetail(coachU.id, client.id);
    expect(d.sharedCount).toBe(0);
    expect(d.goals).toBeNull();
    expect(d.sessions[0].shared).toBe(false);
    const brief = await coach.sessionPrep(coachU.id, client.id);
    expect(brief.basedOn).toBeNull();
    expect(await coach.brandingForClient(client.id)).toBeNull();
    await coach.updateSharing(client.id, link.id, { shareReports: true, shareComments: false, shareGoals: true, sharePlan: false, showBranding: true });
    expect(await coach.brandingForClient(client.id)).toMatchObject({ name: "Coachy & Co", color: "#0f766e" });
    const prep = await coach.sessionPrep(coachU.id, client.id);
    expect(prep.basedOn?.raters).toBe(5);
    expect(prep.questions.length).toBeGreaterThan(0);
  });

  it("keeps notes private to the coach and lets the client use the coach's questionnaires", async () => {
    await coach.addNote(coachU.id, client.id, "Prefers async check-ins");
    await expect(coach.addNote(stranger.id, client.id, "x")).rejects.toThrow(/not found/i);
    const note = await db.coachNote.findFirstOrThrow({ where: { coachId: coachU.id } });
    await expect(coach.deleteNote(client.id, note.id)).rejects.toThrow(/not found/i);
    const fwId = await saveCustomFramework(coachU.id, {
      name: "Coachy leadership",
      competencies: [{ name: "Direction", questions: [1, 2, 3, 4, 5].map((i) => ({ text: `{name} sets direction ${i}`, selfText: `I set direction ${i}` })) }],
    });
    expect((await frameworksForUser(client.id)).find((f) => f.id === fwId)?.sharedBy).toBe("Coachy");
    await assertCanUseFramework(client.id, fwId);
    await expect(assertCanUseFramework(stranger.id, fwId)).rejects.toThrow(/Unknown framework/);
  });

  it("portfolio lists the client; ending the link removes access immediately", async () => {
    const p = await coach.portfolio(coachU.id);
    expect(p.clients.map((c) => c.clientId)).toContain(client.id);
    const link = await db.coachClientLink.findFirstOrThrow({ where: { coachId: coachU.id, clientId: client.id, status: "ACTIVE" } });
    await expect(coach.endLink(stranger.id, link.id)).rejects.toThrow(/not found/i);
    await coach.endLink(client.id, link.id);
    await expect(coach.clientDetail(coachU.id, client.id)).rejects.toThrow(/not found/i);
    await expect(coach.coachReport(coachU.id, client.id, a.id)).rejects.toThrow(/not found/i);
    expect(await coach.brandingForClient(client.id)).toBeNull();
    expect((await coach.portfolio(coachU.id)).clients.map((c) => c.clientId)).not.toContain(client.id);
  });

  it("a client can invite a coach; accepting creates the coach's profile", async () => {
    const newCoach = await mk("newcoach");
    await coach.inviteCoach(client.id, newCoach.email!);
    const reqs = await coach.coachRequests(newCoach.id);
    expect(reqs[0].from).toBe("clienty");
    await coach.respondToInvite(newCoach.id, reqs[0].id, true);
    expect(await coach.getCoachProfile(newCoach.id)).not.toBeNull();
    expect((await coach.clientDetail(newCoach.id, client.id)).client.id).toBe(client.id);
  });

  it("cross-client analytics stay hidden below five clients", async () => {
    const x = await coach.crossClientAnalytics(coachU.id);
    expect(x.available).toBe(false);
    expect(x.blindSpots).toEqual([]);
    expect(x.distribution).toEqual([]);
  });
});
