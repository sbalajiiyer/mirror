import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { newToken } from "@/lib/tokens";
import { appUrl } from "@/lib/url";
import type { ReportData } from "@/lib/report/compute";
import { withoutComments } from "@/lib/coach/brief";

/*
 * Shareable outputs (Phase 7). Private by default: nothing is public until the subject creates a link.
 * Links are unguessable, revocable and can expire. Shared content is the frozen, anonymised report;
 * raters' comments are never included in anything public.
 */

export const SUMMARY_SECTIONS = ["strengths", "growth", "chart", "narrative"] as const;

export const shareSchema = z.object({
  kind: z.enum(["BADGE", "SUMMARY", "REPORT"]),
  sections: z.array(z.enum(SUMMARY_SECTIONS)).default(["strengths", "chart"]),
  note: z.string().trim().max(140).optional().default(""),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

async function ownedVisible(userId: string, assessmentId: string) {
  const a = await db.assessment.findFirst({ where: { id: assessmentId, subjectId: userId, status: "CLOSED" }, include: { reports: { orderBy: { generatedAt: "desc" }, take: 1 } } });
  const d = a?.reports[0]?.data as unknown as ReportData | undefined;
  if (!a || !d?.anonymity.available) throw new DomainError("Only a closed report with results can be shared.");
  return { a, d };
}

export async function createShare(userId: string, assessmentId: string, raw: unknown) {
  const input = shareSchema.parse(raw);
  const { d } = await ownedVisible(userId, assessmentId);
  if (input.kind === "BADGE" && d.summary.strengths.length === 0) throw new DomainError("This report has no clear strengths to put on a badge yet.");
  if (input.kind === "SUMMARY" && input.sections.length === 0) throw new DomainError("Pick at least one section to share.");
  const link = await db.shareLink.create({
    data: {
      id: newToken().slice(0, 22),
      userId,
      assessmentId,
      kind: input.kind,
      sections: input.kind === "SUMMARY" ? input.sections : [],
      note: input.note || null,
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400000) : null,
    },
  });
  await audit(userId, "share.create", "ShareLink", link.id, { kind: input.kind });
  return link;
}

export async function listShares(userId: string, assessmentId?: string) {
  return db.shareLink.findMany({ where: { userId, ...(assessmentId ? { assessmentId } : {}) }, orderBy: { createdAt: "desc" }, include: { assessment: { select: { title: true } } } });
}

export async function revokeShare(userId: string, id: string) {
  const l = await db.shareLink.findFirst({ where: { id, userId } });
  if (!l) throw new DomainError("Not found", "not_found");
  await db.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit(userId, "share.revoke", "ShareLink", id);
}

export const shareUrl = (id: string) => appUrl(`/s/${id}`);

export type BadgeInfo = { strengths: { name: string; others: number }[]; raters: number; groups: number; issued: Date; scaleMax: number };

export function badgeInfo(d: ReportData, issued: Date): BadgeInfo {
  return {
    strengths: d.summary.strengths
      .map((k) => d.competencies.find((c) => c.key === k))
      .filter((c): c is NonNullable<typeof c> => !!c && c.others.mean != null)
      .slice(0, 3)
      .map((c) => ({ name: c.name, others: c.others.mean! })),
    raters: d.anonymity.othersN,
    groups: d.anonymity.groups.length,
    issued,
    scaleMax: d.assessment.scaleMax,
  };
}

/** LinkedIn's free "Add licence or certification" link (no API or app review needed). */
export function linkedInAddUrl(p: { name: string; url: string; id: string; issued: Date }) {
  const q = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: p.name,
    organizationName: "Mirror",
    issueYear: String(p.issued.getUTCFullYear()),
    issueMonth: String(p.issued.getUTCMonth() + 1),
    certUrl: p.url,
    certId: p.id,
  });
  return `https://www.linkedin.com/profile/add?${q.toString()}`;
}

export const linkedInShareUrl = (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

/** Public view of a link. Returns null if it doesn't exist, was revoked or has expired. */
export async function publicShare(id: string, countView = true) {
  if (!/^[A-Za-z0-9_-]{22}$/.test(id)) return null;
  const l = await db.shareLink.findUnique({ where: { id }, include: { assessment: { include: { reports: { orderBy: { generatedAt: "desc" }, take: 1 } } }, user: { include: { profile: true } } } });
  if (!l || l.revokedAt || (l.expiresAt && l.expiresAt < new Date())) return null;
  const d = l.assessment.reports[0]?.data as unknown as ReportData | undefined;
  if (!d?.anonymity.available) return null;
  if (countView) {
    await db.shareLink.update({ where: { id }, data: { views: { increment: 1 } } });
    await audit(null, "share.view", "ShareLink", l.id, { kind: l.kind }, { subjectId: l.userId });
  }
  const issued = l.assessment.closedAt ?? l.createdAt;
  return {
    id: l.id,
    kind: l.kind,
    sections: l.sections,
    note: l.note,
    name: l.user.profile?.displayName ?? d.assessment.subjectFirstName,
    title: l.assessment.title,
    issued,
    generatedAt: l.assessment.reports[0]!.generatedAt,
    report: withoutComments(d),
    badge: badgeInfo(d, issued),
  };
}
