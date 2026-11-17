"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { removePersonalEmail, requestPersonalEmail, verifyPersonalEmail } from "@/lib/services/personal-email";

export async function requestPersonalEmailAction(email: string): Promise<ActionResult> {
  try {
    await requestPersonalEmail(await requireUserId(), email);
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function verifyPersonalEmailAction(token: string): Promise<ActionResult<{ email: string }>> {
  try {
    const email = await verifyPersonalEmail(await requireUserId(), token);
    revalidatePath("/settings");
    return { ok: true, data: { email } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function removePersonalEmailAction(): Promise<ActionResult> {
  try {
    await removePersonalEmail(await requireUserId());
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
