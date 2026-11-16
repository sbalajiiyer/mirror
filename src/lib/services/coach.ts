import "server-only";
import { z } from "zod";
import type { CoachClientLink } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { assertCoachCapacity, coachHasBranding } from "@/lib/services/billing";
import { normalizeEmail } from "@/lib/email-address";
import { sendEmail } from "@/lib/email";
import { coachInviteEmail } from "@/lib/email/templates";
import { hashToken, newToken } from "@/lib/tokens";
import { appUrl } from "@/lib/url";
import type { ReportData } from "@/lib/report/compute";
import { goalProgress, toSeriesPoint, type SeriesPoint } from "@/lib/progress";
import { buildBrief, crossClient, withoutComments, type Brief, type ClientSnapshot } from "@/lib/coach/brief";
import { sessionKind, surveyCode } from "@/lib/survey";
import type { StoredPlan } from "@/lib/ai/features/plan";

/*
 * Coach workspace (Phase 5). The client is always in control:
 * - a coach sees nothing until the client accepts (or the client invites them);
 * - what is shared is set per link by the client (reports, verbatim comments, goals, plan, branding);
 * - either side can end the link, and access stops immediately.
 * Every read for a coach goes through requireLink(), which checks an ACTIVE link and the scope.
 */

export const coachProfileSchema = z.object({
  displayName: z.string().trim().min(1, "Enter your name").max(80),
  brandName: z.string().trim().max(60).optional().default(""),
  brandColor: z
    .string()
    .trim()
    .regex(/^(#[0-9a-fA-F]{6})?$/, "Use a hex colour like #0f766e")
    .optional()
    .default(""),
  website: z.string().trim().max(200).url("Enter a full web address (https://…)").optional().or(z.literal("")).default(""),
});

export const sharingSchema = z.object({
  shareReports: z.boolean(),
  shareComments: z.boolean(),
  shareGoals: z.boolean(),
  sharePlan: z.boolean(),
  showBranding: z.boolean(),
});
export type Sharing = z.infer<typeof sharingSchema>;

const firstName = (n?: string | null) => (n ?? "").trim().split(/\s+/)[0] || "Your client";

async function displayName(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, include: { profile: true, coachProfile: true } });
  return u?.coachProfile?.displayName || u?.profile?.displayName || u?.name || u?.email?.split("@")[0] || "Someone";
}

// ------------------------------------------------------------------ coach profile

export async function getCoachProfile(userId: string) {
  return db.coachProfile.findUnique({ where: { userId } });
}

export async function saveCoachProfile(userId: string, raw: unknown) {
  const input = coachProfileSchema.parse(raw);
  const data = { displayName: input.displayName, brandName: input.brandName || null, brandColor: input.brandColor || null, website: input.website || null };
  const p = await db.coachProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  await audit(userId, "coach.profile", "CoachProfile", userId);
  return p;
}

async function requireCoach(userId: string) {
  const p = await getCoachProfile(userId);
  if (!p) throw new DomainError("Set up your coach profile first.", "not_coach");
  return p;
}

// ------------------------------------------------------------------ invitations

async function assertNoOpenLink(where: { coachId?: string; clientId?: string; inviteEmail?: string }, otherUserEmail?: string | null) {
  const existing = await db.coachClientLink.findFirst({
    where: { ...where, status: { in: ["PENDING", "ACTIVE"] } },
  });
  if (existing) throw new DomainError(existing.status === "ACTIVE" ? "You're already connected." : `An invitation to ${otherUserEmail ?? where.inviteEmail} is already waiting.`);
}

/** Coach invites a client by email. */
export async function inviteClient(coachId: string, rawEmail: string) {
  await requireCoach(coachId);
  await assertCoachCapacity(coachId);
  const email = normalizeEmail(rawEmail);
  if (!email) throw new DomainError("Enter a valid email address.");
  const me = await db.user.findUniqueOrThrow({ where: { id: coachId } });
  if (me.email === email) throw new DomainError("You can't coach yourself.");
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) await assertNoOpenLink({ coachId, clientId: existingUser.id }, email);
  await assertNoOpenLink({ coachId, inviteEmail: email });
  const token = newToken();
  const link = await db.coachClientLink.create({ data: { coachId, initiatedBy: "COACH", inviteEmail: email, inviteTokenHash: hashToken(token) } });
  await sendEmail(coachInviteEmail({ to: email, fromName: await displayName(coachId), asRole: "client", link: appUrl(`/coaching/invite/${token}`) }));
  await audit(coachId, "coach.invite_client", "CoachClientLink", link.id);
  return link;
}

