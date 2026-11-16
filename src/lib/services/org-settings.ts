import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/services/org";

/** Organization data settings (Phase 10): residency region and retention period. */
export const orgDataSchema = z.object({
  region: z.enum(["us", "eu"]),
  retentionMonths: z.union([z.literal(12), z.literal(24), z.literal(36)]).nullable(),
});

export async function updateOrgData(adminId: string, orgId: string, raw: unknown) {
  await requireAdmin(adminId, orgId);
  const input = orgDataSchema.parse(raw);
  const before = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { region: true, retentionMonths: true } });
  await db.organization.update({ where: { id: orgId }, data: input });
  await audit(adminId, "org.settings", "Organization", orgId, { before, after: input });
}
