import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type AuditScope = { orgId?: string | null; subjectId?: string | null };

/**
 * Append-only audit trail. Never include rater identities alongside answers.
 * `scope.orgId` puts the event in that organization's audit log; `scope.subjectId` shows it in that
 * person's activity log ("who touched my data").
 */
export async function audit(actorId: string | null, action: string, entity: string, entityId?: string, meta?: Prisma.InputJsonValue, scope: AuditScope = {}) {
  try {
    const orgId = scope.orgId ?? (entity === "Organization" ? entityId : null) ?? null;
    await db.auditLog.create({ data: { actorId, action, entity, entityId, meta, orgId, subjectId: scope.subjectId ?? null } });
  } catch (err) {
    console.error("[audit] failed", err);
  }
}
