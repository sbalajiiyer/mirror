"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { generateCoachBrief, type AIBriefText } from "@/lib/ai/features/coach-brief";
import { addNote, deleteMeeting, deleteNote, inviteClient, saveCoachProfile, scheduleMeeting, sessionPrep } from "@/lib/services/coach";

export async function saveCoachProfileAction(input: unknown): Promise<ActionResult> {
  try {
    await saveCoachProfile(await requireUserId(), input);
    revalidatePath("/coach");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function inviteClientAction(email: string): Promise<ActionResult> {
  try {
    await inviteClient(await requireUserId(), email);
    revalidatePath("/coach");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addNoteAction(clientId: string, body: string): Promise<ActionResult> {
  try {
    await addNote(await requireUserId(), clientId, body);
    revalidatePath(`/coach/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteNoteAction(clientId: string, noteId: string): Promise<ActionResult> {
  try {
    await deleteNote(await requireUserId(), noteId);
    revalidatePath(`/coach/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function scheduleMeetingAction(clientId: string, input: { scheduledAt: string; topic?: string }): Promise<ActionResult> {
  try {
    await scheduleMeeting(await requireUserId(), clientId, input);
    revalidatePath(`/coach/clients/${clientId}`);
    revalidatePath("/coach");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteMeetingAction(clientId: string, meetingId: string): Promise<ActionResult> {
  try {
    await deleteMeeting(await requireUserId(), meetingId);
    revalidatePath(`/coach/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

/** AI rewrite of the session brief (free model by default, daily cap). Falls back to the standard brief. */
export async function aiBriefAction(clientId: string): Promise<ActionResult<AIBriefText & { generatedBy: string }>> {
  try {
    const coachId = await requireUserId();
    const brief = await sessionPrep(coachId, clientId);
    const profile = await db.subjectProfile.findUnique({ where: { userId: coachId } });
    const r = await generateCoachBrief({ brief, coachId, modelChoice: profile?.aiModel });
    if (!r.ok) return { ok: true, data: { ...r.fallback, generatedBy: "template" } };
    return { ok: true, data: { ...r.data, generatedBy: r.generatedBy } };
  } catch (e) {
    return toActionError(e);
  }
}
