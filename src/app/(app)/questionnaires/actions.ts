"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { deleteCustomFramework, generateAIFramework, saveCustomFramework } from "@/lib/services/frameworks";

export async function saveQuestionnaireAction(raw: unknown, id?: string): Promise<ActionResult<{ id: string }>> {
  try {
    const savedId = await saveCustomFramework(await requireUserId(), raw, id);
    revalidatePath("/questionnaires");
    return { ok: true, data: { id: savedId } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function generateQuestionnaireAction(brief: unknown): Promise<ActionResult<{ id: string; generatedBy: string }>> {
  try {
    const r = await generateAIFramework(await requireUserId(), brief);
    revalidatePath("/questionnaires");
    return { ok: true, data: { id: r.frameworkId, generatedBy: r.generatedBy } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteQuestionnaireAction(id: string): Promise<ActionResult> {
  try {
    await deleteCustomFramework(await requireUserId(), id);
    revalidatePath("/questionnaires");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
