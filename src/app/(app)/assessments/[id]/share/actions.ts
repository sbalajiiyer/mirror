"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { createShare, revokeShare } from "@/lib/services/share";

export async function createShareAction(assessmentId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const l = await createShare(await requireUserId(), assessmentId, input);
    revalidatePath(`/assessments/${assessmentId}/share`);
    return { ok: true, data: { id: l.id } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function revokeShareAction(assessmentId: string, id: string): Promise<ActionResult> {
  try {
    await revokeShare(await requireUserId(), id);
    revalidatePath(`/assessments/${assessmentId}/share`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
