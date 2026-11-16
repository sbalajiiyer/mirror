import "server-only";
import { z } from "zod";
import type { OrgMember } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { consumeOrgSeats } from "@/lib/services/billing";
import { normalizeEmail } from "@/lib/email-address";
import { sendEmail } from "@/lib/email";
import { orgCampaignEmail, orgInviteEmail } from "@/lib/email/templates";
import { hashToken, newToken } from "@/lib/tokens";
import { appUrl } from "@/lib/url";
import type { ReportData } from "@/lib/report/compute";
import { withoutComments } from "@/lib/coach/brief";
import { compareGroups, groupProfile, minFor, nineBox, participation, strengthsAndGaps, teamHeatmap, type MemberReport } from "@/lib/org/analytics";
import { assertCanUseFramework } from "@/lib/services/frameworks";
import { sessionKind, surveyCode } from "@/lib/survey";

/*
 * Organizations (Phase 6). Privacy model (owner decision 2026-11-16: aggregates + opt-in):
 * - Only 360s started from an org campaign ever count for the org; personal 360s never do.
 * - Admins see participation and group averages with at least `minGroupSize` (≥ 5) people.
 * - An individual's report is visible to admins only if that member turns on "share my reports";
 *   verbatim comments are never shown to admins.
 * - The talent grid lists only members who opted in, against a performance rating an admin enters.
 */

// ------------------------------------------------------------------ helpers

async function requireMember(userId: string, orgId: string) {
  const m = await db.orgMember.findFirst({ where: { orgId, userId, status: "ACTIVE" }, include: { org: true } });
  if (!m) throw new DomainError("Not found", "not_found");
  return m;
}

export async function requireAdmin(userId: string, orgId: string) {
  const m = await requireMember(userId, orgId);
  if (m.role !== "ADMIN") throw new DomainError("Only organization admins can do that.", "forbidden");
  return m;
}

const display = (m: Pick<OrgMember, "name" | "email">) => m.name || m.email.split("@")[0];

/** "Ana Silva <ana@x.com>", "ana@x.com, Ana Silva", "ana@x.com" — one per line or separated by ; */
export function parseMemberList(text: string): { email: string; name: string }[] {
  const out: { email: string; name: string }[] = [];
  for (const raw of text.split(/[\n;]+/)) {
    const line = raw.trim();
    if (!line) continue;
    const angle = line.match(/^(.*)<([^>]+)>$/);
    let email = "";
    let name = "";
    if (angle) {
      name = angle[1].trim().replace(/^"|"$/g, "");
      email = angle[2];
    } else {
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      const i = parts.findIndex((p) => p.includes("@"));
      email = i >= 0 ? parts[i] : "";
      name = parts.filter((_, j) => j !== i).join(" ").trim();
    }
    const e = normalizeEmail(email);
    if (e && !out.some((o) => o.email === e)) out.push({ email: e, name: name.slice(0, 80) });
  }
  return out;
}

// ------------------------------------------------------------------ orgs and members

export async function createOrg(userId: string, rawName: string) {
  const name = z.string().trim().min(2, "Give your organization a name").max(80).parse(rawName);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
  const org = await db.organization.create({
    data: {
      name,
      createdById: userId,
      members: { create: { userId, email: user.email!, name: user.profile?.displayName ?? user.name ?? "", role: "ADMIN", status: "ACTIVE", joinedAt: new Date() } },
    },
  });
  await audit(userId, "org.create", "Organization", org.id);
  return org;
}

export async function myOrgs(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const memberships = await db.orgMember.findMany({ where: { userId, status: "ACTIVE" }, include: { org: true }, orderBy: { joinedAt: "asc" } });
  const invites = user.email ? await db.orgMember.findMany({ where: { email: user.email, status: "INVITED" }, include: { org: true } }) : [];
  return { memberships, invites };
}

