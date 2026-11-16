"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { deleteChat, sendMessage, startChat } from "@/lib/services/chat";

export async function startChatAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const c = await startChat(await requireUserId(), input);
    revalidatePath("/chat");
    return { ok: true, data: { id: c.id } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function sendMessageAction(chatId: string, text: string): Promise<ActionResult<{ reply: string; citations: string[]; generatedBy: string }>> {
  try {
    return { ok: true, data: await sendMessage(await requireUserId(), chatId, text) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteChatAction(chatId: string): Promise<ActionResult> {
  try {
    await deleteChat(await requireUserId(), chatId);
    revalidatePath("/chat");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