/** Client invites their coach by email. */
export async function inviteCoach(clientId: string, rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new DomainError("Enter a valid email address.");
  const me = await db.user.findUniqueOrThrow({ where: { id: clientId } });
  if (me.email === email) throw new DomainError("You can't be your own coach.");
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) await assertNoOpenLink({ coachId: existingUser.id, clientId }, email);
  await assertNoOpenLink({ clientId, inviteEmail: email });
  const token = newToken();
  const link = await db.coachClientLink.create({ data: { clientId, initiatedBy: "CLIENT", inviteEmail: email, inviteTokenHash: hashToken(token) } });
  await sendEmail(coachInviteEmail({ to: email, fromName: await displayName(clientId), asRole: "coach", link: appUrl(`/coaching/invite/${token}`) }));
  await audit(clientId, "coach.invite_coach", "CoachClientLink", link.id);
  return link;
}

function maskEmail(e: string) {
  const [l, d] = e.split("@");
  return `${l.slice(0, 2)}${"•".repeat(Math.max(1, l.length - 2))}@${d}`;
}

/** Public view of an invitation (for the landing page). */
export async function inviteByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const link = await db.coachClientLink.findUnique({ where: { inviteTokenHash: hashToken(token) } });
  if (!link || link.status !== "PENDING") return null;
  const fromId = link.initiatedBy === "COACH" ? link.coachId! : link.clientId!;
  return { id: link.id, from: await displayName(fromId), youAre: link.initiatedBy === "COACH" ? ("client" as const) : ("coach" as const), sentTo: maskEmail(link.inviteEmail) };
}

