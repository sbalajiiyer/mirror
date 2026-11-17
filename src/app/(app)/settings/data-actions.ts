"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { createApiToken, revokeApiToken } from "@/lib/services/api-tokens";
import { deleteCategory, scheduleAccountDeletion } from "@/lib/services/my-data";
import { signOut } from "@/auth";

export async function setBenchmarkOptOutAction(optOut: boolean): Promise<ActionResult> {
  try {
    await db.subjectProfile.update({ where: { userId: await requireUserId() }, data: { benchmarkOptOut: z.boolean().parse(optOut) } });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function createApiTokenAction(name: string): Promise<ActionResult<{ token: string }>> {
  try {
    const t = await createApiToken(await requireUserId(), name);
    revalidatePath("/settings");
    return { ok: true, data: { token: t.token } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function revokeApiTokenAction(id: string): Promise<ActionResult> {
  try {
    await revokeApiToken(await requireUserId(), id);
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteMyAccountAction(confirmEmail: string): Promise<ActionResult> {
  try {
    await scheduleAccountDeletion(await requireUserId(), confirmEmail);
  } catch (e) {
    return toActionError(e);
  }
  await signOut({ redirectTo: "/signin?deleted=1" });
  return { ok: true };
}

export async function deleteCategoryAction(category: string, confirm: string): Promise<ActionResult<{ count: number }>> {
  try {
    if (!["chats", "goals", "shares"].includes(category)) throw new Error("Unknown category");
    if (confirm.trim().toLowerCase() !== "delete") return { ok: false, error: "Type delete to confirm." };
    const count = await deleteCategory(await requireUserId(), category as "chats" | "goals" | "shares");
    revalidatePath("/settings");
    return { ok: true, data: { count } };
  } catch (e) {
    return toActionError(e);
  }
}
