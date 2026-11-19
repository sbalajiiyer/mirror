import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Anonymous funnel counts for platform admins (/admin/funnel).
 *
 * Privacy: nothing new is tracked. There are no cookies, page-view events, session recordings or
 * third-party analytics. Every number is a COUNT over data Mirror already keeps to run the product
 * (accounts, 360s, invitations, payments), plus one timestamp: when a report was first opened.
 * Only totals leave this function; never ids, names, emails or per-person rows. Counts under
 * SMALL are shown as "<5" so a tiny cohort can't be traced back to a person.
 */
export const SMALL = 5;
export const WINDOWS = { "7": 7, "30": 30, "90": 90, all: null } as const;
export type WindowKey = keyof typeof WINDOWS;

/** Demo, seed and test accounts, left out unless asked for. */
const TEST_SUFFIXES = ["@mirror.local", ".mirror.local", "@example.com", "@test.local", "@t.local"];

function userWhere(since: Date | null, includeTest: boolean): Prisma.UserWhereInput {
  return {
    ...(since ? { createdAt: { gte: since } } : {}),
    ...(includeTest ? {} : { AND: TEST_SUFFIXES.map((s) => ({ NOT: { email: { endsWith: s } } })) }),
  };
}

export type Step = { key: string; label: string; help: string; count: number };

/** Show small numbers as "<5". */
export const shown = (n: number) => (n > 0 && n < SMALL ? `<${SMALL}` : n.toLocaleString("en-US"));

export async function funnel(opts: { window: WindowKey; includeTest?: boolean; now?: Date }) {
  const now = opts.now ?? new Date();
  const days = WINDOWS[opts.window];
  const since = days ? new Date(now.getTime() - days * 86400000) : null;
  const u = userWhere(since, !!opts.includeTest);
  // People's own (subject) steps, for accounts created in the window.
  const has = (a: Prisma.AssessmentWhereInput): Prisma.UserWhereInput => ({ ...u, assessments: { some: a } });
  const [signedUp, ageOk, onboarded, created, selfDone, launched, enough, reported, viewed, planned, returned, paid] = await Promise.all([
    db.user.count({ where: u }),
    db.user.count({ where: { ...u, ageConfirmedAt: { not: null } } }),
    db.user.count({ where: { ...u, profile: { onboardedAt: { not: null } } } }),
    db.user.count({ where: has({}) }),
    db.user.count({ where: has({ selfLockedAt: { not: null } }) }),
    db.user.count({ where: has({ launchedAt: { not: null } }) }),
    db.user.count({ where: has({ invites: { some: { status: "SUBMITTED" } } }) }),
    db.user.count({ where: has({ status: "CLOSED", reports: { some: {} } }) }),
    db.user.count({ where: has({ reportViewedAt: { not: null } }) }),
    db.user.count({ where: { ...u, plans: { some: {} } } }),
    db.user.count({ where: has({ OR: [{ rootAssessmentId: { not: null } }, { type: "PULSE" }] }) }),
    db.user.count({ where: { ...u, payments: { some: { status: "PAID" } } } }),
  ]);
  const steps: Step[] = [
    { key: "signed_up", label: "Signed up", help: "Accounts created", count: signedUp },
    { key: "age_ok", label: "Passed the age check", help: "Answered the age question and accepted the terms", count: ageOk },
    { key: "onboarded", label: "Finished onboarding", help: "Name and goals saved", count: onboarded },
    { key: "created", label: "Started a 360", help: "Created at least one survey", count: created },
    { key: "self_done", label: "Rated themselves", help: "Locked their self-assessment", count: selfDone },
    { key: "launched", label: "Sent invitations", help: "Launched a survey", count: launched },
    { key: "responses", label: "Got answers", help: "At least one rater answered", count: enough },
    { key: "report", label: "Got a report", help: "Closed a survey with results", count: reported },
    { key: "viewed", label: "Opened the report", help: "Looked at a report at least once", count: viewed },
    { key: "plan", label: "Made a plan", help: "Created a development plan", count: planned },
    { key: "returned", label: "Came back", help: "Ran a follow-up session or pulse check", count: returned },
    { key: "paid", label: "Paid", help: "Made at least one paid purchase", count: paid },
  ];

  // Raters, for surveys launched in the window (raters have no accounts; these are invitation totals).
  const inv: Prisma.RaterInviteWhereInput = {
    assessment: { launchedAt: since ? { gte: since } : { not: null }, ...(opts.includeTest ? {} : { subject: userWhere(null, false) }) },
  };
  const [invited, started, submitted, declined] = await Promise.all([
    db.raterInvite.count({ where: inv }),
    db.raterInvite.count({ where: { ...inv, status: { in: ["STARTED", "SUBMITTED"] } } }),
    db.raterInvite.count({ where: { ...inv, status: "SUBMITTED" } }),
    db.raterInvite.count({ where: { ...inv, status: "DECLINED" } }),
  ]);
  const raters: Step[] = [
    { key: "invited", label: "Invited", help: "Invitations in surveys launched in this period", count: invited },
    { key: "started", label: "Started", help: "Opened the form and began answering", count: started },
    { key: "submitted", label: "Answered", help: "Submitted feedback", count: submitted },
  ];
  return { since, steps, raters, declined };
}

/** Conversion from the previous step and from the first step, as whole percentages. */
export function rates(steps: Step[]) {
  return steps.map((s, i) => ({
    ...s,
    fromPrev: i === 0 || !steps[i - 1].count ? null : Math.round((s.count / steps[i - 1].count) * 100),
    fromStart: !steps[0].count ? null : Math.round((s.count / steps[0].count) * 100),
  }));
}
