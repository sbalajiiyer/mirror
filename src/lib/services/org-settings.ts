import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireOwner } from "@/lib/services/org";
import { aiCatalog } from "@/lib/ai/models";
import { monthStart } from "@/lib/ai/context";
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
const cents = z.number().int().min(0).max(100_000_000).nullable();
export const orgAiSchema = z.object({
  allowedAiModels: z.array(z.string()).max(10),
  /** Monthly premium-AI budget for everyone, in cents (null = no limit). */
  aiBudgetCents: cents.optional(),
  /** Monthly premium-AI budget per person, in cents (null = no limit). */
  aiPerPersonCents: cents.optional(),
});

export async function updateOrgAi(ownerId: string, orgId: string, raw: unknown) {
  await requireOwner(ownerId, orgId);
  const { allowedAiModels, aiBudgetCents, aiPerPersonCents } = orgAiSchema.parse(raw);
  const premium = new Set(aiCatalog().filter((m) => m.tier === "premium").map((m) => m.id));
  const unknown = allowedAiModels.filter((id) => !premium.has(id));
  if (unknown.length) throw new DomainError("Unknown AI model.");
  const before = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { allowedAiModels: true, aiBudgetCents: true, aiPerPersonCents: true } });
  const after = {
    allowedAiModels: [...new Set(allowedAiModels)],
    ...(aiBudgetCents !== undefined ? { aiBudgetCents } : {}),
    ...(aiPerPersonCents !== undefined ? { aiPerPersonCents } : {}),
  };
  await db.organization.update({ where: { id: orgId }, data: after });
  await audit(ownerId, "org.ai_models", "Organization", orgId, { before, after });
}

/** This month's premium-AI spend in the company workspace: total and per person (owners only). */
export async function orgAiUsage(ownerId: string, orgId: string, now = new Date()) {
  const owner = await requireOwner(ownerId, orgId);
  const ws = await db.workspace.findUniqueOrThrow({ where: { orgId }, select: { id: true } });
  const rows = await db.aIInteractionLog.groupBy({
    by: ["userId"],
    where: { workspaceId: ws.id, tier: "premium", createdAt: { gte: monthStart(now) }, userId: { not: null } },
    _sum: { costMicros: true },
  });
  const members = await db.orgMember.findMany({ where: { orgId, userId: { in: rows.map((r) => r.userId!) } }, select: { userId: true, name: true, email: true } });
  const name = new Map(members.map((m) => [m.userId!, m.name || m.email]));
  const people = rows
    .map((r) => ({ userId: r.userId!, name: name.get(r.userId!) ?? "Former member", cents: Math.ceil((r._sum.costMicros ?? 0) / 10_000) }))
    .filter((p) => p.cents > 0)
    .sort((a, b) => b.cents - a.cents);
  return { totalCents: people.reduce((n, p) => n + p.cents, 0), budgetCents: owner.org.aiBudgetCents, perPersonCents: owner.org.aiPerPersonCents, people };
}
