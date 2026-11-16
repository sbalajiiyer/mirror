"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { createPulse, setCadence } from "@/lib/services/pulses";
import { archiveGoal, createGoal, updateGoalTarget } from "@/lib/services/goals";
import { renameSession, rerunSurvey } from "@/lib/services/sessions";

export async function createPulseAction(sourceId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const p = await createPulse(await requireUserId(), sourceId, input);
    revalidatePath("/dashboard");
    return { ok: true, data: { id: p.id } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setCadenceAction(rootId: string, months: 0 | 1 | 2 | 3): Promise<ActionResult> {
  try {
    await setCadence(await requireUserId(), rootId, months);
    revalidatePath("/progress");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function createGoalAction(assessmentId: string, competencyKey: string, target?: number): Promise<ActionResult<{ id: string }>> {
  try {
    const g = await createGoal(await requireUserId(), assessmentId, competencyKey, target);
    revalidatePath("/progress");
    return { ok: true, data: { id: g.id } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateGoalTargetAction(goalId: string, target: number): Promise<ActionResult> {
  try {
    await updateGoalTarget(await requireUserId(), goalId, target);
    revalidatePath("/progress");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function archiveGoalAction(goalId: string): Promise<ActionResult> {
  try {
    await archiveGoal(await requireUserId(), goalId);
    revalidatePath("/progress");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function rerunSurveyAction(sourceId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const s = await rerunSurvey(await requireUserId(), sourceId, input);
    revalidatePath("/dashboard");
    return { ok: true, data: { id: s.id } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function renameSessionAction(assessmentId: string, label: string): Promise<ActionResult> {
  try {
    await renameSession(await requireUserId(), assessmentId, label);
    revalidatePath("/dashboard");
    revalidatePath(`/assessments/${assessmentId}`);
    revalidatePath("/progress");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