async function respond(userId: string, link: CoachClientLink | null, accept: boolean) {
  if (!link || link.status !== "PENDING") throw new DomainError("This invitation is no longer valid.", "not_found");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  // Invitations are for one address: forwarding the link doesn't hand over access.
  if (normalizeEmail(user.email ?? "") !== link.inviteEmail) throw new DomainError(`This invitation was sent to ${maskEmail(link.inviteEmail)}. Sign in with that address to respond.`, "wrong_account");
  if (!accept) {
    await db.coachClientLink.update({ where: { id: link.id }, data: { status: "DECLINED", inviteTokenHash: null, endedAt: new Date() } });
    await db.marketplaceReferral.updateMany({ where: { linkId: link.id, status: "PENDING" }, data: { status: "DECLINED" } });
    await audit(userId, "coach.decline", "CoachClientLink", link.id);
    return link.id;
  }
  const coachId = link.initiatedBy === "COACH" ? link.coachId! : userId;
  const clientId = link.initiatedBy === "COACH" ? userId : link.clientId!;
  if (coachId === clientId) throw new DomainError("You can't coach yourself.");
  const active = await db.coachClientLink.findFirst({ where: { coachId, clientId, status: "ACTIVE" } });
  if (active) {
    await db.coachClientLink.update({ where: { id: link.id }, data: { status: "DECLINED", inviteTokenHash: null, endedAt: new Date() } });
    return active.id;
  }
  // The coach's plan limits active clients (Phase 9); pending invitations they sent already count.
  if (link.initiatedBy === "CLIENT") await assertCoachCapacity(coachId);
  if (link.initiatedBy === "CLIENT" && !(await getCoachProfile(userId))) {
    // Accepting a client's request makes you a coach, with a profile you can edit later.
    await db.coachProfile.create({ data: { userId, displayName: await displayName(userId) } });
  }
  await db.coachClientLink.update({ where: { id: link.id }, data: { coachId, clientId, status: "ACTIVE", acceptedAt: new Date(), inviteTokenHash: null } });
  // Marketplace intro accepted: the referral fee becomes due (Phase 9).
  await db.marketplaceReferral.updateMany({ where: { linkId: link.id, status: "PENDING" }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
  await audit(userId, "coach.accept", "CoachClientLink", link.id);
  return link.id;
}

export async function respondToInviteToken(userId: string, token: string, accept: boolean) {
  const link = /^[A-Za-z0-9_-]{40,64}$/.test(token) ? await db.coachClientLink.findUnique({ where: { inviteTokenHash: hashToken(token) } }) : null;
  return respond(userId, link, accept);
}

export async function respondToInvite(userId: string, linkId: string, accept: boolean) {
  return respond(userId, await db.coachClientLink.findUnique({ where: { id: linkId } }), accept);
}

/** Either side ends the relationship. Pending invitations can be withdrawn by their sender. */
export async function endLink(userId: string, linkId: string) {
  const link = await db.coachClientLink.findUnique({ where: { id: linkId } });
  if (!link || (link.coachId !== userId && link.clientId !== userId)) throw new DomainError("Not found", "not_found");
  if (link.status !== "ACTIVE" && link.status !== "PENDING") return;
  await db.coachClientLink.update({ where: { id: link.id }, data: { status: "REVOKED", endedAt: new Date(), inviteTokenHash: null } });
  await audit(userId, "coach.end", "CoachClientLink", link.id);
}

/** Only the client changes what is shared. */
export async function updateSharing(clientId: string, linkId: string, raw: unknown) {
  const input = sharingSchema.parse(raw);
  const link = await db.coachClientLink.findFirst({ where: { id: linkId, clientId } });
  if (!link) throw new DomainError("Not found", "not_found");
  await db.coachClientLink.update({ where: { id: link.id }, data: { ...input, shareComments: input.shareReports && input.shareComments } });
  await audit(clientId, "coach.sharing", "CoachClientLink", link.id, input);
}

// ------------------------------------------------------------------ client side

export async function clientCoaching(clientId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: clientId } });
  const links = await db.coachClientLink.findMany({
    where: { clientId, status: { in: ["ACTIVE", "PENDING"] } },
    include: { coach: { include: { coachProfile: true } } },
    orderBy: { createdAt: "desc" },
  });
  const incoming = user.email
    ? await db.coachClientLink.findMany({ where: { inviteEmail: user.email, status: "PENDING", initiatedBy: "COACH" }, include: { coach: { include: { coachProfile: true } } } })
    : [];
  const meetings = await db.coachMeeting.findMany({ where: { clientId, scheduledAt: { gte: new Date(Date.now() - 3600_000) } }, orderBy: { scheduledAt: "asc" }, take: 5 });
  const coachNames = new Map(links.filter((l) => l.coach).map((l) => [l.coachId!, l.coach!.coachProfile?.displayName ?? l.coach!.name ?? "Coach"]));
  return {
    active: links.filter((l) => l.status === "ACTIVE"),
    sent: links.filter((l) => l.status === "PENDING" && l.initiatedBy === "CLIENT"),
    incoming,
    meetings: meetings.map((m) => ({ ...m, coachName: coachNames.get(m.coachId) ?? "Your coach" })),
    isCoach: !!(await getCoachProfile(clientId)),
  };
}

/** Branding to show on a client's own report: their most recent coach who has a brand, if the client allows it. */
export async function brandingForClient(clientId: string) {
  const link = await db.coachClientLink.findFirst({
    where: { clientId, status: "ACTIVE", showBranding: true, coach: { coachProfile: { brandName: { not: null } } } },
    include: { coach: { include: { coachProfile: true } } },
    orderBy: { acceptedAt: "desc" },
  });
  const p = link?.coach?.coachProfile;
  // White-label is a paid coach feature (Phase 9).
  if (link?.coachId && !(await coachHasBranding(link.coachId))) return null;
  return p?.brandName ? { name: p.brandName, color: p.brandColor ?? null, coach: p.displayName, website: p.website ?? null } : null;
}

// ------------------------------------------------------------------ coach side

