/**
 * Server-side rules, exercised against a real Postgres (TEST_DATABASE_URL).
 * Skipped when no test database is configured.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.TEST_DATABASE_URL;
vi.spyOn(console, "info").mockImplementation(() => {});

describe.skipIf(!hasDb)("assessment lifecycle (integration)", async () => {
  const { db } = await import("@/lib/db");
  const { syncFramework } = await import("@/lib/frameworks/sync");
  const svc = await import("@/lib/services/assessments");
  const raters = await import("@/lib/services/raters");
  const { getReportForOwner } = await import("@/lib/services/reports");
  const { derivedToken } = await import("@/lib/tokens");

  let userId = "";
  let otherUserId = "";
  let assessmentId = "";
  const email = `int-${Date.now()}@test.local`;

  beforeAll(async () => {
    const fw = await syncFramework(db);
    const full = await db.framework.findUniqueOrThrow({ where: { id: fw.id }, include: { competencies: { include: { questions: true } } } });
    userId = (await db.user.create({ data: { email, name: "Test Subject", profile: { create: { displayName: "Test Subject", goals: ["promotion"], onboardedAt: new Date() } } } })).id;
    otherUserId = (await db.user.create({ data: { email: `other-${email}` } })).id;
    const questions = full.competencies.slice(0, 2).flatMap((c) => c.questions.map((q) => ({ competencyKey: c.key, questionKey: q.key, text: q.text, selfText: q.selfText })));
    const a = await svc.createAssessment(userId, {
      title: "Integration 360",
      goal: "promotion",
      frameworkId: fw.id,
      questions,
      groups: [{ kind: "PEER", name: "Peers", shareLink: false, raters: [1, 2, 3, 4].map((i) => ({ name: `P${i}`, email: `p${i}-${email}` })) }],
      inviteMessage: "Please give me feedback, thank you!",
      dueAt: null,
      minRatersPerGroup: 1, // must be raised to the floor of 3
      showManagerSeparately: false,
    });
    assessmentId = a.id;
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await db.$disconnect();
  });

  const allRatings = async (v: number | null) => {
    const qs = await db.assessmentQuestion.findMany({ where: { assessmentId } });
    return { ratings: Object.fromEntries(qs.map((q) => [q.id, v])), competencyComments: {}, start: "", stop: "", continue: "", general: "" };
  };
  const tokens = async () => (await db.raterInvite.findMany({ where: { assessmentId }, orderBy: { email: "asc" } })).map((i) => derivedToken("invite", i.id));

  it("raises the minimum raters to the floor of 3", async () => {
    expect((await db.assessment.findUniqueOrThrow({ where: { id: assessmentId } })).minRatersPerGroup).toBe(3);
  });

  it("refuses to launch before the self-assessment is locked, and raters can't respond yet", async () => {
    await expect(svc.launchAssessment(userId, assessmentId)).rejects.toThrow(/self-assessment/i);
    const [t] = await tokens();
    expect((await raters.getRaterContext(t)).state).toBe("not_open");
  });

  it("locks the self-assessment after one submission", async () => {
    await svc.submitSelfAssessment(userId, assessmentId, await allRatings(4));
    await expect(svc.submitSelfAssessment(userId, assessmentId, await allRatings(5))).rejects.toThrow(/locked/i);
    expect(await db.submission.count({ where: { assessmentId, isSelf: true } })).toBe(1);
  });

  it("does not let another user act on the assessment", async () => {
    await expect(svc.launchAssessment(otherUserId, assessmentId)).rejects.toThrow(/not found/i);
    expect((await getReportForOwner(otherUserId, assessmentId)).status).toBe("not_found");
  });

  it("sends invites on launch", async () => {
    const r = await svc.launchAssessment(userId, assessmentId);
    expect(r.sent).toBe(4);
    expect(await db.notification.count({ where: { template: "rater-invite", to: { endsWith: email } } })).toBe(4);
  });

  it("saves drafts and stores submissions with no link back to the rater", async () => {
    const [t1, t2] = await tokens();
    await raters.saveDraft(t1, { ...(await allRatings(3)), step: 2 });
    const ctx = await raters.getRaterContext(t1);
    expect(ctx.state === "open" && ctx.draft?.step).toBe(2);
    await raters.submitRaterResponse(t1, await allRatings(3));
    await raters.submitRaterResponse(t2, await allRatings(2));
    await expect(raters.submitRaterResponse(t1, await allRatings(5))).rejects.toThrow(/already/i);
    const invite = await db.raterInvite.findFirstOrThrow({ where: { tokenHash: { not: "" }, assessmentId, status: "SUBMITTED" } });
    expect(invite.draft).toBeNull();
    const cols = Object.keys((await db.submission.findFirstOrThrow({ where: { assessmentId, isSelf: false } })) as object);
    expect(cols.some((c) => /invite|email|ip|agent/i.test(c))).toBe(false);
  });

  it("rejects out-of-range ratings and unknown questions", async () => {
    const [, , t3] = await tokens();
    const bad = await allRatings(3);
    bad.ratings[Object.keys(bad.ratings)[0]] = 9;
    await expect(raters.submitRaterResponse(t3, bad)).rejects.toThrow();
    await expect(raters.submitRaterResponse(t3, { ...(await allRatings(3)), ratings: { nope: 3 } })).rejects.toThrow();
  });

  it("serves no report data while collecting", async () => {
    expect((await getReportForOwner(userId, assessmentId)).status).toBe("not_closed");
  });

  it("closes with too few responses → report unavailable, and can be reopened", async () => {
    await svc.closeAssessment(userId, assessmentId);
    const r = await getReportForOwner(userId, assessmentId);
    expect(r.status === "ok" && r.report.anonymity.available).toBe(false);
    expect(r.status === "ok" && r.report.competencies).toEqual([]);
    await svc.reopenAssessment(userId, assessmentId);
  });

  it("produces a report once enough people respond, and then can't be reopened", async () => {
    const [, , t3] = await tokens();
    await raters.submitRaterResponse(t3, await allRatings(5));
    await svc.closeAssessment(userId, assessmentId);
    const r = await getReportForOwner(userId, assessmentId);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.report.anonymity.available).toBe(true);
    expect(r.report.anonymity.othersN).toBe(3);
    expect(r.report.competencies[0].others.mean).toBeCloseTo((3 + 2 + 5) / 3, 2);
    expect(JSON.stringify(r.report)).not.toContain(email);
    await expect(svc.reopenAssessment(userId, assessmentId)).rejects.toThrow(/can't be reopened/);
    const [, , , t4] = await tokens();
    expect((await raters.getRaterContext(t4)).state).toBe("closed");
  });
});
