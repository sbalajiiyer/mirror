import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { CORE_360 } from "@/lib/frameworks/core-360";
import { syncFramework } from "@/lib/frameworks/sync";
import { generateQuestionnaire } from "@/lib/ai/features/questionnaire";
import { aiBriefSchema, customFrameworkSchema, slugify, type CustomFrameworkInput } from "@/lib/questionnaire";
import { DomainError } from "@/lib/services/assessments";

export type FrameworkView = {
  id: string;
  name: string;
  description: string;
  version: number;
  source: "builtin" | "custom" | "ai";
  competencies: { key: string; name: string; description: string; questions: { key: string; text: string; selfText: string }[] }[];
};

const include = { competencies: { orderBy: { order: "asc" as const }, include: { questions: { orderBy: { order: "asc" as const } } } } };

function view(f: Awaited<ReturnType<typeof loadFramework>>): FrameworkView {
  return {
    id: f!.id,
    name: f!.name,
    description: f!.description,
    version: f!.version,
    source: (f!.source as FrameworkView["source"]) ?? "builtin",
    competencies: f!.competencies.map((c) => ({
      key: c.key,
      name: c.name,
      description: c.description,
      questions: c.questions.map((q) => ({ key: q.key, text: q.text, selfText: q.selfText })),
    })),
  };
}

function loadFramework(id: string) {
  return db.framework.findUnique({ where: { id }, include });
}

/** Frameworks a user may build a 360 from: built-ins plus their own questionnaires. */
export async function frameworksForUser(userId: string): Promise<FrameworkView[]> {
  await syncFramework(db, CORE_360);
  const rows = await db.framework.findMany({
    where: { OR: [{ ownerId: null, isBuiltIn: true }, { ownerId: userId }] },
    include,
    orderBy: [{ isBuiltIn: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map((r) => view(r));
}

/** Server-side guard used by createAssessment: built-in, or owned by this user. */
export async function assertCanUseFramework(userId: string, frameworkId: string) {
  const f = await db.framework.findUnique({ where: { id: frameworkId }, select: { ownerId: true, isBuiltIn: true } });
  if (!f || (!f.isBuiltIn && f.ownerId !== userId)) throw new DomainError("Unknown framework");
}

export async function getOwnFramework(userId: string, id: string): Promise<FrameworkView> {
  const f = await loadFramework(id);
  if (!f || f.ownerId !== userId) throw new DomainError("Not found", "not_found");
  return view(f);
}

function competencyData(input: CustomFrameworkInput) {
  const used = new Set<string>();
  return input.competencies.map((c, i) => {
    let key = slugify(c.name);
    while (used.has(key)) key = `${key}_${i}`;
    used.add(key);
    return {
      key,
      name: c.name,
      description: c.description || "",
      order: i,
      questions: { create: c.questions.map((q, j) => ({ key: `q${j + 1}`, text: q.text, selfText: q.selfText, order: j })) },
    };
  });
}

/** Free: create or update a user's own questionnaire. Past 360s keep their own copy of the questions. */
export async function saveCustomFramework(userId: string, raw: unknown, id?: string, source: "custom" | "ai" = "custom") {
  const input = customFrameworkSchema.parse(raw);
  if (id) {
    const existing = await db.framework.findUnique({ where: { id } });
    if (!existing || existing.ownerId !== userId) throw new DomainError("Not found", "not_found");
    await db.$transaction([
      db.competency.deleteMany({ where: { frameworkId: id } }),
      db.framework.update({
        where: { id },
        data: { name: input.name, description: input.description || "", competencies: { create: competencyData(input) } },
      }),
    ]);
    await audit(userId, "framework.update", "Framework", id);
    return id;
  }
  const f = await db.framework.create({
    data: {
      slug: `custom-${randomUUID()}`,
      version: 1,
      name: input.name,
      description: input.description || "",
      isBuiltIn: false,
      ownerId: userId,
      source,
      competencies: { create: competencyData(input) },
    },
  });
  await audit(userId, "framework.create", "Framework", f.id, { source });
  return f.id;
}

export async function deleteCustomFramework(userId: string, id: string) {
  const f = await db.framework.findUnique({ where: { id }, include: { _count: { select: { assessments: true } } } });
  if (!f || f.ownerId !== userId) throw new DomainError("Not found", "not_found");
  if (f._count.assessments > 0) throw new DomainError("This questionnaire is used by a 360, so it can't be deleted.");
  await db.framework.delete({ where: { id } });
}

/**
 * Paid: generate a questionnaire with AI for 1 credit. The credit is only spent when the AI
 * succeeds; the result is saved as the user's own questionnaire so they can edit it for free.
 */
export async function generateAIFramework(userId: string, rawBrief: unknown) {
  const brief = aiBriefSchema.parse(rawBrief);
  const profile = await db.subjectProfile.findUnique({ where: { userId } });
  if (!profile) throw new DomainError("Finish onboarding first.");
  if (profile.aiCredits < 1) throw new DomainError("You need 1 credit to generate a questionnaire.", "no_credits");

  const res = await generateQuestionnaire({ userId, modelChoice: profile.aiModel, brief });
  if (!res.ok) throw new DomainError(`${res.error} You were not charged.`, "ai_failed");
  const input = customFrameworkSchema.parse(res.data); // also enforces our limits on the AI output

  const frameworkId = await db.$transaction(async (tx) => {
    // Guarded decrement: two tabs can't spend the same credit.
    const spent = await tx.subjectProfile.updateMany({ where: { userId, aiCredits: { gte: 1 } }, data: { aiCredits: { decrement: 1 } } });
    if (spent.count !== 1) throw new DomainError("You need 1 credit to generate a questionnaire.", "no_credits");
    const f = await tx.framework.create({
      data: {
        slug: `custom-${randomUUID()}`,
        version: 1,
        name: input.name,
        description: input.description || "",
        isBuiltIn: false,
        ownerId: userId,
        source: "ai",
        competencies: { create: competencyData(input) },
      },
    });
    await tx.creditLedger.create({ data: { userId, delta: -1, reason: "ai_questionnaire", ref: f.id } });
    return f.id;
  });
  await audit(userId, "framework.ai_generate", "Framework", frameworkId, { generatedBy: res.generatedBy });
  return { frameworkId, generatedBy: res.generatedBy };
}
