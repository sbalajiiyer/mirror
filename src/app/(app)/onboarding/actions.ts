"use server";

import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { onboardingSchema } from "@/lib/validation";
import { toActionError, type ActionResult } from "@/lib/action-result";

export async function saveOnboarding(raw: unknown): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const input = onboardingSchema.parse(raw);
    const data = {
      displayName: input.displayName,
      jobTitle: input.jobTitle || null,
      seniority: input.seniority || null,
      industry: input.industry || null,
      goals: input.goals,
      feedbackTone: input.feedbackTone,
      onboardedAt: new Date(),
    };
    await db.subjectProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    await db.user.update({ where: { id: userId }, data: { name: input.displayName } });
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