export async function inviteMembers(adminId: string, orgId: string, text: string) {
  const admin = await requireAdmin(adminId, orgId);
  const people = parseMemberList(text);
  if (!people.length) throw new DomainError("Add at least one email address.");
  if (people.length > 200) throw new DomainError("Invite at most 200 people at a time.");
  const existing = new Set((await db.orgMember.findMany({ where: { orgId, email: { in: people.map((p) => p.email) }, status: { not: "REMOVED" } } })).map((m) => m.email));
  const added: string[] = [];
  for (const p of people) {
    if (existing.has(p.email)) continue;
    const token = newToken();
    await db.orgMember.upsert({
      where: { orgId_email: { orgId, email: p.email } },
      create: { orgId, email: p.email, name: p.name, inviteTokenHash: hashToken(token) },
      update: { name: p.name, status: "INVITED", inviteTokenHash: hashToken(token), userId: null, role: "MEMBER", shareReports: false, shareTalentGrid: false, performance: null, invitedAt: new Date(), joinedAt: null },
    });
    await sendEmail(orgInviteEmail({ to: p.email, orgName: admin.org.name, fromName: display(admin), link: appUrl(`/orgs/invite/${token}`) }));
    added.push(p.email);
  }
  await audit(adminId, "org.invite", "Organization", orgId, { count: added.length });
  return { added, skipped: people.length - added.length };
}

export async function orgInviteByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const m = await db.orgMember.findUnique({ where: { inviteTokenHash: hashToken(token) }, include: { org: true } });
  if (!m || m.status !== "INVITED") return null;
  const [l, d] = m.email.split("@");
  return { memberId: m.id, orgName: m.org.name, sentTo: `${l.slice(0, 2)}${"•".repeat(Math.max(1, l.length - 2))}@${d}` };
}

async function respond(userId: string, m: OrgMember | null, accept: boolean) {
  if (!m || m.status !== "INVITED") throw new DomainError("This invitation is no longer valid.", "not_found");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
  if (normalizeEmail(user.email ?? "") !== m.email) throw new DomainError("This invitation was sent to a different email address. Sign in with that address to respond.", "wrong_account");
  if (!accept) {
    await db.orgMember.update({ where: { id: m.id }, data: { status: "REMOVED", inviteTokenHash: null } });
    return m.orgId;
  }
  await db.orgMember.update({ where: { id: m.id }, data: { userId, status: "ACTIVE", joinedAt: new Date(), inviteTokenHash: null, name: m.name || user.profile?.displayName || user.name || "" } });
  await audit(userId, "org.join", "Organization", m.orgId);
  return m.orgId;
}

export async function respondOrgInviteToken(userId: string, token: string, accept: boolean) {
  const m = /^[A-Za-z0-9_-]{40,64}$/.test(token) ? await db.orgMember.findUnique({ where: { inviteTokenHash: hashToken(token) } }) : null;
  return respond(userId, m, accept);
}

export async function respondOrgInvite(userId: string, memberId: string, accept: boolean) {
  return respond(userId, await db.orgMember.findUnique({ where: { id: memberId } }), accept);
}

export const consentSchema = z.object({ shareReports: z.boolean(), shareTalentGrid: z.boolean() });

/** Only the member changes their own consent. */
export async function updateConsent(userId: string, orgId: string, raw: unknown) {
  const input = consentSchema.parse(raw);
  const m = await requireMember(userId, orgId);
  await db.orgMember.update({ where: { id: m.id }, data: input });
  await audit(userId, "org.consent", "OrgMember", m.id, input);
}

async function adminCount(orgId: string) {
  return db.orgMember.count({ where: { orgId, role: "ADMIN", status: "ACTIVE" } });
}

export async function setRole(adminId: string, orgId: string, memberId: string, role: "ADMIN" | "MEMBER") {
  await requireAdmin(adminId, orgId);
  const m = await db.orgMember.findFirst({ where: { id: memberId, orgId, status: "ACTIVE" } });
  if (!m) throw new DomainError("Not found", "not_found");
  if (m.role === "ADMIN" && role === "MEMBER" && (await adminCount(orgId)) <= 1) throw new DomainError("An organization needs at least one admin.");
  await db.orgMember.update({ where: { id: m.id }, data: { role } });
  await audit(adminId, "org.role", "OrgMember", m.id, { role });
}

