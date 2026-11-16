import type { EmailMessage } from "./types";

export function raterInviteEmail(p: {
  to: string;
  raterName?: string | null;
  subjectName: string;
  message: string;
  link: string;
  dueAt?: Date | null;
  pulse?: boolean;
  minutes?: number;
}): EmailMessage {
  const due = p.dueAt ? `\nPlease respond by ${p.dueAt.toDateString()}.` : "";
  return {
    to: p.to,
    template: p.pulse ? "rater-invite-pulse" : "rater-invite",
    subject: p.pulse ? `Quick check-in: ${p.subjectName} would value 2 minutes of your feedback` : `${p.subjectName} would value your feedback`,
    text: `${p.raterName ? `Hi ${p.raterName},\n\n` : ""}${p.message}\n\nGive feedback (about ${p.minutes ?? 8} minutes, anonymous):\n${p.link}${due}\n\nYour individual answers are never shown to ${p.subjectName}. Results are only shown combined with at least two other people.\n\n— Sent by Mirror on behalf of ${p.subjectName}`,
  };
}

export function raterReminderEmail(p: {
  to: string;
  raterName?: string | null;
  subjectName: string;
  link: string;
  dueAt?: Date | null;
  final: boolean;
}): EmailMessage {
  return {
    to: p.to,
    template: p.final ? "rater-reminder-final" : "rater-reminder",
    subject: p.final ? `Last chance to share feedback for ${p.subjectName}` : `Reminder: ${p.subjectName} would value your feedback`,
    text: `${p.raterName ? `Hi ${p.raterName},\n\n` : ""}A quick reminder that ${p.subjectName} asked for your anonymous feedback.${p.dueAt ? ` It closes on ${p.dueAt.toDateString()}.` : ""}\n\nYou can pick up where you left off:\n${p.link}\n\n— Mirror`,
  };
}

export function magicLinkEmail(p: { to: string; url: string }): EmailMessage {
  return {
    to: p.to,
    template: "magic-link",
    subject: "Your Mirror sign-in link",
    text: `Click to sign in to Mirror:\n${p.url}\n\nThis link expires in 24 hours. If you didn't request it, you can ignore this email.`,
  };
}

export function pulseDueEmail(p: { to: string; name: string; link: string; title: string }): EmailMessage {
  return {
    to: p.to,
    template: "pulse-due",
    subject: "Time for your Mirror pulse check",
    text: `Hi ${p.name},\n\nIt's time for your next pulse check on "${p.title}" — a 2-minute check-in with the same people to see what's changed.\n\nStart it here:\n${p.link}\n\n— Mirror`,
  };
}
