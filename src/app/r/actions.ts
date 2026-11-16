"use server";

import { toActionError, type ActionResult } from "@/lib/action-result";
import { declineInvite, previewDeidentify, saveDraft, submitRaterResponse } from "@/lib/services/raters";

// Token = the rater's capability. No session, no IP or user-agent is recorded.
export async function saveDraftAction(token: string, draft: unknown): Promise<ActionResult> {
  try {
    await saveDraft(token, draft);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function submitRaterAction(token: string, answers: unknown): Promise<ActionResult> {
  try {
    await submitRaterResponse(token, answers);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function declineAction(token: string): Promise<ActionResult> {
  try {
    await declineInvite(token);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function previewDeidentifyAction(token: string, texts: string[]): Promise<ActionResult<{ texts: string[]; usedAI: boolean }>> {
  try {
    return { ok: true, data: await previewDeidentify(token, texts) };
  } catch (e) {
    return toActionError(e);
  }
}
