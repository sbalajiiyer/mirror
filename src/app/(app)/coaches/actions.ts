"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { requestIntro, updateListing } from "@/lib/services/marketplace";

export async function requestIntroAction(coachId: string): Promise<ActionResult> {
  try {
    await requestIntro(await requireUserId(), coachId);
    revalidatePath("/coaching");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateListingAction(input: unknown): Promise<ActionResult> {
  try {
    await updateListing(await requireUserId(), input);
    revalidatePath("/coach/settings");
    revalidatePath("/coaches");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
