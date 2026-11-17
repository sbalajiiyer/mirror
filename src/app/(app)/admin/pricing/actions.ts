"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { requireUserId } from "@/lib/session";
import { isPlatformAdmin } from "@/lib/monitoring";
import { toActionError, type ActionResult } from "@/lib/action-result";
import {
  createDiscount,
  revokeDiscount,
  updatePolicy,
} from "@/lib/services/pricing";

/** Platform admins only (PLATFORM_ADMIN_EMAILS); checked on every call. */
async function requirePlatformAdmin() {
  const id = await requireUserId();
  const u = await db.user.findUnique({
    where: { id },
    select: { email: true },
  });
  if (!isPlatformAdmin(u?.email))
    throw new DomainError(
      "Only platform admins can change pricing.",
      "forbidden",
    );
  return id;
}

export async function savePolicyAction(
  input: unknown,
): Promise<ActionResult<{ changed: number }>> {
  try {
    const changed = await updatePolicy(await requirePlatformAdmin(), input);
    revalidatePath("/admin/pricing");
    return { ok: true, data: { changed: Object.keys(changed).length } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function createDiscountAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    await createDiscount(await requirePlatformAdmin(), input);
    revalidatePath("/admin/pricing");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function revokeDiscountAction(id: string): Promise<ActionResult> {
  try {
    await revokeDiscount(await requirePlatformAdmin(), id);
    revalidatePath("/admin/pricing");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
