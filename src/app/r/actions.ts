"use server";

import { toActionError, type ActionResult } from "@/lib/action-result";
import { clientIp, enforce } from "@/lib/rate-limit";
import { declineInvite, previewDeidentify, saveDraft, submitRaterResponse } from "@/lib/services/raters";

// Token = the rater's capability. No session, no IP or user-agent is recorded.
// Rate limits count per network and per link in separate, hashed counters (see lib/rate-limit).
async function limitWrite(token: string, perToken: "raterWriteToken" | "deidentifyToken" = "raterWriteToken") {
  await enforce(["raterWriteIp", await clientIp()], [perToken, String(token)]);
}
export async function saveDraftAction(token: string, draft: unknown): Promise<ActionResult> {
  try {
    await limitWrite(token);
    await saveDraft(token, draft);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function submitRaterAction(token: string, answers: unknown): Promise<ActionResult> {
  try {
    await limitWrite(token);
    await submitRaterResponse(token, answers);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function declineAction(token: string): Promise<ActionResult> {
  try {
    await limitWrite(token);
    await declineInvite(token);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function previewDeidentifyAction(token: string, texts: string[]): Promise<ActionResult<{ texts: string[]; usedAI: boolean }>> {
  try {
    await limitWrite(token, "deidentifyToken");
    return { ok: true, data: await previewDeidentify(token, texts) };
  } catch (e) {
    return toActionError(e);
  }
}
