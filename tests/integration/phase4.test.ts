/**
 * Phase 4 against a real database: custom questionnaires, paid AI generation (credits),
 * pulses, pulse reminders and goals. AI HTTP calls are stubbed.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.TEST_DATABASE_URL;
vi.spyOn(console, "info").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

const groq = (content: unknown, status = 200) =>
  vi.fn(async () =>
    new Response(JSON.stringify(status === 200 ? { choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 500, completion_tokens: 900 } } : {}), { status }),
  );

const section = (name: string, n = 3) => ({
  name,
  description: `${name} things`,
  questions: Array.from({ length: n }, (_, i) => ({ text: `{name} does ${name.toLowerCase()} thing ${i + 1}.`, selfText: `I do ${name.toLowerCase()} thing ${i + 1}.` })),
});

describe.skipIf(!hasDb)("Phase 4 (integration)", async () => {
  const { db } = await import("@/lib/db");
  const fw = await import("@/lib/services/frameworks");
  const svc = await import("@/lib/services/assessments");
  const raters = await import("@/lib/services/raters");
  const pulses = await import("@/lib/services/pulses");
  const goals = await import("@/lib/services/goals");
  const { grantCredits, creditBalance } = await import("@/lib/services/credits");
  const { runPulseReminders } = await import("@/lib/jobs/reminders");
  const { derivedToken } = await import("@/lib/tokens");

  const realFetch = globalThis.fetch;
  const stamp = Date.now();
  const email = `p4-${stamp}@test.local`;
  let userId = "";
  let otherId = "";
  let customId = "";
  let closedId = "";

  const mkUser = async (e: string, name: string) =>
    (await db.user.create({ data: { email: e, name, profile: { create: { displayName: name, goals: ["promotion"], onboardedAt: new Date() } } } })).id;

  const answersFor = async (assessmentId: string, v: number) => {
    const qs = await db.assessmentQuestion.findMany({ where: { assessmentId } });
    return { ratings: Object.fromEntries(qs.map((q) => [q.id, v])), competencyComments: {}, start: "", stop: "", continue: "", general: "", deidentify: false };
  };

  beforeAll(async () => {
    process.env.GROQ_API_KEY = "gsk_test";
    userId = await mkUser(email, "Robin Quinn");
    otherId = await mkUser(`other-${email}`, "Other Person");
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { in: [email, `other-${email}`] } } });
    delete process.env.GROQ_API_KEY;
    await db.$disconnect();
  });

  it("saves, edits and lists a free custom questionnaire", async () => {
    customId = await fw.saveCustomFramework(userId, { name: "Founder 360", competencies: [section("Vision"), section("Hiring")] });
    const v = await fw.getOwnFramework(userId, customId);
    expect(v.source).toBe("custom");
    expect(v.competencies.map((c) => c.key)).toEqual(["vision", "hiring"]);
    await fw.saveCustomFramework(userId, { name: "Founder 360 v2", competencies: [section("Vision", 2), section("Hiring"), section("Fundraising", 2)] }, customId);
    const v2 = await fw.getOwnFramework(userId, customId);
    expect(v2.name).toBe("Founder 360 v2");
    expect(v2.competencies).toHaveLength(3);
    const list = await fw.frameworksForUser(userId);
    expect(list[0].source).toBe("builtin");
    expect(list.some((f) => f.id === customId)).toBe(true);
    expect((await fw.frameworksForUser(otherId)).some((f) => f.id === customId)).toBe(false);
  });

  it("doesn't let another user read, edit or build a 360 from someone's questionnaire", async () => {
    await expect(fw.getOwnFramework(otherId, customId)).rejects.toThrow(/not found/i);
    await expect(fw.saveCustomFramework(otherId, { name: "Hijack", competencies: [section("Xy", 5)] }, customId)).rejects.toThrow(/not found/i);
    await expect(
      svc.createAssessment(otherId, {
        title: "x",
        goal: "promotion",
        frameworkId: customId,
        questions: [{ competencyKey: "vision", questionKey: "q1", text: "{name} does it", selfText: "I do it" }].concat(Array(4).fill({ competencyKey: "vision", questionKey: "q2", text: "{name} does it", selfText: "I do it" })),
        groups: [{ kind: "PEER", name: "Peers", shareLink: true, raters: [] }],
        inviteMessage: "hello there everyone",
        dueAt: null,
        minRatersPerGroup: 3,
        showManagerSeparately: false,
      }),
    ).rejects.toThrow(/unknown framework/i);
  });

  it("refuses AI generation without credits and doesn't call the AI", async () => {
    const f = groq({});
    globalThis.fetch = f as unknown as typeof fetch;
    await expect(fw.generateAIFramework(userId, { purpose: "I lead a design team and want feedback on critique sessions." })).rejects.toThrow(/need 1 credit/);
    expect(f).not.toHaveBeenCalled();
  });

  it("charges exactly 1 credit for a successful AI questionnaire and records it", async () => {
    await grantCredits(userId, 2);
    globalThis.fetch = groq({ name: "Design lead 360", description: "Critique and craft.", competencies: [section("Critique", 3), section("Craft", 3)] }) as unknown as typeof fetch;
    const r = await fw.generateAIFramework(userId, { purpose: "I lead a design team and want feedback on critique sessions.", sections: 3, perSection: 3 });
    expect(r.generatedBy).toBe("ai");
    expect(await creditBalance(userId)).toBe(1);
    const saved = await fw.getOwnFramework(userId, r.frameworkId);
    expect(saved.source).toBe("ai");
    const ledger = await db.creditLedger.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    expect(ledger.map((l) => [l.delta, l.reason])).toEqual([
      [2, "grant"],
      [-1, "ai_questionnaire"],
    ]);
    expect(ledger[1].ref).toBe(r.frameworkId);
  });

  it("doesn't charge when the AI fails or returns an unusable questionnaire", async () => {
    globalThis.fetch = groq({}, 500) as unknown as typeof fetch;
    await expect(fw.generateAIFramework(userId, { purpose: "I lead a design team and want feedback on critique sessions." })).rejects.toThrow(/not charged/);
    globalThis.fetch = groq({ name: "Tiny", description: "x", competencies: [section("Ab", 1), section("Cd", 1)] }) as unknown as typeof fetch;
    await expect(fw.generateAIFramework(userId, { purpose: "I lead a design team and want feedback on critique sessions." })).rejects.toThrow(/at least 5 statements/);
    expect(await creditBalance(userId)).toBe(1);
  });

  it("can't spend the same credit twice in parallel", async () => {
    globalThis.fetch = (async () => groq({ name: "Parallel 360", description: "x", competencies: [section("Alpha"), section("Beta")] })()) as unknown as typeof fetch;
    const brief = { purpose: "I lead a design team and want feedback on critique sessions." };
    const results = await Promise.allSettled([fw.generateAIFramework(userId, brief), fw.generateAIFramework(userId, brief)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await creditBalance(userId)).toBe(0);
  });

  it("runs a 360 on a custom questionnaire, then a pulse with the same raters", async () => {
    const custom = await fw.getOwnFramework(userId, customId);
    const a = await svc.createAssessment(userId, {
      title: "Founder 360",
      goal: "leadership_growth",
      frameworkId: customId,
      questions: custom.competencies.flatMap((c) => c.questions.map((q) => ({ competencyKey: c.key, questionKey: q.key, text: q.text, selfText: q.selfText }))),
      groups: [{ kind: "PEER", name: "Peers", shareLink: false, raters: [1, 2, 3, 4].map((i) => ({ name: `P${i}`, email: `p${i}-${email}` })) }],
      inviteMessage: "Please give me feedback, thank you!",
      dueAt: null,
      minRatersPerGroup: 3,
      showManagerSeparately: false,
    });
    closedId = a.id;
    await svc.submitSelfAssessment(userId, a.id, await answersFor(a.id, 4));
    await svc.launchAssessment(userId, a.id);
    const invs = await db.raterInvite.findMany({ where: { assessmentId: a.id }, orderBy: { email: "asc" } });
    await raters.declineInvite(derivedToken("invite", invs[3].id));
    for (const inv of invs.slice(0, 3)) await raters.submitRaterResponse(derivedToken("invite", inv.id), await answersFor(a.id, 2));
    await svc.closeAssessment(userId, a.id);

    const qs = await db.assessmentQuestion.findMany({ where: { assessmentId: a.id }, orderBy: { order: "asc" } });
    await expect(pulses.createPulse(userId, a.id, { questionIds: qs.slice(0, 4).map((q) => q.id) })).rejects.toThrow(/at least 5/);
    await expect(pulses.createPulse(otherId, a.id, { questionIds: qs.slice(0, 5).map((q) => q.id) })).rejects.toThrow();
    const p = await pulses.createPulse(userId, a.id, { questionIds: qs.slice(0, 6).map((q) => q.id), reuseRaters: true, cadenceMonths: 1 });

    const pulse = await db.assessment.findUniqueOrThrow({ where: { id: p.id }, include: { questions: true, invites: true } });
    expect(pulse).toMatchObject({ type: "PULSE", rootAssessmentId: a.id, status: "DRAFT" });
    expect(pulse.questions.map((q) => q.questionKey).sort()).toEqual(qs.slice(0, 6).map((q) => q.questionKey).sort());
    // Same raters except the one who declined, with brand-new tokens.
    expect(pulse.invites.map((i) => i.email).sort()).toEqual(invs.slice(0, 3).map((i) => i.email).sort());
    const oldHashes = new Set(invs.map((i) => i.tokenHash));
    expect(pulse.invites.every((i) => !oldHashes.has(i.tokenHash) && i.status === "INVITED")).toBe(true);
    expect((await db.assessment.findUniqueOrThrow({ where: { id: a.id } })).cadenceMonths).toBe(1);

    // Self first, then launch schedules the next pulse a month out and sends pulse-worded invites.
    await expect(svc.launchAssessment(userId, p.id)).rejects.toThrow(/self-assessment/i);
    await svc.submitSelfAssessment(userId, p.id, await answersFor(p.id, 4));
    await svc.launchAssessment(userId, p.id);
    const root = await db.assessment.findUniqueOrThrow({ where: { id: a.id } });
    const days = (+root.nextPulseDueAt! - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
    const mail = await db.notification.findFirstOrThrow({ where: { to: invs[0].email!, template: "rater-invite-pulse" } });
    expect(mail.subject).toMatch(/Quick check-in/);
    expect(mail.body).toMatch(/about 2 minutes/);
  });

  it("emails the subject once when a pulse is due", async () => {
    await db.assessment.update({ where: { id: closedId }, data: { nextPulseDueAt: new Date(Date.now() - 1000), pulseReminderSentAt: null } });
    const first = await runPulseReminders();
    expect(first.sent).toBeGreaterThanOrEqual(1);
    const mail = await db.notification.findFirstOrThrow({ where: { to: email, template: "pulse-due" }, orderBy: { createdAt: "desc" } });
    expect(mail.body).toContain(`/assessments/${closedId}/pulse/new`);
    const again = await db.notification.count({ where: { to: email, template: "pulse-due" } });
    await runPulseReminders();
    expect(await db.notification.count({ where: { to: email, template: "pulse-due" } })).toBe(again);
  });

  it("creates goals from a closed report and blocks duplicates", async () => {
    const g = await goals.createGoal(userId, closedId, "vision");
    expect(g.baseline).toBe(2);
    expect(g.target).toBe(2.5);
    await expect(goals.createGoal(userId, closedId, "vision")).rejects.toThrow(/already have an active goal/);
    await expect(goals.createGoal(otherId, closedId, "vision")).rejects.toThrow();
    await goals.archiveGoal(userId, g.id);
    await goals.createGoal(userId, closedId, "vision", 3.2);
  });

  it("won't delete a questionnaire that a 360 uses", async () => {
    await expect(fw.deleteCustomFramework(userId, customId)).rejects.toThrow(/used by a 360/);
  });
});