async function requireLink(coachId: string, clientId: string, scope?: keyof Pick<CoachClientLink, "shareReports" | "shareGoals" | "sharePlan">) {
  const link = await db.coachClientLink.findFirst({ where: { coachId, clientId, status: "ACTIVE" } });
  if (!link) throw new DomainError("Not found", "not_found");
  if (scope && !link[scope]) throw new DomainError("Your client hasn't shared this.", "not_shared");
  return link;
}

type SessionRow = Awaited<ReturnType<typeof loadSessions>>[number];

async function loadSessions(clientId: string) {
  return db.assessment.findMany({
    where: { subjectId: clientId },
    orderBy: [{ createdAt: "asc" }],
    include: { invites: { select: { status: true } }, reports: { orderBy: { generatedAt: "desc" }, take: 1, select: { data: true } } },
  });
}

const visibleReport = (s: SessionRow) => {
  const d = s.reports[0]?.data as unknown as ReportData | undefined;
  return s.status === "CLOSED" && d?.anonymity.available ? d : null;
};
const sessionName = (s: SessionRow) => `S${s.sessionNumber} · ${sessionKind(s.type)}${s.sessionLabel ? ` · ${s.sessionLabel}` : ""}`;

export async function portfolio(coachId: string) {
  const profile = await requireCoach(coachId);
  const links = await db.coachClientLink.findMany({
    where: { coachId, status: { in: ["ACTIVE", "PENDING"] } },
    include: { client: { include: { profile: true } } },
    orderBy: { createdAt: "desc" },
  });
  const active = links.filter((l) => l.status === "ACTIVE" && l.client);
  const clients = await Promise.all(
    active.map(async (l) => {
      const sessions = await loadSessions(l.clientId!);
      const open = [...sessions].reverse().find((s) => s.status !== "CLOSED");
      const latestClosed = [...sessions].reverse().find((s) => visibleReport(s));
      const responses = open ? { done: open.invites.filter((i) => i.status === "SUBMITTED").length, total: open.invites.length } : null;
      const nextMeeting = await db.coachMeeting.findFirst({ where: { coachId, clientId: l.clientId!, scheduledAt: { gte: new Date() } }, orderBy: { scheduledAt: "asc" } });
      const nextPulse = sessions.map((s) => s.nextPulseDueAt).filter((d): d is Date => !!d && d > new Date()).sort((a, b) => +a - +b)[0] ?? null;
      const activeGoals = l.shareGoals ? await db.goal.count({ where: { userId: l.clientId!, status: "ACTIVE" } }) : null;
      return {
        linkId: l.id,
        clientId: l.clientId!,
        name: l.client!.profile?.displayName ?? l.client!.name ?? l.client!.email ?? "Client",
        email: l.client!.email,
        since: l.acceptedAt,
        sharing: { reports: l.shareReports, comments: l.shareComments, goals: l.shareGoals, plan: l.sharePlan },
        surveys: new Set(sessions.map((s) => s.rootAssessmentId ?? s.id)).size,
        openSession: open ? { name: sessionName(open), status: open.status, dueAt: open.dueAt, responses } : null,
        latest: latestClosed ? { name: sessionName(latestClosed), closedAt: latestClosed.closedAt, score: l.shareReports ? (visibleReport(latestClosed)!.summary.overallOthers ?? null) : null } : null,
        nextMeeting: nextMeeting ? { at: nextMeeting.scheduledAt, topic: nextMeeting.topic } : null,
        nextPulse,
        activeGoals,
      };
    }),
  );
  return {
    profile,
    clients,
    pending: links.filter((l) => l.status === "PENDING").map((l) => ({ id: l.id, email: l.inviteEmail, initiatedBy: l.initiatedBy, createdAt: l.createdAt })),
    incoming: await coachRequests(coachId),
  };
}

/** Requests from people who asked this user to be their coach (by email). */
export async function coachRequests(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.email) return [];
  const links = await db.coachClientLink.findMany({
    where: { inviteEmail: user.email, initiatedBy: "CLIENT", status: "PENDING" },
    include: { client: { include: { profile: true } } },
    orderBy: { createdAt: "desc" },
  });
  return links.map((l) => ({ id: l.id, from: l.client?.profile?.displayName ?? l.client?.name ?? "Someone", createdAt: l.createdAt }));
}