export async function removeMember(adminId: string, orgId: string, memberId: string) {
  await requireAdmin(adminId, orgId);
  const m = await db.orgMember.findFirst({ where: { id: memberId, orgId } });
  if (!m) throw new DomainError("Not found", "not_found");
  if (m.role === "ADMIN" && m.status === "ACTIVE" && (await adminCount(orgId)) <= 1) throw new DomainError("An organization needs at least one admin.");
  await db.orgMember.update({ where: { id: m.id }, data: { status: "REMOVED", inviteTokenHash: null, shareReports: false, shareTalentGrid: false } });
  await db.orgGroupMember.deleteMany({ where: { memberId: m.id } });
  await audit(adminId, "org.remove", "OrgMember", m.id);
}

export async function leaveOrg(userId: string, orgId: string) {
  const m = await requireMember(userId, orgId);
  if (m.role === "ADMIN" && (await adminCount(orgId)) <= 1) throw new DomainError("Make someone else an admin before you leave.");
  await db.orgMember.update({ where: { id: m.id }, data: { status: "REMOVED", shareReports: false, shareTalentGrid: false } });
  await db.orgGroupMember.deleteMany({ where: { memberId: m.id } });
  await audit(userId, "org.leave", "Organization", orgId);
}

export async function setPerformance(adminId: string, orgId: string, memberId: string, value: number | null) {
  await requireAdmin(adminId, orgId);
  if (value != null && ![1, 2, 3].includes(value)) throw new DomainError("Performance must be low, medium or high.");
  const m = await db.orgMember.findFirst({ where: { id: memberId, orgId, status: "ACTIVE" } });
  if (!m) throw new DomainError("Not found", "not_found");
  await db.orgMember.update({ where: { id: m.id }, data: { performance: value } });
  await audit(adminId, "org.performance", "OrgMember", m.id);
}

// ------------------------------------------------------------------ teams and cohorts

export async function createGroup(adminId: string, orgId: string, kind: "TEAM" | "COHORT", rawName: string) {
  await requireAdmin(adminId, orgId);
  const name = z.string().trim().min(2, "Give it a name").max(60).parse(rawName);
  if (await db.orgGroup.findFirst({ where: { orgId, kind, name } })) throw new DomainError(`There's already a ${kind === "TEAM" ? "team" : "cohort"} called ${name}.`);
  return db.orgGroup.create({ data: { orgId, kind, name } });
}

export async function deleteGroup(adminId: string, orgId: string, groupId: string) {
  await requireAdmin(adminId, orgId);
  await db.orgGroup.deleteMany({ where: { id: groupId, orgId } });
}

export async function setGroupMembers(adminId: string, orgId: string, groupId: string, memberIds: string[]) {
  await requireAdmin(adminId, orgId);
  const g = await db.orgGroup.findFirst({ where: { id: groupId, orgId } });
  if (!g) throw new DomainError("Not found", "not_found");
  const valid = await db.orgMember.findMany({ where: { orgId, id: { in: memberIds }, status: { not: "REMOVED" } }, select: { id: true } });
  await db.$transaction([db.orgGroupMember.deleteMany({ where: { groupId } }), db.orgGroupMember.createMany({ data: valid.map((m) => ({ groupId, memberId: m.id })) })]);
}

// ------------------------------------------------------------------ campaigns

export const campaignSchema = z.object({
  name: z.string().trim().min(3, "Give the 360 round a name").max(80),
  groupId: z.string().nullable().optional(),
  frameworkId: z.string().min(1),
  teamMode: z.boolean().default(false),
  dueInDays: z.number().int().min(7).max(90).default(21),
});

