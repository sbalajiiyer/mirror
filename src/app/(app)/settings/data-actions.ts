"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { createApiToken, revokeApiToken } from "@/lib/services/api-tokens";
import { deleteMyAccount } from "@/lib/services/my-data";
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
    await deleteMyAccount(await requireUserId(), confirmEmail);
  } catch (e) {
    return toActionError(e);
  }
  await signOut({ redirectTo: "/" });
  return { ok: true };
}
