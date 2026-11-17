"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { audit } from "@/lib/audit";
import { toActionError, type ActionResult } from "@/lib/action-result";

const schema = z.object({
  displayName: z.string().trim().min(2, "Enter your name").max(80),
  brandName: z.string().trim().max(60).optional().default(""),
  website: z.union([z.literal(""), z.string().trim().url("Enter a full web address, e.g. https://…").max(200)]).optional().default(""),
  clientsFocus: z.string().trim().max(200).optional().default(""),
});

/** Coach onboarding: a coach profile plus the minimum personal profile, without the self-360 questions. */
export async function saveCoachOnboarding(raw: unknown): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const input = schema.parse(raw);
    await db.$transaction([
      db.subjectProfile.upsert({
        where: { userId },
        create: { userId, displayName: input.displayName, jobTitle: "Coach", goals: [], onboardedAt: new Date() },
        update: { displayName: input.displayName, onboardedAt: new Date() },
      }),
      db.user.update({ where: { id: userId }, data: { name: input.displayName } }),
      db.coachProfile.upsert({
        where: { userId },
        create: { userId, displayName: input.displayName, brandName: input.brandName || null, website: input.website || null, headline: input.clientsFocus || null },
        update: { displayName: input.displayName, brandName: input.brandName || null, website: input.website || null, ...(input.clientsFocus ? { headline: input.clientsFocus } : {}) },
      }),
    ]);
    await audit(userId, "coach.onboarded", "CoachProfile", userId, undefined, { subjectId: userId });
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
