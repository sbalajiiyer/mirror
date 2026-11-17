"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { endCompanyCoaching, offerCoaching } from "@/lib/services/company-coaching";

export async function offerCoachingAction(orgId: string, memberId: string, coachEmail: string): Promise<ActionResult> {
  try {
    await offerCoaching(await requireUserId(), orgId, memberId, coachEmail);
    revalidatePath(`/orgs/${orgId}/coaching`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function endCompanyCoachingAction(orgId: string, linkId: string): Promise<ActionResult> {
  try {
    await endCompanyCoaching(await requireUserId(), orgId, linkId);
    revalidatePath(`/orgs/${orgId}/coaching`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
