"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { importQuestionnaire, type DraftQuestionnaire, type ImportLayout } from "@/lib/import/questionnaire-import";
import { readSpreadsheet } from "@/lib/import/read-spreadsheet";
import { DomainError } from "@/lib/errors";
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

/**
 * Free: read an .xlsx/.csv upload into a draft questionnaire for the builder. Nothing is saved
 * until the user reviews the draft and clicks Save.
 */
export async function importQuestionnaireAction(
  formData: FormData,
): Promise<ActionResult<{ draft: DraftQuestionnaire; layout: ImportLayout; warnings: string[]; statements: number }>> {
  try {
    await requireUserId();
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) throw new DomainError("Choose a file to import.");
    const rows = await readSpreadsheet(file);
    const r = importQuestionnaire(rows, file.name);
    if (!r.ok) throw new DomainError(r.error);
    return { ok: true, data: { draft: r.draft, layout: r.layout, warnings: r.warnings, statements: r.statements } };
  } catch (e) {
    return toActionError(e);
  }
}