export async function clientDetail(coachId: string, clientId: string) {
  await requireCoach(coachId);
  const link = await requireLink(coachId, clientId);
  const client = await db.user.findUniqueOrThrow({ where: { id: clientId }, include: { profile: true } });
  const sessions = await loadSessions(clientId);
  const shared = link.shareReports ? sessions.filter((s) => visibleReport(s)).reverse() : [];
  const goals = link.shareGoals ? await clientGoals(clientId, sessions) : null;
  let plan: { assessmentTitle: string; plan: StoredPlan } | null = null;
  if (link.sharePlan) {
    const p = await db.developmentPlan.findFirst({ where: { userId: clientId }, orderBy: { updatedAt: "desc" }, include: { assessment: { select: { title: true } } } });
    if (p) plan = { assessmentTitle: p.assessment.title, plan: p.data as unknown as StoredPlan };
  }
  const notes = await db.coachNote.findMany({ where: { coachId, clientId }, orderBy: { createdAt: "desc" } });
  const meetings = await db.coachMeeting.findMany({ where: { coachId, clientId }, orderBy: { scheduledAt: "desc" }, take: 10 });
  return {
    link,
    client: { id: client.id, name: client.profile?.displayName ?? client.name ?? client.email ?? "Client", email: client.email, jobTitle: client.profile?.jobTitle ?? null },
    sessions: sessions
      .slice()
      .reverse()
      .map((s) => ({ id: s.id, name: sessionName(s), title: s.title, status: s.status, closedAt: s.closedAt, shared: !!(link.shareReports && visibleReport(s)), responses: { done: s.invites.filter((i) => i.status === "SUBMITTED").length, total: s.invites.length } })),
    sharedCount: shared.length,
    goals,
    plan,
    notes,
    meetings,
  };
}

function pointsFor(sessions: SessionRow[], rootId: string): SeriesPoint[] {
  return sessions
    .filter((s) => (s.rootAssessmentId ?? s.id) === rootId && s.closedAt)
    .map((s) => {
      const d = visibleReport(s);
      return d ? toSeriesPoint({ id: s.id, title: s.title, type: s.type, closedAt: s.closedAt!, sessionNumber: s.sessionNumber, sessionLabel: s.sessionLabel }, d) : null;
    })
    .filter((p): p is SeriesPoint => !!p);
}

async function clientGoals(clientId: string, sessions: SessionRow[]) {
  const goals = await db.goal.findMany({ where: { userId: clientId, status: { not: "ARCHIVED" } }, orderBy: { createdAt: "asc" } });
  return goals.map((g) => ({ id: g.id, title: g.title, competencyName: g.competencyName, target: g.target, baseline: g.baseline, progress: goalProgress(g, pointsFor(sessions, g.assessmentId)) }));
}

/** A shared report as the coach sees it (verbatim comments removed unless the client shares them). */
export async function coachReport(coachId: string, clientId: string, assessmentId: string) {
  const link = await requireLink(coachId, clientId, "shareReports");
  const s = await db.assessment.findFirst({ where: { id: assessmentId, subjectId: clientId }, include: { reports: { orderBy: { generatedAt: "desc" }, take: 1 } } });
  const data = s ? visibleReport({ ...s, invites: [] } as unknown as SessionRow) : null;
  if (!s || !data) throw new DomainError("Not found", "not_found");
  await audit(coachId, "coach.view_report", "Assessment", s.id);
  return { report: link.shareComments ? data : withoutComments(data), generatedAt: s.reports[0]!.generatedAt, session: { code: surveyCode(s.rootAssessmentId ?? s.id), sessionNumber: s.sessionNumber, kind: sessionKind(s.type), label: s.sessionLabel } };
}

