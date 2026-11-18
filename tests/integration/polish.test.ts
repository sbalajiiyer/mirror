/** Product polish against a real database: rater translations, streamed chat, AI comment themes. */
import { describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.TEST_DATABASE_URL;
vi.spyOn(console, "info").mockImplementation(() => {});

describe.skipIf(!hasDb)("polish (integration)", async () => {
  const { db } = await import("@/lib/db");
  const svc = await import("@/lib/services/assessments");
  const raters = await import("@/lib/services/raters");
  const tr = await import("@/lib/services/translations");
  const chat = await import("@/lib/services/chat");
  const themes = await import("@/lib/services/ai-themes");
  const { derivedToken } = await import("@/lib/tokens");
  const { syncFramework } = await import("@/lib/frameworks/sync");
  const { CORE_360 } = await import("@/lib/frameworks/core-360");

  const stamp = Date.now();
  const user = await db.user.create({ data: { email: `pol-${stamp}@test.local`, name: "Sam", profile: { create: { displayName: "Sam Lee", goals: [], onboardedAt: new Date() } } } });
  const other = await db.user.create({ data: { email: `pol2-${stamp}@test.local`, name: "Other", profile: { create: { displayName: "Other", goals: [], onboardedAt: new Date() } } } });
  const fw = await syncFramework(db, CORE_360);
  const full = await db.framework.findUniqueOrThrow({ where: { id: fw.id }, include: { competencies: { include: { questions: true } } } });
  const qs = full.competencies.flatMap((c) => c.questions.map((q) => ({ competencyKey: c.key, questionKey: q.key, text: q.text, selfText: q.selfText })));
  const custom = { competencyKey: "leadership", questionKey: null, text: "{name} runs great offsites.", selfText: "I run great offsites." };
  const a = await svc.createAssessment(user.id, {
    title: "Polish 360",
    goal: "self_awareness",
    frameworkId: fw.id,
    questions: [...qs, custom],
    groups: [{ kind: "PEER", name: "Peers", shareLink: false, raters: [1, 2, 3, 4, 5].map((i) => ({ name: `P${i}`, email: `pol${i}-${stamp}@t.local` })) }],
    inviteMessage: "Please give me feedback, thank you.",
    dueAt: null,
    minRatersPerGroup: 3,
    showManagerSeparately: false,
  });
  const aq = await db.assessmentQuestion.findMany({ where: { assessmentId: a.id } });
  await svc.submitSelfAssessment(user.id, a.id, { ratings: Object.fromEntries(aq.map((q) => [q.id, 4])), competencyComments: {}, start: "", stop: "", continue: "", general: "", deidentify: false });
  await svc.launchAssessment(user.id, a.id);
  const invites = await db.raterInvite.findMany({ where: { assessmentId: a.id } });
  const token = derivedToken("invite", invites[0].id);

  it("shows built-in statements in the rater's language and machine-translates custom ones once", async () => {
    const es = await raters.getRaterContext(token, "es");
    if (es.state !== "open") throw new Error(es.state);
    const lead = es.competencies.find((c) => c.key === "leadership")!;
    expect(lead.name).toBe("Liderazgo");
    expect(lead.questions[0].text).toBe("Sam marca una dirección clara que los demás pueden seguir.");
    expect(lead.questions.at(-1)!.text).toBe("[es] Sam runs great offsites."); // mock translation
    expect(es.machineTranslated).toBe(true);
    const cached = await db.assessmentQuestion.findFirstOrThrow({ where: { assessmentId: a.id, questionKey: null } });
    expect((cached.translations as Record<string, { machine?: boolean }>).es.machine).toBe(true);
    const en = await raters.getRaterContext(token, "en");
    if (en.state !== "open") throw new Error(en.state);
    expect(en.competencies[0].questions[0].text).toBe("Sam sets a clear direction that others can follow.");
    expect(en.machineTranslated).toBe(false);
  });

  it("lets the subject review and correct translations", async () => {
    const rows = await tr.translationReview(user.id, a.id);
    expect(rows).toHaveLength(1); // only the custom statement
    await expect(tr.saveTranslation(user.id, a.id, { questionId: rows[0].id, locale: "fr", text: "Organise de super séminaires.", competency: "Leadership" })).rejects.toThrow(/\{name\}/);
    await expect(tr.saveTranslation(other.id, a.id, { questionId: rows[0].id, locale: "fr", text: "{name} organise.", competency: "Leadership" })).rejects.toThrow(/Not found/);
    await expect(tr.saveTranslation(user.id, a.id, { questionId: rows[0].id, locale: "xx", text: "{name} organise.", competency: "Leadership" })).rejects.toThrow(/language/);
    await tr.saveTranslation(user.id, a.id, { questionId: rows[0].id, locale: "fr", text: "{name} organise de super séminaires.", competency: "Leadership" });
    const fr = await raters.getRaterContext(token, "fr");
    if (fr.state !== "open") throw new Error(fr.state);
    expect(fr.competencies[0].questions.at(-1)!.text).toBe("Sam organise de super séminaires.");
    await tr.translateAll(user.id, a.id);
    const after = await tr.translationReview(user.id, a.id);
    expect(Object.keys(after[0].translations).sort()).toEqual(["de", "es", "fr", "pt"]);
  });

  it("streams chat replies, strips the facts marker, and saves both messages", async () => {
    // Close the 360 so the coach has a report to talk about.
    const ans = (v: number, c: string) => ({ ratings: Object.fromEntries(aq.map((q) => [q.id, v])), competencyComments: {}, start: c, stop: "Interrupting people in meetings", continue: "Clear weekly updates", general: "", deidentify: false });
    for (const [i, inv] of invites.entries()) await raters.submitRaterResponse(derivedToken("invite", inv.id), ans(3 + (i % 2), ["Listening more in meetings", "Delegating bigger projects", "Sharing the roadmap earlier"][i]));
    await svc.closeAssessment(user.id, a.id);
    const c = await chat.startChat(user.id, { mode: "REPORT", assessmentId: a.id });
    const events = [];
    for await (const ev of chat.sendMessageStream(user.id, c.id, "What should I work on?")) events.push(ev);
    const deltas = events.filter((e) => e.t === "delta");
    expect(deltas.length).toBeGreaterThan(3);
    const text = deltas.map((e) => (e.t === "delta" ? e.v : "")).join("");
    expect(text).not.toContain("[[facts]]");
    const done = events.at(-1)!;
    expect(done.t).toBe("done");
    const saved = await chat.getChat(user.id, c.id);
    expect(saved.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(saved.messages[1].content).toBe(text.trim());
    if (done.t === "done") expect(saved.messages[1].citations).toEqual(done.citations);
    await expect(async () => {
      for await (const ev of chat.sendMessageStream(other.id, c.id, "hi")) void ev;
    }).rejects.toThrow(/Not found/);
  });

  it("groups written comments with AI for the owner only", async () => {
    const s = await themes.createAIThemes(user.id, a.id);
    expect(s.themes.length).toBeGreaterThan(0);
    const total = s.themes.reduce((n, t) => n + t.count, 0);
    const report = await db.report.findFirstOrThrow({ where: { assessmentId: a.id }, orderBy: { generatedAt: "desc" } });
    expect(total).toBe((report.data as { comments: { total: number } }).comments.total);
    expect(report.aiThemes).not.toBeNull();
    await expect(themes.createAIThemes(other.id, a.id)).rejects.toThrow(/isn't ready/);
  });
});
