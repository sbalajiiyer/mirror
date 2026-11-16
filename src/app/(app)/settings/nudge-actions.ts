"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";

/** Weekly nudges are opt-in: null = off, 0–6 = day of week (Sunday = 0). */
export async function setNudgeDayAction(day: number | null): Promise<ActionResult> {
  try {
    const d = z.number().int().min(0).max(6).nullable().parse(day);
    await db.subjectProfile.update({ where: { userId: await requireUserId() }, data: { nudgeDay: d } });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