export async function sessionPrep(coachId: string, clientId: string): Promise<Brief> {
  const link = await requireLink(coachId, clientId);
  const client = await db.user.findUniqueOrThrow({ where: { id: clientId }, include: { profile: true } });
  const sessions = await loadSessions(clientId);
  const open = [...sessions].reverse().find((s) => s.status !== "CLOSED");
  const openText = open ? `${sessionName(open)} is ${open.status.toLowerCase()} (${open.invites.filter((i) => i.status === "SUBMITTED").length}/${open.invites.length} responded).` : null;
  const name = firstName(client.profile?.displayName ?? client.name);
  if (!link.shareReports) return buildBrief({ clientFirstName: name, latest: null, previous: null, goals: [], openSession: openText });
  const closed = sessions.filter((s) => visibleReport(s)).sort((a, b) => +a.closedAt! - +b.closedAt!);
  const last = closed[closed.length - 1];
  const prev = last ? [...closed].reverse().find((s) => s !== last && (s.rootAssessmentId ?? s.id) === (last.rootAssessmentId ?? last.id)) : undefined;
  const point = (s?: SessionRow) => (s ? pointsFor([s], s.rootAssessmentId ?? s.id)[0] ?? null : null);
  const goals = link.shareGoals ? (await clientGoals(clientId, sessions)).map((g) => ({ title: g.title, target: g.target, progress: g.progress })) : [];
  return buildBrief({
    clientFirstName: name,
    latest: last ? { report: visibleReport(last)!, label: sessionName(last), date: last.closedAt!.toISOString(), point: point(last) } : null,
    previous: prev ? { label: sessionName(prev), point: point(prev) } : null,
    goals,
    openSession: openText,
  });
}

/** Anonymised patterns across every client who shares reports; hidden below MIN_CLIENTS. */
export async function crossClientAnalytics(coachId: string) {
  await requireCoach(coachId);
  const links = await db.coachClientLink.findMany({ where: { coachId, status: "ACTIVE", shareReports: true } });
  const snapshots: ClientSnapshot[] = [];
  for (const l of links) {
    const full = (await loadSessions(l.clientId!)).filter((s) => s.type === "FULL_360" && visibleReport(s)).sort((a, b) => +a.closedAt! - +b.closedAt!);
    if (!full.length) continue;
    const latest = visibleReport(full[full.length - 1])!;
    const first = full.length > 1 ? visibleReport(full[0]) : null;
    snapshots.push({ latest, first });
  }
  return crossClient(snapshots);
}

// ------------------------------------------------------------------ notes and meetings

export async function addNote(coachId: string, clientId: string, body: string) {
  await requireLink(coachId, clientId);
  const text = z.string().trim().min(1, "Write something first").max(4000).parse(body);
  return db.coachNote.create({ data: { coachId, clientId, body: text } });
}

export async function deleteNote(coachId: string, noteId: string) {
  const n = await db.coachNote.findFirst({ where: { id: noteId, coachId } });
  if (!n) throw new DomainError("Not found", "not_found");
  await db.coachNote.delete({ where: { id: n.id } });
}

export async function scheduleMeeting(coachId: string, clientId: string, raw: { scheduledAt: string; topic?: string }) {
  await requireLink(coachId, clientId);
  const input = z.object({ scheduledAt: z.string().min(1, "Pick a date and time"), topic: z.string().trim().max(120).optional().default("") }).parse(raw);
  const at = new Date(input.scheduledAt);
  if (Number.isNaN(+at)) throw new DomainError("Pick a valid date and time");
  return db.coachMeeting.create({ data: { coachId, clientId, scheduledAt: at, topic: input.topic } });
}

export async function deleteMeeting(coachId: string, meetingId: string) {
  const m = await db.coachMeeting.findFirst({ where: { id: meetingId, coachId } });
  if (!m) throw new DomainError("Not found", "not_found");
  await db.coachMeeting.delete({ where: { id: m.id } });
}

/** Ids of the coaches a client is actively linked to (their questionnaires become available to the client). */
export async function activeCoachIds(clientId: string) {
  const links = await db.coachClientLink.findMany({ where: { clientId, status: "ACTIVE" }, select: { coachId: true } });
  return links.map((l) => l.coachId!).filter(Boolean);
}