export async function createCampaign(adminId: string, orgId: string, raw: unknown) {
  const admin = await requireAdmin(adminId, orgId);
  const input = campaignSchema.parse(raw);
  await assertCanUseFramework(adminId, input.frameworkId);
  if (input.groupId && !(await db.orgGroup.findFirst({ where: { id: input.groupId, orgId } }))) throw new DomainError("Unknown team or cohort");
  if (input.teamMode && !input.groupId) throw new DomainError("A team 360 needs a team.");
  const dueAt = new Date(Date.now() + input.dueInDays * 86400000);
  const members = await campaignMembers(orgId, input.groupId ?? null);
  // One participant seat per person per round (Phase 9).
  const c = await db.$transaction(async (tx) => {
    await consumeOrgSeats(tx, orgId, members.length);
    return tx.orgCampaign.create({ data: { orgId, name: input.name, groupId: input.groupId ?? null, frameworkId: input.frameworkId, teamMode: input.teamMode, dueAt } });
  });
  for (const m of members) await sendEmail(orgCampaignEmail({ to: m.email, orgName: admin.org.name, campaignName: c.name, link: appUrl(`/assessments/new?campaign=${c.id}`), dueAt }));
  await audit(adminId, "org.campaign", "OrgCampaign", c.id, { members: members.length });
  return c;
}

async function campaignMembers(orgId: string, groupId: string | null) {
  return db.orgMember.findMany({ where: { orgId, status: "ACTIVE", ...(groupId ? { groups: { some: { groupId } } } : {}) }, orderBy: { name: "asc" } });
}

/** For the 360 wizard: what this member's campaign 360 must use (and suggested teammates for a team 360). */
export async function campaignContext(userId: string, campaignId: string) {
  const c = await db.orgCampaign.findUnique({ where: { id: campaignId }, include: { org: true, group: true } });
  if (!c) throw new DomainError("Not found", "not_found");
  const me = await db.orgMember.findFirst({ where: { orgId: c.orgId, userId, status: "ACTIVE", ...(c.groupId ? { groups: { some: { groupId: c.groupId } } } : {}) } });
  if (!me) throw new DomainError("This 360 round isn't for you.", "not_found");
  const already = await db.assessment.findFirst({ where: { subjectId: userId, orgCampaignId: c.id } });
  const teammates = c.teamMode ? (await campaignMembers(c.orgId, c.groupId)).filter((m) => m.id !== me.id).map((m) => ({ name: m.name, email: m.email })) : [];
  return { id: c.id, name: c.name, orgName: c.org.name, frameworkId: c.frameworkId, teamMode: c.teamMode, groupName: c.group?.name ?? null, dueAt: c.dueAt, existingAssessmentId: already?.id ?? null, teammates };
}

/** Org 360 rounds waiting for this user to set up. */
export async function memberTasks(userId: string) {
  const memberships = await db.orgMember.findMany({ where: { userId, status: "ACTIVE" }, include: { groups: true, org: true } });
  const tasks: { campaignId: string; name: string; orgId: string; orgName: string; dueAt: Date | null }[] = [];
  for (const m of memberships) {
    const campaigns = await db.orgCampaign.findMany({ where: { orgId: m.orgId, OR: [{ groupId: null }, { groupId: { in: m.groups.map((g) => g.groupId) } }] }, orderBy: { createdAt: "desc" } });
    for (const c of campaigns) {
      if (await db.assessment.findFirst({ where: { subjectId: userId, orgCampaignId: c.id } })) continue;
      if (c.dueAt && c.dueAt < new Date()) continue;
      tasks.push({ campaignId: c.id, name: c.name, orgId: m.orgId, orgName: m.org.name, dueAt: c.dueAt });
    }
  }
  return tasks;
}

// ------------------------------------------------------------------ admin views

type OrgAssessment = Awaited<ReturnType<typeof orgAssessments>>[number];

async function orgAssessments(orgId: string, campaignId?: string) {
  return db.assessment.findMany({
    where: { orgCampaign: { orgId, ...(campaignId ? { id: campaignId } : {}) } },
    include: { invites: { select: { status: true } }, reports: { orderBy: { generatedAt: "desc" }, take: 1, select: { data: true } }, orgCampaign: { select: { id: true, name: true } } },
    orderBy: { closedAt: "asc" },
  });
}

