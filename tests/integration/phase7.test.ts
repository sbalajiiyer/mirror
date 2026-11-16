/** Phase 7 against a real database: AI coach chat, sharing links and weekly nudges. */
import { describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.TEST_DATABASE_URL;
vi.spyOn(console, "info").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

describe.skipIf(!hasDb)("personalization v2 (integration)", async () => {
  const { db } = await import("@/lib/db");
  const chat = await import("@/lib/services/chat");
  const share = await import("@/lib/services/share");
  const { runNudges } = await import("@/lib/jobs/nudges");
  const svc = await import("@/lib/services/assessments");
  const raters = await import("@/lib/services/raters");
  const { derivedToken, verifySignedPayload } = await import("@/lib/tokens");
  const { syncFramework } = await import("@/lib/frameworks/sync");
  const { CORE_360 } = await import("@/lib/frameworks/core-360");

  const stamp = Date.now();
  const user = await db.user.create({ data: { email: `p7-${stamp}@test.local`, name: "Pat", profile: { create: { displayName: "Pat Doe", goals: ["promotion"], onboardedAt: new Date() } } } });
  const other = await db.user.create({ data: { email: `p7o-${stamp}@test.local`, name: "Other", profile: { create: { displayName: "Other", goals: [], onboardedAt: new Date() } } } });
  const fw = await syncFramework(db, CORE_360);
  const full = await db.framework.findUniqueOrThrow({ where: { id: fw.id }, include: { competencies: { include: { questions: true } } } });
  const qs = full.competencies.flatMap((c) => c.questions.map((q) => ({ competencyKey: c.key, questionKey: q.key, text: q.text, selfText: q.selfText })));
  const a = await svc.createAssessment(user.id, {
    title: "Pat 360",
    goal: "promotion",
    frameworkId: fw.id,
    questions: qs,
    groups: [{ kind: "PEER", name: "Peers", shareLink: false, raters: [1, 2, 3].map((i) => ({ name: `P${i}`, email: `p${i}-${stamp}@t.local` })) }],
    inviteMessage: "Please give me feedback, thank you.",
    dueAt: null,
    minRatersPerGroup: 3,
    showManagerSeparately: false,
  });
  const aq = await db.assessmentQuestion.findMany({ where: { assessmentId: a.id } });
  const ans = (v: number) => ({ ratings: Object.fromEntries(aq.map((q, i) => [q.id, i % 7 === 0 ? 5 : v])), competencyComments: {}, start: "Secret comment about the offsite", stop: "", continue: "", general: "", deidentify: false });
  await svc.submitSelfAssessment(user.id, a.id, ans(4));
  await svc.launchAssessment(user.id, a.id);
  for (const inv of await db.raterInvite.findMany({ where: { assessmentId: a.id } })) await raters.submitRaterResponse(derivedToken("invite", inv.id), ans(3));
  await svc.closeAssessment(user.id, a.id);

  it("starts report and role-play chats, replies, and keeps chats private", async () => {
    const c = await chat.startChat(user.id, { mode: "REPORT", assessmentId: a.id });
    expect(c.title).toBe("About Pat 360");
    const r = await chat.sendMessage(user.id, c.id, "What should I work on first?");
    expect(r.reply.length).toBeGreaterThan(10);
    const got = await chat.getChat(user.id, c.id);
    expect(got.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    await expect(chat.getChat(other.id, c.id)).rejects.toThrow(/Not found/);
    await expect(chat.startChat(other.id, { mode: "REPORT", assessmentId: a.id })).rejects.toThrow(/closed report/);
    const rp = await chat.startChat(user.id, { mode: "ROLEPLAY", preset: "ask_manager" });
    expect(rp.scenario).toMatch(/manager/);
    await expect(chat.startChat(user.id, { mode: "ROLEPLAY" })).rejects.toThrow(/Pick a situation/);
    // Premium needs a premium model chosen and available.
    await expect(chat.startChat(user.id, { mode: "REPORT", premium: true })).rejects.toThrow(/premium model/);
  });

  it("enforces the free daily message cap without saving the message", async () => {
    const c = await chat.startChat(user.id, { mode: "REPORT" });
    await db.aIInteractionLog.createMany({ data: Array.from({ length: 30 }, () => ({ userId: user.id, feature: "chat", modelId: "free", provider: "groq", tier: "free", status: "ok" })) });
    await expect(chat.sendMessage(user.id, c.id, "Hello?")).rejects.toThrow(/Daily AI limit/);
    expect((await chat.getChat(user.id, c.id)).messages).toHaveLength(0);
  });

  it("creates, shows and revokes share links without any rater comments", async () => {
    const badge = await share.createShare(user.id, a.id, { kind: "BADGE" });
    expect(badge.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const pub = await share.publicShare(badge.id);
    expect(pub!.badge.raters).toBe(3);
    expect(pub!.name).toBe("Pat Doe");
    expect(JSON.stringify(pub)).not.toContain("Secret comment");
    const rep = await share.createShare(user.id, a.id, { kind: "REPORT" });
    expect(JSON.stringify(await share.publicShare(rep.id))).not.toContain("Secret comment");
    await expect(share.createShare(other.id, a.id, { kind: "BADGE" })).rejects.toThrow(/closed report/);
    await expect(share.revokeShare(other.id, badge.id)).rejects.toThrow(/Not found/);
    await share.revokeShare(user.id, badge.id);
    expect(await share.publicShare(badge.id)).toBeNull();
    const exp = await share.createShare(user.id, a.id, { kind: "SUMMARY", sections: ["strengths"], expiresInDays: 1 });
    await db.shareLink.update({ where: { id: exp.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await share.publicShare(exp.id)).toBeNull();
    expect((await db.shareLink.findUniqueOrThrow({ where: { id: rep.id } })).views).toBe(1);
    expect(await share.publicShare("not-a-real-share-link!")).toBeNull();
  });

  it("sends weekly nudges only to people who opted in, once a week, with an unsubscribe link", async () => {
    const now = new Date();
    await db.goal.create({ data: { userId: user.id, assessmentId: a.id, competencyKey: "communication", competencyName: "Communication", title: "Raise communication to 3.8", target: 3.8 } });
    await db.subjectProfile.update({ where: { userId: other.id }, data: { nudgeDay: now.getUTCDay() } }); // opted in but nothing to nudge about
    let r = await runNudges(now);
    expect(await db.notification.count({ where: { to: user.email!, template: "weekly-nudge" } })).toBe(0); // not opted in
    await db.subjectProfile.update({ where: { userId: user.id }, data: { nudgeDay: now.getUTCDay() } });
    r = await runNudges(now);
    expect(r.sent).toBeGreaterThanOrEqual(1);
    const mail = await db.notification.findFirstOrThrow({ where: { to: user.email!, template: "weekly-nudge" } });
    expect(mail.body).toContain("Raise communication to 3.8");
    expect(await db.notification.count({ where: { to: other.email!, template: "weekly-nudge" } })).toBe(0);
    await runNudges(now); // same week: nothing more
    expect(await db.notification.count({ where: { to: user.email!, template: "weekly-nudge" } })).toBe(1);
    const t = decodeURIComponent(mail.body.match(/unsubscribe\?t=([^\s]+)/)![1]);
    expect(verifySignedPayload(t)).toBe(`nudge-off:${user.id}`);
  });
});
