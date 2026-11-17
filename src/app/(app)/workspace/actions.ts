"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { copyReportsToPersonal } from "@/lib/services/leaving";
import { requireUserId } from "@/lib/session";
import { setActiveWorkspace } from "@/lib/workspace";

/** Switch the active workspace and go to its home page. Unknown or forbidden keys are ignored. */
export async function switchWorkspaceAction(key: string) {
  const userId = await requireUserId();
  await setActiveWorkspace(userId, key);
  redirect("/dashboard");
}

/** Make a company the active workspace while its pages are open (no redirect). */
export async function syncWorkspaceAction(key: string) {
  const userId = await requireUserId();
  await setActiveWorkspace(userId, key);
}

/** After leaving a company: copy my round reports (no raw comments) into Personal. */
export async function copyExitReportsAction(memberId: string): Promise<ActionResult<{ copied: number }>> {
  try {
    const copied = await copyReportsToPersonal(await requireUserId(), memberId);
    revalidatePath("/dashboard");
    return { ok: true, data: { copied } };
  } catch (e) {
    return toActionError(e);
  }
}
