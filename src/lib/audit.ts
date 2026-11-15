import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Append-only audit trail. Never include rater identities alongside answers. */
export async function audit(actorId: string | null, action: string, entity: string, entityId?: string, meta?: Prisma.InputJsonValue) {
  try {
    await db.auditLog.create({ data: { actorId, action, entity, entityId, meta } });
  } catch (err) {
    console.error("[audit] failed", err);
  }
}
