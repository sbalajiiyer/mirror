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
  /** A personal line for this rater only. */
  note?: string | null;
  /** The subject's email: replies go to them. */
  replyTo?: string | null;
}): EmailMessage {
  const due = p.dueAt ? `\nPlease respond by ${p.dueAt.toDateString()}.` : "";
  const note = p.note?.trim() ? `\n\n${p.note.trim()}` : "";
  return {
    to: p.to,
    fromName: `${p.subjectName} via Mirror`,
    ...(p.replyTo ? { replyTo: p.replyTo } : {}),
    template: p.pulse ? "rater-invite-pulse" : "rater-invite",
    subject: p.pulse ? `Quick check-in: ${p.subjectName} would value 2 minutes of your feedback` : `${p.subjectName} would value your feedback`,
    text: `${p.raterName ? `Hi ${p.raterName},\n\n` : ""}${p.message}${note}\n\nGive feedback (about ${p.minutes ?? 8} minutes, anonymous):\n${p.link}${due}\n\nYour individual answers are never shown to ${p.subjectName}. Results are only shown combined with at least two other people.\n\n— Sent by Mirror on behalf of ${p.subjectName}`,
  };
}

export function raterReminderEmail(p: {
  to: string;
  raterName?: string | null;
  subjectName: string;
  link: string;
  dueAt?: Date | null;
  final: boolean;
  note?: string | null;
  replyTo?: string | null;
}): EmailMessage {
  return {
    to: p.to,
    fromName: `${p.subjectName} via Mirror`,
    ...(p.replyTo ? { replyTo: p.replyTo } : {}),
    template: p.final ? "rater-reminder-final" : "rater-reminder",
    subject: p.final ? `Last chance to share feedback for ${p.subjectName}` : `Reminder: ${p.subjectName} would value your feedback`,
    text: `${p.raterName ? `Hi ${p.raterName},\n\n` : ""}A quick reminder that ${p.subjectName} asked for your anonymous feedback.${p.dueAt ? ` It closes on ${p.dueAt.toDateString()}.` : ""}${p.note?.trim() ? `\n\n${p.note.trim()}` : ""}\n\nYou can pick up where you left off:\n${p.link}\n\n— Mirror`,
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

export function coachInviteEmail(p: { to: string; fromName: string; asRole: "coach" | "client"; link: string }): EmailMessage {
  const text =
    p.asRole === "client"
      ? `${p.fromName} would like to coach you using Mirror.\n\nIf you accept, you choose exactly what ${p.fromName} can see (for example your report scores and goals) and you can stop sharing at any time. Raters' individual answers are never shown to anyone.\n\nAccept or decline:\n${p.link}\n\n— Mirror`
      : `${p.fromName} would like you to be their coach on Mirror.\n\nAccepting gives you a coach workspace with ${p.fromName}'s shared reports, goals and a session-prep briefing. ${p.fromName} controls what is shared.\n\nAccept or decline:\n${p.link}\n\n— Mirror`;
  return {
    to: p.to,
    template: p.asRole === "client" ? "coach-invites-client" : "client-invites-coach",
    subject: p.asRole === "client" ? `${p.fromName} invited you to coaching on Mirror` : `${p.fromName} asked you to be their coach on Mirror`,
    text,
  };
}

export function orgInviteEmail(p: { to: string; orgName: string; fromName: string; link: string }): EmailMessage {
  return {
    to: p.to,
    template: "org-invite",
    subject: `${p.fromName} invited you to ${p.orgName} on Mirror`,
    text: `${p.fromName} invited you to join ${p.orgName} on Mirror, where you can run 360° feedback for your own development.\n\nWhat ${p.orgName}'s admins can see: whether you've taken part, and team or cohort averages built from at least 5 people. They can't see your individual results unless you choose to share them, and raters' individual answers are never shown to anyone.\n\nJoin or decline:\n${p.link}\n\n— Mirror`,
  };
}

export function orgCampaignEmail(p: { to: string; orgName: string; campaignName: string; link: string; dueAt?: Date | null }): EmailMessage {
  return {
    to: p.to,
    template: "org-campaign",
    subject: `${p.orgName}: your 360 for ${p.campaignName} is ready to set up`,
    text: `${p.orgName} has started "${p.campaignName}", a 360° feedback round for your development.\n\nSet yours up (about 5 minutes), rate yourself, then invite the people you work with:\n${p.link}${p.dueAt ? `\n\nPlease aim to finish by ${p.dueAt.toDateString()}.` : ""}\n\nYour report is yours. ${p.orgName} sees only group averages (at least 5 people) unless you choose to share your results.\n\n— Mirror`,
  };
}

export function nudgeEmail(p: { to: string; firstName: string; action: string | null; goals: string[]; link: string; unsubscribe: string }): EmailMessage {
  const goalLine = p.goals.length ? `\n\nYour goals: ${p.goals.join("; ")}.` : "";
  const actionLine = p.action ? `This week, try one thing from your development plan:\n\n  ${p.action}` : "A quick check-in on what you're working on.";
  return {
    to: p.to,
    template: "weekly-nudge",
    subject: p.action ? `This week: ${p.action.slice(0, 70)}` : "Your weekly Mirror check-in",
    text: `Hi ${p.firstName},\n\n${actionLine}${goalLine}\n\nSee your plan and progress:\n${p.link}\n\nYou asked for these weekly nudges. Turn them off: ${p.unsubscribe}\n\n— Mirror`,
  };
}

/** Phase 11e: a company offers to pay for coaching. */
export function companyCoachingOfferEmail(p: { to: string; orgName: string; coachEmail: string; link: string }): EmailMessage {
  return {
    to: p.to,
    template: "company-coaching-offer",
    subject: `${p.orgName} is offering you coaching on Mirror`,
    text: `${p.orgName} would like to pay for coaching for you with ${p.coachEmail}.\n\nIt's your choice. If you accept, the coach is invited, and you decide what they can see (for example your report scores and goals). ${p.orgName} never sees what you discuss or share with your coach.\n\nAccept or decline:\n${p.link}\n\n— Mirror`,
  };
}

/** Phase 11e: confirm a personal sign-in email. */
export function personalEmailVerifyEmail(p: { to: string; link: string }): EmailMessage {
  return {
    to: p.to,
    template: "personal-email-verify",
    subject: "Confirm your personal sign-in email for Mirror",
    text: `Confirm this address to use it to sign in to your Mirror account. It keeps your Personal space reachable if you leave a company.\n\nThe link works for 24 hours, while you're signed in:\n${p.link}\n\nIf you didn't ask for this, ignore this email.\n\n— Mirror`,
  };
}

/** A reminder written (or chosen) by the person asking for feedback. `message` is already filled in. */
export function personalReminderEmail(p: { to: string; subjectName: string; message: string; note?: string | null; link: string; replyTo?: string | null }): EmailMessage {
  const note = p.note?.trim() ? `\n\n${p.note.trim()}` : "";
  return {
    to: p.to,
    template: "rater-reminder-personal",
    fromName: `${p.subjectName} via Mirror`,
    ...(p.replyTo ? { replyTo: p.replyTo } : {}),
    subject: `Reminder: ${p.subjectName} would value your feedback`,
    text: `${p.message}${note}\n\nGive feedback (anonymous):\n${p.link}\n\nYour individual answers are never shown to ${p.subjectName}. If you'd rather not take part, you can decline from the same link.\n\n— Sent by Mirror on behalf of ${p.subjectName}`,
  };
}

/** A company admin reminds a round participant to set up their own 360. */
export function roundReminderEmail(p: { to: string; orgName: string; campaignName: string; link: string; dueAt?: Date | null; fromName: string }): EmailMessage {
  return {
    to: p.to,
    template: "round-reminder",
    fromName: `${p.orgName} via Mirror`,
    subject: `Reminder: set up your 360 for "${p.campaignName}"`,
    text: `Hi,\n\n${p.fromName} at ${p.orgName} is reminding you to set up your 360 for "${p.campaignName}". It takes about 5 minutes.${p.dueAt ? ` Please finish by ${p.dueAt.toDateString()}.` : ""}\n\n${p.link}\n\nYour report is yours. ${p.orgName} only sees group results unless you choose to share.\n\n— Mirror`,
  };
}
