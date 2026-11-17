"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { remindParticipants } from "@/lib/services/reminders";

export async function remindParticipantsAction(orgId: string, campaignId: string, memberIds: string[]): Promise<ActionResult<{ sent: number; skipped: { name: string; reason: string }[] }>> {
  try {
    const r = await remindParticipants(await requireUserId(), orgId, campaignId, memberIds);
    revalidatePath(`/orgs/${orgId}/rounds/${campaignId}`);
    return { ok: true, data: r };
  } catch (e) {
    return toActionError(e);
  }
}
