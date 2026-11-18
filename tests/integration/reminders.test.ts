/** Rater reminders from one screen (without revealing who answered), and round reminders, against a real database. */
import { describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.TEST_DATABASE_URL;
vi.spyOn(console, "info").mockImplementation(() => {});

describe.skipIf(!hasDb)("reminders (integration)", async () => {
  const { db } = await import("@/lib/db");
  const svc = await import("@/lib/services/assessments");
  const rem = await import("@/lib/services/reminders");
  const org = await import("@/lib/services/org");
  const { syncFramework } = await import("@/lib/frameworks/sync");
  const { CORE_360 } = await import("@/lib/frameworks/core-360");
  const { runReminders } = await import("@/lib/jobs/reminders");
  const raters = await import("@/lib/services/raters");
  const { derivedToken } = await import("@/lib/tokens");

  const stamp = Date.now();
  const inHours = new Date("2026-11-17T10:00:00Z"); // Tuesday
  const mk = (name: string) => db.user.create({ data: { email: `${name}-rem-${stamp}@test.local`, name, profile: { create: { displayName: `${name} Person`, goals: ["promotion"], onboardedAt: new Date() } } } });
  const subject = await mk("subj");
  const other = await mk("other");
  const fw = await syncFramework(db, CORE_360);
  const full = await db.framework.findUniqueOrThrow({ where: { id: fw.id }, include: { competencies: { include: { questions: true } } } });
  const qs = full.competencies.flatMap((c) => c.questions.map((q) => ({ competencyKey: c.key, questionKey: q.key, text: q.text, selfText: q.selfText })));
  const a = await svc.createAssessment(subject.id, {
    title: "Reminders 360",
    goal: "promotion",
    frameworkId: fw.id,
    questions: qs,
    groups: [{ kind: "PEER", name: "Peers", shareLink: false, raters: ["Sam Lee", "Kim Ro", "Jo Park", "Ana Diaz", "Lee Chan"].map((n, i) => ({ name: n, email: `r${i}-rem-${stamp}@t.local` })) }],
    inviteMessage: "Please give me feedback, thank you.",
    dueAt: null,
    minRatersPerGroup: 3,
    showManagerSeparately: false,
  });
  const invites = await db.raterInvite.findMany({ where: { assessmentId: a.id, email: { not: null } }, orderBy: { createdAt: "asc" } });

  it("adds a personal line that goes into the invitation", async () => {
    await rem.setPersonalNote(subject.id, invites[0].id, "Thanks for the launch work last month.");
    await expect(rem.setPersonalNote(other.id, invites[0].id, "x")).rejects.toThrow(/Not found/);
    const aq = await db.assessmentQuestion.findMany({ where: { assessmentId: a.id } });
    await svc.submitSelfAssessment(subject.id, a.id, { ratings: Object.fromEntries(aq.map((q) => [q.id, 4])), competencyComments: {}, start: "", stop: "", continue: "", general: "", deidentify: false });
    await svc.launchAssessment(subject.id, a.id);
    const mail = await db.notification.findFirstOrThrow({ where: { to: invites[0].email!, template: "rater-invite" }, orderBy: { createdAt: "desc" } });
    expect(mail.body).toContain("Thanks for the launch work last month.");
    expect(mail).toMatchObject({ fromName: "subj Person via Mirror", replyTo: subject.email });
  });

  const answers = async () => {
    const aq = await db.assessmentQuestion.findMany({ where: { assessmentId: a.id } });
    return { ratings: Object.fromEntries(aq.map((q) => [q.id, 3])), competencyComments: {}, start: "", stop: "", continue: "", general: "", deidentify: false };
  };
  const reminderMails = (to: string) => db.notification.count({ where: { to, template: "rater-reminder-personal" } });

  it("reminds everyone who hasn't answered, never someone who has, and the result names and counts no one", async () => {
    await raters.submitRaterResponse(derivedToken("invite", invites[4].id), await answers());
    const r = await rem.sendReminders(subject.id, a.id, { message: "Hi {first name}, a quick nudge from {your name}.", saveTemplate: true, tone: "brief" }, inHours);
    expect(r).toEqual({ when: "now", sendsAt: null });
    for (const inv of invites.slice(0, 4)) expect(await reminderMails(inv.email!)).toBe(1);
    expect(await reminderMails(invites[4].email!)).toBe(0);
    const mail = await db.notification.findFirstOrThrow({ where: { to: invites[0].email!, template: "rater-reminder-personal" }, orderBy: { createdAt: "desc" } });
    expect(mail.body).toContain("Hi Sam, a quick nudge from subj Person.");
    expect(mail.body).toContain("Thanks for the launch work last month.");
    expect(mail.replyTo).toBe(subject.email);
    expect((await db.subjectProfile.findUniqueOrThrow({ where: { userId: subject.id } })).reminderTemplate).toContain("{first name}");
    // The panel shows raters without any status, and history without names or counts.
    const panel = await rem.raterPanel(subject.id, a.id, inHours);
    expect(Object.keys(panel.raters[0]).sort()).toEqual(["email", "group", "id", "name", "note"]);
    expect(panel.history).toEqual([{ at: expect.any(Date), kind: "MANUAL", outcome: "SENT" }]);
    expect(JSON.stringify(panel)).not.toMatch(/SUBMITTED|Responded|Already responded/);
  });

  it("allows one reminder round from you every 2 days", async () => {
    await expect(rem.sendReminders(subject.id, a.id, { message: "Hi {first name}, again." }, new Date(inHours.getTime() + 3600_000))).rejects.toThrow(/sent a reminder recently/);
    const panel = await rem.raterPanel(subject.id, a.id, new Date(inHours.getTime() + 3600_000));
    expect(panel.nextManualAt).toEqual(new Date(inHours.getTime() + 48 * 3600_000));
  });

  it("queues a round written outside working hours, can cancel it, and sends it at the next window", async () => {
    const thuEvening = new Date("2026-11-19T19:00:00Z");
    const friMorning = new Date("2026-11-20T10:00:00Z");
    const r = await rem.sendReminders(subject.id, a.id, { message: "Hi {first name}, when you have a moment." }, thuEvening);
    expect(r).toEqual({ when: "queued", sendsAt: new Date("2026-11-20T09:00:00Z") });
    expect((await rem.raterPanel(subject.id, a.id, thuEvening)).queued).toBe(true);
    await rem.cancelQueuedReminders(subject.id, a.id);
    expect((await rem.raterPanel(subject.id, a.id, thuEvening)).queued).toBe(false);
    await rem.sendReminders(subject.id, a.id, { message: "Hi {first name}, when you have a moment." }, thuEvening);
    await runReminders(friMorning);
    const mails = await db.notification.findMany({ where: { to: invites[2].email!, template: { startsWith: "rater-reminder" } }, orderBy: { createdAt: "asc" } });
    expect(mails.at(-1)!.body).toContain("Hi Jo, when you have a moment.");
    expect(await reminderMails(invites[4].email!)).toBe(0); // still never the person who answered
    expect((await db.raterInvite.findUniqueOrThrow({ where: { id: invites[2].id } })).queuedReminder).toBeNull();
  });

  it("only the person who asked can send, and nobody gets more than 3 in total", async () => {
    await expect(rem.sendReminders(other.id, a.id, { message: "Hi {first name}, hello there." }, inHours)).rejects.toThrow(/Not found/);
    await db.raterInvite.update({ where: { id: invites[1].id }, data: { reminderCount: 3, lastRemindedAt: new Date("2026-11-01T00:00:00Z") } });
    const before = await reminderMails(invites[1].email!);
    await rem.sendReminders(subject.id, a.id, { message: "Hi {first name}, hello there." }, new Date("2026-11-24T10:00:00Z"));
    expect(await reminderMails(invites[1].email!)).toBe(before);
  });

  it("after invitations go out, raters can't be removed (that could show who answered)", async () => {
    await expect(svc.removeInvite(subject.id, invites[0].id)).rejects.toThrow(/can't be removed/);
  });

  it("company admins remind participants who haven't started, never raters", async () => {
    const owner = await mk("rowner");
    const emp = await mk("remp");
    const orgId = (await org.createOrg(owner.id, "Remind Co")).id;
    await org.inviteMembers(owner.id, orgId, emp.email!);
    const token = (await db.notification.findFirstOrThrow({ where: { to: emp.email! }, orderBy: { createdAt: "desc" } })).body.match(/orgs\/invite\/([A-Za-z0-9_-]+)/)![1];
    await org.respondOrgInviteToken(emp.id, token, true);
    const camp = await org.createCampaign(owner.id, orgId, { name: "Spring round", frameworkId: fw.id, teamMode: false, dueInDays: 14 });
    const view = await rem.roundParticipants(owner.id, orgId, camp.id);
    const empRow = view.people.find((p) => p.name.includes("remp"))!;
    expect(empRow).toMatchObject({ started: false, canRemind: true });
    expect(await rem.remindParticipants(owner.id, orgId, camp.id, [empRow.memberId])).toEqual({ sent: 1, skipped: [] });
    expect((await db.notification.findFirstOrThrow({ where: { to: emp.email!, template: "round-reminder" } })).body).toContain("Spring round");
    // Again straight away: too soon.
    expect((await rem.remindParticipants(owner.id, orgId, camp.id, [empRow.memberId])).skipped).toEqual([{ name: empRow.name, reason: "Reminded recently" }]);
    await expect(rem.remindParticipants(emp.id, orgId, camp.id, [empRow.memberId])).rejects.toThrow(/Only organization admins/);
  });
});
