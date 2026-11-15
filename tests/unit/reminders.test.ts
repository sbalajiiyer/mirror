import { describe, expect, it } from "vitest";
import { MAX_REMINDERS, isSendWindow, reminderDue, type ReminderCandidate } from "@/lib/jobs/reminders";

const DAY = 86400000;
// Wednesday 2026-11-18 10:00 UTC
const NOW = new Date("2026-11-18T10:00:00Z");
const base = (over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
  status: "INVITED",
  invitedAt: new Date(NOW.getTime() - 4 * DAY),
  lastRemindedAt: null,
  reminderCount: 0,
  hasEmail: true,
  ...over,
});

describe("reminder scheduling", () => {
  it("only sends on weekdays during working hours (UTC)", () => {
    expect(isSendWindow(NOW)).toBe(true);
    expect(isSendWindow(new Date("2026-11-18T20:00:00Z"))).toBe(false);
    expect(isSendWindow(new Date("2026-11-21T10:00:00Z"))).toBe(false); // Saturday
  });

  it("sends the first reminder after 3 days", () => {
    expect(reminderDue(base({ invitedAt: new Date(NOW.getTime() - 2 * DAY) }), null, NOW).due).toBe(false);
    expect(reminderDue(base(), null, NOW)).toEqual({ due: true, final: false });
  });

  it("waits until day 7 for the second reminder and 48h between reminders", () => {
    const after1 = base({ reminderCount: 1, lastRemindedAt: new Date(NOW.getTime() - 1 * DAY) });
    expect(reminderDue(after1, null, NOW).due).toBe(false);
    const day8 = base({ invitedAt: new Date(NOW.getTime() - 8 * DAY), reminderCount: 1, lastRemindedAt: new Date(NOW.getTime() - 3 * DAY) });
    expect(reminderDue(day8, null, NOW)).toEqual({ due: true, final: false });
  });

  it("sends a final reminder close to the due date", () => {
    const due = new Date(NOW.getTime() + 1 * DAY);
    expect(reminderDue(base({ invitedAt: new Date(NOW.getTime() - 2 * DAY) }), due, NOW)).toEqual({ due: true, final: true });
  });

  it("never reminds people who responded, declined, have no email, or hit the cap", () => {
    expect(reminderDue(base({ status: "SUBMITTED" }), null, NOW).due).toBe(false);
    expect(reminderDue(base({ status: "DECLINED" }), null, NOW).due).toBe(false);
    expect(reminderDue(base({ hasEmail: false }), null, NOW).due).toBe(false);
    expect(reminderDue(base({ reminderCount: MAX_REMINDERS }), null, NOW).due).toBe(false);
    expect(reminderDue(base(), new Date(NOW.getTime() - DAY), NOW).due).toBe(false); // past due
  });
});
