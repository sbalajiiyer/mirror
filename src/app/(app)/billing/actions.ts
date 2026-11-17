"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { PRODUCTS, type ProductKey } from "@/lib/billing/catalog";
import { cancelSubscription, completeStubPayment, giftFull360, startCheckout } from "@/lib/services/billing";

export async function buyAction(product: string, context: { orgId?: string; credits?: number } = {}): Promise<ActionResult<{ url: string }>> {
  try {
    if (!(product in PRODUCTS)) throw new Error("Unknown product");
    const r = await startCheckout(await requireUserId(), product as ProductKey, { orgId: context.orgId || undefined, credits: context.credits });
    return { ok: true, data: { url: r.url } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function stubPayAction(paymentId: string, pay: boolean): Promise<ActionResult<{ status: string }>> {
  try {
    const status = await completeStubPayment(await requireUserId(), paymentId, pay);
    revalidatePath("/billing");
    return { ok: true, data: { status } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function cancelSubscriptionAction(id: string): Promise<ActionResult> {
  try {
    await cancelSubscription(await requireUserId(), id);
    revalidatePath("/billing");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function giftFull360Action(clientId: string): Promise<ActionResult> {
  try {
    await giftFull360(await requireUserId(), clientId);
    revalidatePath(`/coach/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
