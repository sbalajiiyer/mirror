"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import {
  addRaters,
  closeAssessment,
  createAssessment,
  deleteAssessment,
  launchAssessment,
  removeInvite,
  reopenAssessment,
  submitSelfAssessment,
} from "@/lib/services/assessments";
import { wizardSchema } from "@/lib/validation";

export async function createAssessmentAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();
    const a = await createAssessment(userId, wizardSchema.parse(raw));
    revalidatePath("/dashboard");
    return { ok: true, data: { id: a.id } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function submitSelfAction(assessmentId: string, raw: unknown): Promise<ActionResult> {
  try {
    await submitSelfAssessment(await requireUserId(), assessmentId, raw);
    revalidatePath(`/assessments/${assessmentId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function launchAction(assessmentId: string): Promise<ActionResult<{ sent: number }>> {
  try {
    const r = await launchAssessment(await requireUserId(), assessmentId);
    revalidatePath(`/assessments/${assessmentId}`);
    return { ok: true, data: r };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addRatersAction(assessmentId: string, groupId: string, raters: unknown[]): Promise<ActionResult<{ added: number }>> {
  try {
    const added = await addRaters(await requireUserId(), assessmentId, groupId, raters);
    revalidatePath(`/assessments/${assessmentId}`);
    return { ok: true, data: { added } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeInviteAction(assessmentId: string, inviteId: string): Promise<ActionResult> {
  try {
    await removeInvite(await requireUserId(), inviteId);
    revalidatePath(`/assessments/${assessmentId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function closeAction(assessmentId: string): Promise<ActionResult> {
  try {
    await closeAssessment(await requireUserId(), assessmentId);
    revalidatePath(`/assessments/${assessmentId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reopenAction(assessmentId: string): Promise<ActionResult> {
  try {
    await reopenAssessment(await requireUserId(), assessmentId);
    revalidatePath(`/assessments/${assessmentId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteAction(assessmentId: string): Promise<ActionResult> {
  try {
    await deleteAssessment(await requireUserId(), assessmentId);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveTranslationAction(assessmentId: string, input: unknown): Promise<ActionResult> {
  try {
    const { saveTranslation } = await import("@/lib/services/translations");
    await saveTranslation(await requireUserId(), assessmentId, input);
    revalidatePath(`/assessments/${assessmentId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function translateAllAction(assessmentId: string): Promise<ActionResult> {
  try {
    const { translateAll } = await import("@/lib/services/translations");
    await translateAll(await requireUserId(), assessmentId);
    revalidatePath(`/assessments/${assessmentId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
