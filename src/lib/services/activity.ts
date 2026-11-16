import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/services/org";

/*
 * Audit views (Phase 10). Org admins see events recorded against their organization; everyone sees
 * who touched their own data. Neither ever includes rater identities: rater actions aren't logged
 * with a person attached, and answers are never in audit metadata.
 */

const LABELS: Record<string, string> = {
  "auth.sign_in": "Signed in",
  "auth.sso": "Signed in with company SSO",
  "org.create": "Created the organization",
  "org.invite": "Invited people",
  "org.join": "Joined",
  "org.leave": "Left the organization",
  "org.consent": "Changed what they share with the organization",
  "org.role": "Changed a role",
  "org.remove": "Removed someone",
  "org.performance": "Updated a talent-grid rating",
  "org.campaign": "Started a 360 round",
  "org.view_report": "Viewed a shared 360 report",
  "org.settings": "Changed organization settings",
  "sso.domain": "Set the SSO domain",
  "sso.domain_verified": "Verified the SSO domain",
  "sso.config": "Changed SSO settings",
  "retention.purge": "Deleted raw answers under the retention policy",
  "coach.view_report": "Viewed a shared report",
  "coach.accept": "Started coaching",
  "coach.end": "Ended coaching",
  "coach.sharing": "Changed what your coach can see",
  "share.view": "Opened your share link",
  "data.export": "Exported data",
};
export const actionLabel = (a: string) => LABELS[a] ?? a;

const who = (e: { actorId: string | null; actor: { name: string | null; email: string | null } | null }, selfId: string) =>
  !e.actorId ? "System" : e.actorId === selfId ? "You" : (e.actor?.name ?? e.actor?.email ?? "Someone");

export const orgAuditFilter = z.object({
  action: z.string().max(60).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function orgAuditLog(adminId: string, orgId: string, raw: unknown = {}, take = 200) {
  await requireAdmin(adminId, orgId);
  const f = orgAuditFilter.parse(raw);
  const rows = await db.auditLog.findMany({
    where: {
      orgId,
      ...(f.action ? { action: f.action } : {}),
      ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lt: new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86400000) } : {}) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    include: { actor: { select: { name: true, email: true } } },
  });
  const actions = (await db.auditLog.findMany({ where: { orgId }, distinct: ["action"], select: { action: true } })).map((a) => a.action).sort();
  return {
    actions: actions.map((a) => ({ value: a, label: actionLabel(a) })),
    rows: rows.map((e) => ({ id: e.id, at: e.createdAt, actor: e.actorId ? (e.actor?.name ?? e.actor?.email ?? "Deleted user") : "System", action: e.action, label: actionLabel(e.action), entity: e.entity })),
  };
}

/** Who did what with my data: coaches, admins, share-link visitors, sign-ins. */
export async function personalActivity(userId: string, take = 100) {
  const rows = await db.auditLog.findMany({ where: { subjectId: userId }, orderBy: { createdAt: "desc" }, take, include: { actor: { select: { name: true, email: true } } } });
  return rows.map((e) => ({
    id: e.id,
    at: e.createdAt,
    actor: e.action === "share.view" ? "Someone with the link" : e.action === "retention.purge" ? "Organization policy" : who(e, userId),
    label: actionLabel(e.action),
    action: e.action,
    method: e.action === "auth.sign_in" ? ((e.meta as { method?: string } | null)?.method ?? null) : null,
  }));
}

export function auditCsv(rows: { at: Date; actor: string; label: string; action: string; entity: string }[]) {
  const esc = (s: string) => (/[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s);
  return ["Time (UTC),Who,What,Action,Record", ...rows.map((r) => [r.at.toISOString(), r.actor, r.label, r.action, r.entity].map(esc).join(","))].join("\r\n") + "\r\n";
}
