/** Rater reminders from one screen, and round reminders, against a real database. */
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

  const stamp = Date.now();
  const inHours = new Date("2026-11-17T10:00:00Z"); // Tuesday
  const evening = new Date("2026-11-17T19:00:00Z");
  const nextMorning = new Date("2026-11-18T10:00:00Z");
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
    groups: [{ kind: "PEER", name: "Peers", shareLink: false, raters: ["Sam Lee", "Kim Ro", "Jo Park"].map((n, i) => ({ name: n, email: `r${i}-rem-${stamp}@t.local` })) }],
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

  it("sends a personalised reminder in working hours, and logs it", async () => {
    const r = await rem.sendReminders(subject.id, a.id, { inviteIds: [invites[0].id, invites[1].id], message: "Hi {first name}, a quick nudge from {your name}.", saveTemplate: true, tone: "brief" }, inHours);
    expect(r).toMatchObject({ sent: 2, queued: 0, skipped: [] });
    const mail = await db.notification.findFirstOrThrow({ where: { to: invites[0].email!, template: "rater-reminder-personal" }, orderBy: { createdAt: "desc" } });
    expect(mail.body).toContain("Hi Sam, a quick nudge from subj Person.");
    expect(mail.body).toContain("Thanks for the launch work last month.");
    expect(mail.replyTo).toBe(subject.email);
    expect(await db.reminderLog.count({ where: { assessmentId: a.id, outcome: "SENT", kind: "MANUAL" } })).toBe(2);
    expect((await db.subjectProfile.findUniqueOrThrow({ where: { userId: subject.id } })).reminderTemplate).toContain("{first name}");
  });

  it("skips people reminded in the last 2 days, with the reason", async () => {
    const r = await rem.sendReminders(subject.id, a.id, { inviteIds: [invites[0].id], message: "Hi {first name}, again." }, new Date(inHours.getTime() + 3600_000));
    expect(r.sent).toBe(0);
    expect(r.skipped).toEqual([{ name: "Sam Lee", reason: "Reminded recently" }]);
    const panel = await rem.raterPanel(subject.id, a.id, new Date(inHours.getTime() + 3600_000));
    expect(panel.raters.find((x) => x.id === invites[0].id)).toMatchObject({ canRemind: false, reason: "Reminded recently" });
    expect(panel.raters.find((x) => x.id === invites[2].id)).toMatchObject({ canRemind: true });
  });

  it("queues reminders written outside working hours and sends them at the next window", async () => {
    const r = await rem.sendReminders(subject.id, a.id, { inviteIds: [invites[2].id], message: "Hi {first name}, when you have a moment." }, evening);
    expect(r).toMatchObject({ sent: 0, queued: 1 });
    expect(r.sendsAt).toEqual(new Date("2026-11-18T09:00:00Z"));
    expect(await db.notification.count({ where: { to: invites[2].email!, template: "rater-reminder-personal" } })).toBe(0);
    // The daily job sends it once in hours, and never also an automatic reminder the same run.
    const run = await runReminders(nextMorning);
    expect(run.queued).toBeGreaterThanOrEqual(1);
    const mails = await db.notification.findMany({ where: { to: invites[2].email! }, orderBy: { createdAt: "asc" } });
    expect(mails.map((m) => m.template).filter((t) => t.startsWith("rater-reminder"))).toEqual(["rater-reminder-personal"]);
    expect(mails.at(-1)!.body).toContain("Hi Jo, when you have a moment.");
    expect((await db.raterInvite.findUniqueOrThrow({ where: { id: invites[2].id } })).queuedReminder).toBeNull();
  });

  it("only the person who asked can send, and never more than 3 in total", async () => {
    await expect(rem.sendReminders(other.id, a.id, { inviteIds: [invites[1].id], message: "Hi {first name}, hello there." }, inHours)).rejects.toThrow(/Not found/);
    await db.raterInvite.update({ where: { id: invites[1].id }, data: { reminderCount: 3, lastRemindedAt: new Date("2026-11-01T00:00:00Z") } });
    const r = await rem.sendReminders(subject.id, a.id, { inviteIds: [invites[1].id], message: "Hi {first name}, hello there." }, nextMorning);
    expect(r.skipped).toEqual([{ name: "Kim Ro", reason: "Already reminded 3 times" }]);
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
