"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { GOAL_KEYS } from "@/lib/constants";
import { createAISummary, createDevelopmentPlan, draftInviteFor, recommendFrameworkFor, setPlanActionDone, updateAISettings } from "@/lib/services/ai";
import type { FrameworkRecommendation } from "@/lib/ai/features/framework";

export async function aiSummaryAction(assessmentId: string): Promise<ActionResult<{ warning: string | null }>> {
  try {
    const r = await createAISummary(await requireUserId(), assessmentId);
    revalidatePath(`/assessments/${assessmentId}/report`);
    return { ok: true, data: { warning: r.warning } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function createPlanAction(assessmentId: string, learningStyle: string | null): Promise<ActionResult<{ warning: string | null }>> {
  try {
    const r = await createDevelopmentPlan(await requireUserId(), assessmentId, learningStyle);
    revalidatePath(`/assessments/${assessmentId}/plan`);
    return { ok: true, data: { warning: r.warning } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function togglePlanActionAction(assessmentId: string, planId: string, actionId: string, done: boolean): Promise<ActionResult> {
  try {
    await setPlanActionDone(await requireUserId(), planId, actionId, done);
    revalidatePath(`/assessments/${assessmentId}/plan`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function recommendFrameworkAction(goal: string): Promise<ActionResult<{ recommendation: FrameworkRecommendation; usedAI: boolean; warning?: string }>> {
  try {
    if (!(GOAL_KEYS as readonly string[]).includes(goal)) return { ok: false, error: "Unknown goal" };
    const r = await recommendFrameworkFor(await requireUserId(), goal);
    return { ok: true, data: { recommendation: r.recommendation, usedAI: r.usedAI, warning: r.error } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function draftInviteAction(goal: string, minRaters: number): Promise<ActionResult<{ message: string; usedAI: boolean; warning?: string }>> {
  try {
    if (!(GOAL_KEYS as readonly string[]).includes(goal)) return { ok: false, error: "Unknown goal" };
    const r = await draftInviteFor(await requireUserId(), goal, Math.max(3, Math.min(10, minRaters)));
    return { ok: true, data: { message: r.message, usedAI: r.usedAI, warning: r.error } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveAISettingsAction(input: { aiModel: string; learningStyle: string | null; feedbackTone: string }): Promise<ActionResult> {
  try {
    await updateAISettings(await requireUserId(), input);
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
