import type { PrismaClient } from "@prisma/client";
import { CORE_360, type FrameworkDef } from "./core-360";

/** Idempotently store a built-in framework version (frameworks are versioned, never edited in place). */
export async function syncFramework(db: PrismaClient, def: FrameworkDef = CORE_360) {
  const existing = await db.framework.findUnique({ where: { slug_version: { slug: def.slug, version: def.version } } });
  if (existing) return existing;
  return db.framework.create({
    data: {
      slug: def.slug,
      version: def.version,
      name: def.name,
      description: def.description,
      isBuiltIn: true,
      competencies: {
        create: def.competencies.map((c, i) => ({
          key: c.key,
          name: c.name,
          description: c.description,
          order: i,
          questions: { create: c.questions.map((q, j) => ({ key: q.key, text: q.text, selfText: q.selfText, order: j })) },
        })),
      },
    },
  });
}
