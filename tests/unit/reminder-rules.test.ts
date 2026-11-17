import { describe, expect, it } from "vitest";
import { canRemind, isSendWindow, nextSendWindow, renderReminder, TONE_TEMPLATES, type InviteForReminder } from "@/lib/reminders/rules";

const now = new Date("2026-11-17T10:00:00Z"); // Tuesday, in working hours
const base: InviteForReminder = { status: "INVITED", email: "a@x.com", invitedAt: new Date("2026-11-10T10:00:00Z"), lastRemindedAt: null, reminderCount: 0, queued: false };

describe("who can be reminded", () => {
  it("allows someone invited who hasn't answered", () => expect(canRemind(base, now)).toEqual({ ok: true }));
  it("explains every refusal", () => {
    expect(canRemind({ ...base, status: "SUBMITTED" }, now)).toMatchObject({ ok: false, reason: "Already responded" });
    expect(canRemind({ ...base, status: "DECLINED" }, now)).toMatchObject({ ok: false, reason: "Declined" });
    expect(canRemind({ ...base, email: null }, now)).toMatchObject({ ok: false, reason: expect.stringMatching(/No email/) });
    expect(canRemind({ ...base, reminderCount: 3 }, now)).toMatchObject({ ok: false, reason: "Already reminded 3 times" });
    expect(canRemind({ ...base, queued: true }, now)).toMatchObject({ ok: false, reason: expect.stringMatching(/queued/) });
  });
  it("waits 2 days between reminders and says until when", () => {
    const r = canRemind({ ...base, lastRemindedAt: new Date("2026-11-16T12:00:00Z") }, now);
    expect(r).toEqual({ ok: false, reason: "Reminded recently", until: new Date("2026-11-18T12:00:00Z") });
    expect(canRemind({ ...base, lastRemindedAt: new Date("2026-11-15T09:00:00Z") }, now)).toEqual({ ok: true });
  });
});

describe("sending window", () => {
  it("is weekdays 09:00-17:00 UTC", () => {
    expect(isSendWindow(now)).toBe(true);
    expect(isSendWindow(new Date("2026-11-17T18:00:00Z"))).toBe(false);
    expect(isSendWindow(new Date("2026-11-21T10:00:00Z"))).toBe(false); // Saturday
  });
  it("finds the next slot", () => {
    expect(nextSendWindow(now)).toEqual(now);
    expect(nextSendWindow(new Date("2026-11-17T18:30:00Z"))).toEqual(new Date("2026-11-18T09:00:00Z"));
    expect(nextSendWindow(new Date("2026-11-20T20:00:00Z"))).toEqual(new Date("2026-11-23T09:00:00Z")); // Friday night → Monday
  });
});

describe("messages", () => {
  it("fills in names and the due date, and keeps unknown braces", () => {
    const t = "Hi {first name}, from {your name}, by {due date}. {other}";
    expect(renderReminder(t, { raterName: "Sam Lee", subjectName: "Alex", dueAt: new Date("2026-11-20T00:00:00Z") })).toBe("Hi Sam, from Alex, by Friday 20 November. {other}");
    expect(renderReminder("Hi {first name}", { raterName: null, subjectName: "Alex", dueAt: null })).toBe("Hi there");
  });
  it("every tone template is short and uses the fill-ins", () => {
    for (const t of Object.values(TONE_TEMPLATES)) {
      expect(t).toContain("{first name}");
      expect(t).toContain("{your name}");
      const text = renderReminder(t, { raterName: "Sam", subjectName: "Alex", dueAt: null });
      for (const sentence of text.split(/[.!?]\s/)) expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(20);
    }
  });
});
