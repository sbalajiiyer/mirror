/**
 * AI layer against a real database (TEST_DATABASE_URL), with the provider HTTP call stubbed.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.TEST_DATABASE_URL;
vi.spyOn(console, "info").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

function groqReply(content: unknown, status = 200) {
  return vi.fn(async () =>
    new Response(JSON.stringify(status === 200 ? { choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 900, completion_tokens: 300 } } : { error: "x" }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe.skipIf(!hasDb)("AI features (integration)", async () => {
  const { db } = await import("@/lib/db");
  const { syncFramework } = await import("@/lib/frameworks/sync");
  const svc = await import("@/lib/services/assessments");
  const raters = await import("@/lib/services/raters");
  const ai = await import("@/lib/services/ai");
  const { runAI, DAILY_LIMITS } = await import("@/lib/ai/client");
  const { derivedToken } = await import("@/lib/tokens");
  const { z } = await import("zod");

  let userId = "";
  let assessmentId = "";
  const email = `ai-${Date.now()}@test.local`;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    process.env.GROQ_API_KEY = "gsk_test_key";
    const fw = await syncFramework(db);
    const full = await db.framework.findUniqueOrThrow({ where: { id: fw.id }, include: { competencies: { include: { questions: true } } } });
    userId = (await db.user.create({ data: { email, name: "AI Subject", profile: { create: { displayName: "Jamie Doe", jobTitle: "Engineer", goals: ["promotion"], onboardedAt: new Date() } } } })).id;
    const questions = full.competencies.slice(0, 3).flatMap((c) => c.questions.map((q) => ({ competencyKey: c.key, questionKey: q.key, text: q.text, selfText: q.selfText })));
    const a = await svc.createAssessment(userId, {
      title: "AI 360",
      goal: "promotion",
      frameworkId: fw.id,
      questions,
      groups: [{ kind: "PEER", name: "Peers", shareLink: false, raters: [1, 2, 3].map((i) => ({ name: "", email: `p${i}-${email}` })) }],
      inviteMessage: "Please give me feedback, thank you!",
      dueAt: null,
      minRatersPerGroup: 3,
      showManagerSeparately: false,
    });
    assessmentId = a.id;
    const qs = await db.assessmentQuestion.findMany({ where: { assessmentId } });
    const answers = (v: number, extra: Record<string, unknown> = {}) => ({
      ratings: Object.fromEntries(qs.map((q, i) => [q.id, ((v + i) % 5) + 1])),
      competencyComments: {},
      start: "Start sharing decisions earlier with the team.",
      stop: "Stop interrupting in meetings.",
      continue: "Continue delivering on time.",
      general: "",
      deidentify: false,
      ...extra,
    });
    await svc.submitSelfAssessment(userId, assessmentId, answers(4));
    await svc.launchAssessment(userId, assessmentId);
    const invites = await db.raterInvite.findMany({ where: { assessmentId }, orderBy: { email: "asc" } });
    await raters.submitRaterResponse(derivedToken("invite", invites[0].id), answers(1, { general: "Mail me at x@y.com" }));
    await raters.submitRaterResponse(derivedToken("invite", invites[1].id), answers(2));
    // Third rater opts into AI de-identification.
    globalThis.fetch = groqReply({ texts: ["Start sharing decisions earlier.", "Stop interrupting in meetings.", "Continue delivering on time.", "Was great in the planning offsite."] }) as unknown as typeof fetch;
    await raters.submitRaterResponse(derivedToken("invite", invites[2].id), answers(3, { general: "Sam was great at the Lisbon offsite in March.", deidentify: true }));
    globalThis.fetch = realFetch;
    await svc.closeAssessment(userId, assessmentId);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { email } });
    await db.aIInteractionLog.deleteMany({ where: { userId: null, feature: "deidentify" } });
    delete process.env.GROQ_API_KEY;
    await db.$disconnect();
  });

  it("always scrubs emails, and stores only the AI-rewritten text when a rater opts in", async () => {
    const comments = await db.comment.findMany({ where: { submission: { assessmentId } } });
    const texts = comments.map((c) => c.text);
    expect(texts.some((t) => t.includes("x@y.com"))).toBe(false);
    expect(texts).toContain("Mail me at [email]");
    expect(texts.some((t) => /Lisbon|Sam was/.test(t))).toBe(false);
    expect(texts).toContain("Was great in the planning offsite.");
    const log = await db.aIInteractionLog.findFirst({ where: { feature: "deidentify" }, orderBy: { createdAt: "desc" } });
    expect(log?.userId).toBeNull();
    expect(log?.actorKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("writes an AI summary from anonymised data and stores it on the report", async () => {
    const fetchMock = groqReply({ summary: "x".repeat(60), strengths: [{ competency: "Execution", insight: "Rated highly." }], growth: [{ competency: "Communication", insight: "Room to grow." }] });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const r = await ai.createAISummary(userId, assessmentId);
    expect(r.summary.generatedBy).toBe("ai");
    expect(r.summary.modelId).toBe("free");
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.response_format).toEqual({ type: "json_object" });
    const sent = JSON.stringify(body.messages);
    for (const leaked of [email, "p1-", "x@y.com"]) expect(sent).not.toContain(leaked);
    const report = await db.report.findFirstOrThrow({ where: { assessmentId }, orderBy: { generatedAt: "desc" } });
    expect((report.aiSummary as { summary: string }).summary).toHaveLength(60);
    const log = await db.aIInteractionLog.findFirst({ where: { userId, feature: "summary" }, orderBy: { createdAt: "desc" } });
    expect(log).toMatchObject({ status: "ok", tier: "free", inputTokens: 900, outputTokens: 300, costMicros: 0 });
  });

  it("stores a Simplified version alongside the Standard one, using the plain-language rules", async () => {
    const simple = { summary: "Others trust you to get work done. Work on sharing your plans earlier.", strengths: [{ competency: "Execution", insight: "You deliver." }], growth: [{ competency: "Communication", insight: "Share plans earlier." }] };
    const fetchMock = groqReply({ summary: "y".repeat(60), strengths: [], growth: [], simple });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const r = await ai.createAISummary(userId, assessmentId);
    expect(r.summary.generatedBy).toBe("ai");
    expect(r.summary.simple?.summary).toBe(simple.summary);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(JSON.stringify(body.messages)).toMatch(/ASD-STE100/);
    expect(JSON.stringify(body.messages)).toMatch(/at most 20 words/);
  });

  it("falls back to the standard summary when the provider fails, and logs it", async () => {
    globalThis.fetch = groqReply({}, 500) as unknown as typeof fetch;
    const r = await ai.createAISummary(userId, assessmentId);
    expect(r.summary.generatedBy).toBe("template");
    expect(r.warning).toMatch(/unavailable/);
    expect(await db.aIInteractionLog.count({ where: { userId, feature: "summary", status: "fallback" } })).toBe(1);
  });

  it("falls back when the model returns JSON of the wrong shape", async () => {
    globalThis.fetch = groqReply({ nope: true }) as unknown as typeof fetch;
    const r = await ai.createAISummary(userId, assessmentId);
    expect(r.summary.generatedBy).toBe("template");
  });

  it("creates a development plan with trackable actions", async () => {
    const area = (competency: string) => ({
      competency,
      why: "Because.",
      actions: [1, 2, 3].map((i) => ({ title: `Action ${i}`, detail: "Do it." })),
      exercise: "Practise.",
      resources: [{ type: "book", title: "A real book", note: "" }],
      milestones: { d30: "a", d60: "b", d90: "c" },
      helpers: ["A peer"],
    });
    globalThis.fetch = groqReply({ intro: "Here is your plan.", areas: [area("Communication")] }) as unknown as typeof fetch;
    const { plan } = await ai.createDevelopmentPlan(userId, assessmentId, "practice");
    const stored = await ai.latestPlan(userId, assessmentId);
    expect(stored!.data.generatedBy).toBe("ai");
    expect(stored!.data.areas[0].competencyKey).toBe("communication");
    const actionId = stored!.data.areas[0].actions[1].id;
    await ai.setPlanActionDone(userId, plan.id, actionId, true);
    const after = await ai.latestPlan(userId, assessmentId);
    expect(after!.data.areas[0].actions.filter((a) => a.done)).toHaveLength(1);
    expect((await db.subjectProfile.findUniqueOrThrow({ where: { userId } })).learningStyle).toBe("practice");
    // Other users can't modify the plan.
    const other = await db.user.create({ data: { email: `other-${email}` } });
    await expect(ai.setPlanActionDone(other.id, plan.id, actionId, false)).rejects.toThrow(/not found/i);
    await db.user.delete({ where: { id: other.id } });
  });

  it("never trusts competency keys invented by the model in recommendations", async () => {
    globalThis.fetch = groqReply({ frameworkSlug: "made-up", focus: ["leadership", "telepathy", "communication"], reason: "Because." }) as unknown as typeof fetch;
    const r = await ai.recommendFrameworkFor(userId, "promotion");
    expect(r.recommendation.frameworkSlug).toBe("mirror-core-360");
    expect(r.recommendation.focus).toEqual(["leadership", "communication"]);
  });

  it("enforces the daily limit per user and feature", async () => {
    const schema = z.object({ ok: z.boolean() });
    await db.aIInteractionLog.createMany({
      data: Array.from({ length: DAILY_LIMITS.framework }, () => ({ userId, feature: "framework", modelId: "free", provider: "groq", tier: "free", status: "ok" })),
    });
    const fetchMock = groqReply({ ok: true });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const r = await runAI({ feature: "framework", userId, request: { system: "s", messages: [] }, schema, mock: () => ({ ok: true }), fallback: () => ({ ok: false }) });
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses AI work on reports that aren't ready", async () => {
    const draft = await db.assessment.create({
      data: { subjectId: userId, frameworkId: (await db.framework.findFirstOrThrow()).id, title: "x", goal: "promotion", inviteMessage: "hello there everyone" },
    });
    await expect(ai.createAISummary(userId, draft.id)).rejects.toThrow(/isn't ready/);
  });
});
