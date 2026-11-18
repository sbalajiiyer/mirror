"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { cancelQueuedReminders, sendReminders, setPersonalNote } from "@/lib/services/reminders";
import { rewriteReminder } from "@/lib/ai/features/invite";
import { db } from "@/lib/db";

type SendResult = Awaited<ReturnType<typeof sendReminders>>;

export async function sendRemindersAction(assessmentId: string, input: unknown): Promise<ActionResult<SendResult>> {
  try {
    const r = await sendReminders(await requireUserId(), assessmentId, input);
    revalidatePath(`/assessments/${assessmentId}`);
    return { ok: true, data: r };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setPersonalNoteAction(assessmentId: string, inviteId: string, note: string): Promise<ActionResult> {
  try {
    await setPersonalNote(await requireUserId(), inviteId, note);
    revalidatePath(`/assessments/${assessmentId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function cancelQueuedRemindersAction(assessmentId: string): Promise<ActionResult> {
  try {
    await cancelQueuedReminders(await requireUserId(), assessmentId);
    revalidatePath(`/assessments/${assessmentId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function rewriteReminderAction(message: string, tone: string): Promise<ActionResult<{ message: string; note?: string }>> {
  try {
    const userId = await requireUserId();
    const profile = await db.subjectProfile.findUnique({ where: { userId }, select: { aiModel: true } });
    const r = await rewriteReminder({ userId, modelChoice: profile?.aiModel ?? "free", message: message.slice(0, 1500), tone });
    return { ok: true, data: { message: r.message, ...("error" in r && r.error ? { note: r.error } : {}) } };
  } catch (e) {
    return toActionError(e);
  }
}
