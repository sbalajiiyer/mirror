"use server";

import { redirect } from "next/navigation";
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
