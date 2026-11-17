"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { respondToCompanyOffer } from "@/lib/services/company-coaching";
import { endLink, inviteCoach, respondToInvite, respondToInviteToken, updateSharing } from "@/lib/services/coach";

const done = () => {
  revalidatePath("/coaching");
  revalidatePath("/coach");
};

export async function inviteCoachAction(email: string): Promise<ActionResult> {
  try {
    await inviteCoach(await requireUserId(), email);
    done();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function respondToInviteAction(linkId: string, accept: boolean): Promise<ActionResult> {
  try {
    await respondToInvite(await requireUserId(), linkId, accept);
    done();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function respondToInviteTokenAction(token: string, accept: boolean): Promise<ActionResult> {
  try {
    await respondToInviteToken(await requireUserId(), token, accept);
    done();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateSharingAction(linkId: string, sharing: unknown): Promise<ActionResult> {
  try {
    await updateSharing(await requireUserId(), linkId, sharing);
    done();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function endLinkAction(linkId: string): Promise<ActionResult> {
  try {
    await endLink(await requireUserId(), linkId);
    done();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

/** Phase 11e: accept or decline coaching a company offers to pay for. */
export async function respondToCompanyOfferAction(linkId: string, accept: boolean): Promise<ActionResult> {
  try {
    await respondToCompanyOffer(await requireUserId(), linkId, accept);
    done();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
