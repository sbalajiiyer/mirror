/**
 * Polite-reminder rules and message templates. Pure and isomorphic: the server enforces them, and
 * the rater panel shows the same reasons, so what you see is what will happen.
 *
 * Shared with the automatic reminders (src/lib/jobs/reminders.ts): together, no rater gets more
 * than MAX_REMINDERS reminders, or more than one every MIN_GAP_HOURS. Emails go out only on
 * weekdays in working hours; a reminder sent outside them is queued for the next sending window.
 */
export const MAX_REMINDERS = 3;
export const MIN_GAP_HOURS = 48;
const HOUR = 3600 * 1000;

export type InviteForReminder = {
  status: "INVITED" | "STARTED" | "SUBMITTED" | "DECLINED";
  email: string | null;
  invitedAt: Date | null;
  lastRemindedAt: Date | null;
  reminderCount: number;
  queued: boolean;
};

export type Eligibility = { ok: true } | { ok: false; reason: string; until?: Date };

/** Weekdays, 09:00–17:00 UTC (a per-person time zone can come later). */
export function isSendWindow(now: Date): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
}

/** The next moment inside the sending window (now, if already inside). */
export function nextSendWindow(now: Date): Date {
  const t = new Date(now);
  for (let i = 0; i < 24 * 8; i++) {
    if (isSendWindow(t)) return t;
    t.setUTCHours(t.getUTCHours() + 1, 0, 0, 0);
  }
  return t;
}

export function canRemind(inv: InviteForReminder, now: Date): Eligibility {
  if (inv.status === "SUBMITTED") return { ok: false, reason: "Already responded" };
  if (inv.status === "DECLINED") return { ok: false, reason: "Declined" };
  if (!inv.email) return { ok: false, reason: "No email address (shared link)" };
  if (!inv.invitedAt) return { ok: false, reason: "Not invited yet" };
  if (inv.queued) return { ok: false, reason: "A reminder is already queued" };
  if (inv.reminderCount >= MAX_REMINDERS) return { ok: false, reason: `Already reminded ${MAX_REMINDERS} times` };
  if (inv.lastRemindedAt) {
    const until = new Date(inv.lastRemindedAt.getTime() + MIN_GAP_HOURS * HOUR);
    if (until > now) return { ok: false, reason: "Reminded recently", until };
  }
  return { ok: true };
}

export const TONES = ["warm", "brief", "formal"] as const;
export type Tone = (typeof TONES)[number];

/** Starting messages; fill-ins in {braces}. Plain language, short sentences. */
export const TONE_TEMPLATES: Record<Tone, string> = {
  warm: "Hi {first name},\n\nI know you're busy, so thank you for thinking about this. Your feedback would really help me. It takes about 10 minutes and it's anonymous.{due line}\n\nThank you,\n{your name}",
  brief: "Hi {first name},\n\nA quick reminder about my feedback survey. It takes about 10 minutes and it's anonymous.{due line}\n\n{your name}",
  formal: "Dear {first name},\n\nThis is a reminder about my request for feedback. Your answers are anonymous and take about 10 minutes.{due line}\n\nKind regards,\n{your name}",
};

export const FILL_INS = ["{first name}", "{your name}", "{due date}", "{due line}"] as const;
/** Shown next to each fill-in in the editor. */
export const FILL_IN_HELP: Record<(typeof FILL_INS)[number], string> = {
  "{first name}": "Their first name",
  "{your name}": "Your name",
  "{due date}": "The closing date",
  "{due line}": "A sentence with the closing date, only if one is set",
};

export type ReminderVars = { raterName: string | null; subjectName: string; dueAt: Date | null };

const firstOf = (name: string | null) => (name ?? "").trim().split(/\s+/)[0] || "there";
const day = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** Fill in a template for one rater. Unknown {braces} are left as written. */
export function renderReminder(template: string, v: ReminderVars): string {
  return template
    .replaceAll("{first name}", firstOf(v.raterName))
    .replaceAll("{your name}", v.subjectName)
    .replaceAll("{due date}", v.dueAt ? day(v.dueAt) : "soon")
    .replaceAll("{due line}", v.dueAt ? ` It closes on ${day(v.dueAt)}.` : "")
    .trim();
}

export const MAX_MESSAGE = 1500;
export const MAX_NOTE = 300;
