import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireOwner } from "@/lib/services/org";
import { aiCatalog } from "@/lib/ai/models";
import { DomainError } from "@/lib/errors";

/** Organization data settings (Phase 10): residency region and retention period. */
export const orgDataSchema = z.object({
  region: z.enum(["us", "eu"]),
  retentionMonths: z.union([z.literal(12), z.literal(24), z.literal(36)]).nullable(),
  /** Phase 11: people who leave may copy their own reports (without raw comments) to Personal. */
  allowPersonalCopy: z.boolean().default(true),
});

export async function updateOrgData(adminId: string, orgId: string, raw: unknown) {
  await requireOwner(adminId, orgId);
  const input = orgDataSchema.parse(raw);
  const before = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { region: true, retentionMonths: true, allowPersonalCopy: true } });
  await db.organization.update({ where: { id: orgId }, data: input });
  await audit(adminId, "org.settings", "Organization", orgId, { before, after: input });
}

/** Phase 11e: which premium AI models people may use in this company's workspace. */
export const orgAiSchema = z.object({ allowedAiModels: z.array(z.string()).max(10) });

export async function updateOrgAi(ownerId: string, orgId: string, raw: unknown) {
  await requireOwner(ownerId, orgId);
  const { allowedAiModels } = orgAiSchema.parse(raw);
  const premium = new Set(aiCatalog().filter((m) => m.tier === "premium").map((m) => m.id));
  const unknown = allowedAiModels.filter((id) => !premium.has(id));
  if (unknown.length) throw new DomainError("Unknown AI model.");
  const before = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { allowedAiModels: true } });
  await db.organization.update({ where: { id: orgId }, data: { allowedAiModels: [...new Set(allowedAiModels)] } });
  await audit(ownerId, "org.ai_models", "Organization", orgId, { before: before.allowedAiModels, after: allowedAiModels });
}