const visible = (a: OrgAssessment) => {
  const d = a.reports[0]?.data as unknown as ReportData | undefined;
  return a.status === "CLOSED" && d?.anonymity.available ? d : null;
};

/** Each member's latest visible org 360 (optionally within one campaign), keyed by member. */
async function memberReports(orgId: string, members: OrgMember[], campaignId?: string): Promise<MemberReport[]> {
  const byUser = new Map(members.filter((m) => m.userId).map((m) => [m.userId!, m]));
  const latest = new Map<string, ReportData>();
  for (const a of await orgAssessments(orgId, campaignId)) {
    const d = visible(a);
    if (d && byUser.has(a.subjectId)) latest.set(a.subjectId, d); // ordered by closedAt, so the last wins
  }
  return [...latest.entries()].map(([uid, report]) => {
    const m = byUser.get(uid)!;
    return { memberId: m.id, name: display(m), named: m.shareReports, report };
  });
}

export async function orgOverview(adminId: string, orgId: string) {
  const admin = await requireAdmin(adminId, orgId);
  const members = await db.orgMember.findMany({ where: { orgId, status: { not: "REMOVED" } }, include: { groups: { include: { group: true } } }, orderBy: [{ status: "asc" }, { name: "asc" }] });
  const active = members.filter((m) => m.status === "ACTIVE");
  const groups = await db.orgGroup.findMany({ where: { orgId }, include: { _count: { select: { members: true } } }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
  const campaigns = await db.orgCampaign.findMany({ where: { orgId }, include: { group: true }, orderBy: { createdAt: "desc" } });
  const all = await orgAssessments(orgId);
  const campaignStats = await Promise.all(
    campaigns.map(async (c) => ({
      id: c.id,
      name: c.name,
      group: c.group?.name ?? "Everyone",
      teamMode: c.teamMode,
      dueAt: c.dueAt,
      createdAt: c.createdAt,
      frameworkId: c.frameworkId,
      stats: participation((await campaignMembers(orgId, c.groupId)).length, all.filter((a) => a.orgCampaignId === c.id)),
    })),
  );
  const min = minFor(admin.org.minGroupSize);
  const profile = groupProfile((await memberReports(orgId, active)).map((m) => m.report), min);
  return { org: admin.org, min, members, groups, campaigns: campaignStats, profile, ...strengthsAndGaps(profile) };
}

export async function teamAnalytics(adminId: string, orgId: string, groupId: string, campaignId?: string) {
  const admin = await requireAdmin(adminId, orgId);
  const g = await db.orgGroup.findFirst({ where: { id: groupId, orgId } });
  if (!g) throw new DomainError("Not found", "not_found");
  const members = await db.orgMember.findMany({ where: { orgId, status: "ACTIVE", groups: { some: { groupId } } } });
  const reports = await memberReports(orgId, members, campaignId);
  const min = minFor(admin.org.minGroupSize);
  const all = await db.orgMember.findMany({ where: { orgId, status: "ACTIVE" } });
  const orgProfile = groupProfile((await memberReports(orgId, all, campaignId)).map((m) => m.report), min);
  return { group: g, min, members: members.length, withResults: reports.length, profile: groupProfile(reports.map((r) => r.report), min), orgProfile, heatmap: teamHeatmap(reports, min) };
}

export async function compareCohorts(adminId: string, orgId: string, a: { groupId?: string | null; campaignId?: string | null }, b: { groupId?: string | null; campaignId?: string | null }) {
  const admin = await requireAdmin(adminId, orgId);
  const side = async (s: { groupId?: string | null; campaignId?: string | null }) => {
    const group = s.groupId ? await db.orgGroup.findFirst({ where: { id: s.groupId, orgId } }) : null;
    const campaign = s.campaignId ? await db.orgCampaign.findFirst({ where: { id: s.campaignId, orgId } }) : null;
    if ((s.groupId && !group) || (s.campaignId && !campaign)) throw new DomainError("Not found", "not_found");
    const members = await db.orgMember.findMany({ where: { orgId, status: "ACTIVE", ...(group ? { groups: { some: { groupId: group.id } } } : {}) } });
    const reports = await memberReports(orgId, members, campaign?.id);
    return { label: [group?.name ?? "Everyone", campaign?.name].filter(Boolean).join(" · "), reports: reports.map((r) => r.report) };
  };
  return compareGroups(await side(a), await side(b), minFor(admin.org.minGroupSize));
}

export async function talentGrid(adminId: string, orgId: string) {
  await requireAdmin(adminId, orgId);
  const members = await db.orgMember.findMany({ where: { orgId, status: "ACTIVE" }, orderBy: { name: "asc" } });
  const consenting = members.filter((m) => m.shareTalentGrid);
  const reports = await memberReports(orgId, consenting);
  const grid = nineBox(
    consenting.map((m) => {
      const r = reports.find((x) => x.memberId === m.id)?.report;
      return { memberId: m.id, name: display(m), score: r?.summary.overallOthers ?? null, scaleMax: r?.assessment.scaleMax ?? 5, performance: m.performance };
    }),
  );
  return { grid, consenting: consenting.map((m) => ({ id: m.id, name: display(m), performance: m.performance })), notConsenting: members.length - consenting.length };
}

/** Sessions a consenting member's org 360s produced (for the admin's member page). */
export async function memberForAdmin(adminId: string, orgId: string, memberId: string) {
  await requireAdmin(adminId, orgId);
  const m = await db.orgMember.findFirst({ where: { id: memberId, orgId, status: { not: "REMOVED" } }, include: { groups: { include: { group: true } } } });
  if (!m) throw new DomainError("Not found", "not_found");
  const sessions = m.userId
    ? (await orgAssessments(orgId)).filter((a) => a.subjectId === m.userId).map((a) => ({ id: a.id, campaign: a.orgCampaign?.name ?? "", status: a.status, closedAt: a.closedAt, shared: m.shareReports && !!visible(a), responses: { done: a.invites.filter((i) => i.status === "SUBMITTED").length, total: a.invites.length } }))
    : [];
  return { member: m, sessions };
}

/** A consenting member's org 360 report for an admin: scores and themes, never verbatim comments. */
export async function adminMemberReport(adminId: string, orgId: string, memberId: string, assessmentId: string) {
  await requireAdmin(adminId, orgId);
  const m = await db.orgMember.findFirst({ where: { id: memberId, orgId, status: "ACTIVE" } });
  if (!m || !m.userId) throw new DomainError("Not found", "not_found");
  if (!m.shareReports) throw new DomainError("This person hasn't shared their reports with the organization.", "not_shared");
  const a = (await orgAssessments(orgId)).find((x) => x.id === assessmentId && x.subjectId === m.userId);
  const d = a ? visible(a) : null;
  if (!a || !d) throw new DomainError("Not found", "not_found");
  await audit(adminId, "org.view_report", "Assessment", a.id);
  const full = await db.assessment.findUniqueOrThrow({ where: { id: a.id }, include: { reports: { orderBy: { generatedAt: "desc" }, take: 1 } } });
  return {
    memberName: display(m),
    report: withoutComments(d),
    generatedAt: full.reports[0]!.generatedAt,
    session: { code: surveyCode(full.rootAssessmentId ?? full.id), sessionNumber: full.sessionNumber, kind: sessionKind(full.type), label: full.sessionLabel },
  };
}

/** What a member sees about their own membership. */
export async function memberView(userId: string, orgId: string) {
  const m = await requireMember(userId, orgId);
  const groups = await db.orgGroup.findMany({ where: { members: { some: { memberId: m.id } } } });
  const mine = await db.assessment.findMany({ where: { subjectId: userId, orgCampaign: { orgId } }, include: { orgCampaign: true }, orderBy: { createdAt: "desc" } });
  const tasks = (await memberTasks(userId)).filter((t) => t.orgId === orgId);
  return { member: m, org: m.org, groups, assessments: mine, tasks };
}
