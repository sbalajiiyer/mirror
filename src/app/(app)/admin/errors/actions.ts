"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { isPlatformAdmin } from "@/lib/monitoring";

export async function resolveErrorAction(id: string) {
  const u = await db.user.findUnique({ where: { id: await requireUserId() } });
  if (!isPlatformAdmin(u?.email)) return;
  await db.errorEvent.update({ where: { id }, data: { resolvedAt: new Date() } });
  revalidatePath("/admin/errors");
}
