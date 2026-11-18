/** Survey re-runs and session numbering against a real database. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.TEST_DATABASE_URL;
vi.spyOn(console, "info").mockImplementation(() => {});

describe.skipIf(!hasDb)("survey sessions (integration)", async () => {
  const { db } = await import("@/lib/db");
  const { syncFramework } = await import("@/lib/frameworks/sync");
  const svc = await import("@/lib/services/assessments");
  const raters = await import("@/lib/services/raters");
  const sessions = await import("@/lib/services/sessions");
  const pulses = await import("@/lib/services/pulses");
  const { derivedToken } = await import("@/lib/tokens");
  const { surveyCode } = await import("@/lib/survey");

  const email = `sess-${Date.now()}@test.local`;
  let userId = "";
  let otherId = "";
  let rootId = "";

  const answers = async (id: string, v: number) => {
    const qs = await db.assessmentQuestion.findMany({ where: { assessmentId: id } });
    return { ratings: Object.fromEntries(qs.map((q) => [q.id, v])), competencyComments: {}, start: "", stop: "", continue: "", general: "", deidentify: false };
  };
  async function runToClose(id: string, value: number) {
    await svc.submitSelfAssessment(userId, id, await answers(id, 4));
    await svc.launchAssessment(userId, id);
    const invs = await db.raterInvite.findMany({ where: { assessmentId: id } });
    for (const inv of invs) await raters.submitRaterResponse(derivedToken("invite", inv.id), await answers(id, value));
    await svc.closeAssessment(userId, id);
  }

  beforeAll(async () => {
    const fw = await syncFramework(db);
    const full = await db.framework.findUniqueOrThrow({ where: { id: fw.id }, include: { competencies: { include: { questions: true } } } });
    userId = (await db.user.create({ data: { email, name: "Sam Lee", profile: { create: { displayName: "Sam Lee", goals: ["promotion"], onboardedAt: new Date() } } } })).id;
    otherId = (await db.user.create({ data: { email: `o-${email}` } })).id;
    const a = await svc.createAssessment(userId, {
      title: "Sessions 360",
      goal: "promotion",
      frameworkId: fw.id,
      questions: full.competencies.slice(0, 2).flatMap((c) => c.questions.map((q) => ({ competencyKey: c.key, questionKey: q.key, text: q.text, selfText: q.selfText }))),
      groups: [{ kind: "PEER", name: "Peers", shareLink: false, raters: [1, 2, 3, 4, 5].map((i) => ({ name: `R${i}`, email: `r${i}-${email}` })) }],
      inviteMessage: "Please give me feedback, thank you!",
      dueAt: null,
      minRatersPerGroup: 3,
      showManagerSeparately: false,
    });
    rootId = a.id;
    await runToClose(rootId, 2);
  });
  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { in: [email, `o-${email}`] } } });
    await db.$disconnect();
  });

  it("gives every survey a stable, readable ID", () => {
    expect(surveyCode(rootId)).toMatch(/^MRR-[A-HJ-NP-Z2-9]{6}$/);
    expect(surveyCode(rootId)).toBe(surveyCode(rootId));
  });

  it("re-runs the survey as session 2 with the identical questionnaire and the same raters", async () => {
    const root = await db.assessment.findUniqueOrThrow({ where: { id: rootId }, include: { questions: true, invites: true } });
    expect(root.sessionNumber).toBe(1);
    await expect(sessions.rerunSurvey(otherId, rootId, {})).rejects.toThrow(/not found/i);
    const s2 = await sessions.rerunSurvey(userId, rootId, { sessionLabel: "Spring", reuseRaters: true });
    const full2 = await db.assessment.findUniqueOrThrow({ where: { id: s2.id }, include: { questions: true, invites: true } });
    expect(full2).toMatchObject({ type: "FULL_360", rootAssessmentId: rootId, sessionNumber: 2, sessionLabel: "Spring", title: "Sessions 360", status: "DRAFT" });
    const keys = (qs: { competencyKey: string; questionKey: string | null; text: string }[]) => qs.map((q) => `${q.competencyKey}.${q.questionKey}|${q.text}`).sort();
    expect(keys(full2.questions)).toEqual(keys(root.questions));
    expect(full2.invites.map((i) => i.email).sort()).toEqual(root.invites.map((i) => i.email).sort());
    expect(full2.invites.some((i) => root.invites.some((r) => r.tokenHash === i.tokenHash))).toBe(false);
  });

  it("allows only one open session per survey", async () => {
    await expect(sessions.rerunSurvey(userId, rootId, {})).rejects.toThrow(/in progress/);
    const qs = await db.assessmentQuestion.findMany({ where: { assessmentId: rootId } });
    await expect(pulses.createPulse(userId, rootId, { questionIds: qs.slice(0, 5).map((q) => q.id) })).rejects.toThrow(/in progress/);
  });

  it("numbers later sessions in order, across re-runs and pulses", async () => {
    const s2 = await db.assessment.findFirstOrThrow({ where: { rootAssessmentId: rootId, sessionNumber: 2 } });
    await runToClose(s2.id, 4);
    // Re-running from session 2 still uses the root questionnaire and the next number.
    const qs = await db.assessmentQuestion.findMany({ where: { assessmentId: s2.id }, orderBy: { order: "asc" } });
    await sessions.updateSessionDetails(userId, s2.id, { company: "Acme Corp", tags: "Promotion, new team, promotion" });
    const p = await pulses.createPulse(userId, s2.id, { questionIds: qs.slice(0, 5).map((q) => q.id) });
    const pulse = await db.assessment.findUniqueOrThrow({ where: { id: p.id } });
    expect(pulse.sessionNumber).toBe(3);
    // A new session carries over the company and tags of the one it was started from.
    expect(pulse.company).toBe("Acme Corp");
    expect(pulse.tags).toEqual(["promotion", "new team"]);
    expect(pulse.title).toMatch(/· S3 Pulse check$/);
  });

  it("renames a session (owner only) and exposes session info", async () => {
    const s2 = await db.assessment.findFirstOrThrow({ where: { rootAssessmentId: rootId, sessionNumber: 2 } });
    await sessions.renameSession(userId, s2.id, "After the reorg");
    await expect(sessions.renameSession(otherId, s2.id, "x")).rejects.toThrow(/not found/i);
    expect(await sessions.sessionInfo(s2.id)).toEqual({
      code: surveyCode(rootId),
      sessionNumber: 2,
      kind: "Full 360",
      label: "After the reorg",
      company: "Acme Corp",
      tags: ["promotion", "new team"],
    });
  });

  it("edits company and tags (owner only) and lists sessions for grouping", async () => {
    const s2 = await db.assessment.findFirstOrThrow({ where: { rootAssessmentId: rootId, sessionNumber: 2 } });
    await expect(sessions.updateSessionDetails(otherId, s2.id, { company: "x" })).rejects.toThrow(/not found/i);
    await sessions.updateSessionDetails(userId, s2.id, { company: "" }); // clearing
    expect((await db.assessment.findUniqueOrThrow({ where: { id: s2.id } })).company).toBeNull();
    const list = await sessions.groupableSessions(userId);
    expect(list.map((x) => x.sessionNumber).sort()).toEqual([1, 2, 3]);
    const g2 = list.find((x) => x.id === s2.id)!;
    expect(g2.rootId).toBe(rootId);
    expect(g2.score).toBeGreaterThan(0); // closed with enough raters, so the report is visible
    expect(g2.label).toBe("After the reorg");
    expect(list.find((x) => x.sessionNumber === 3)!.score).toBeNull(); // still open
  });
});
