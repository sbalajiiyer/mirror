import "server-only";
import { plainLanguageRules } from "../prompts";
import { z } from "zod";
import { DEFAULT_INVITE_MESSAGE, goalLabel } from "@/lib/constants";
import { runAI } from "../client";

const schema = z.object({ message: z.string().min(40).max(1200) });

export async function draftInviteMessage(params: { userId: string; modelChoice: string; firstName: string; goal: string; tone: string; minRaters: number }) {
  const res = await runAI({
    feature: "invite_message",
    userId: params.userId,
    modelChoice: params.modelChoice,
    fast: true,
    schema,
    request: {
      system:
        "You write short, warm invitation messages asking colleagues for anonymous 360-degree feedback. No placeholders, no subject line, no markdown. Return JSON {\"message\": string}.",
      messages: [
        {
          role: "user",
          content: `Write a 60-100 word invite in first person from ${params.firstName}. Their goal: ${goalLabel(params.goal)}. Tone: ${params.tone}. Mention it takes about 8 minutes, answers are anonymous and only shown combined with at least ${params.minRaters - 1} others, and thank them. Sign off with "— ${params.firstName}".`,
        },
      ],
      maxTokens: 400,
      temperature: 0.7,
    },
    mock: () => ({ message: DEFAULT_INVITE_MESSAGE(params.firstName) }),
    fallback: () => ({ message: DEFAULT_INVITE_MESSAGE(params.firstName) }),
  });
  return res.ok ? { message: res.data.message, usedAI: res.generatedBy === "ai" } : { message: res.fallback.message, usedAI: false, error: res.error };
}

/** Rewrite a reminder in a chosen tone, in plain language, keeping the {fill-ins} exactly. */
export async function rewriteReminder(params: { userId: string; modelChoice: string; message: string; tone: string }) {
  const keep = ["{first name}", "{your name}", "{due date}"].filter((f) => params.message.includes(f));
  const res = await runAI({
    feature: "invite_message",
    userId: params.userId,
    modelChoice: params.modelChoice,
    fast: true,
    schema,
    request: {
      system: `You rewrite short, polite reminder emails asking a colleague for anonymous feedback. No subject line, no markdown. Return JSON {"message": string}.\n${plainLanguageRules("summary")}`,
      messages: [
        {
          role: "user",
          content: `Rewrite this reminder in a ${params.tone} tone, 40-90 words, polite and never pushy. Keep these fill-ins exactly as written, including the braces: ${keep.join(", ") || "(none)"}. Do not add new fill-ins.\n\n${params.message}`,
        },
      ],
      maxTokens: 400,
      temperature: 0.6,
    },
    mock: () => ({ message: params.message }),
    fallback: () => ({ message: params.message }),
  });
  const message = res.ok ? res.data.message : res.fallback.message;
  // If the model dropped a fill-in, keep the person's own wording.
  const ok = keep.every((f) => message.includes(f));
  return ok ? { message, usedAI: res.ok && res.generatedBy === "ai" } : { message: params.message, usedAI: false, error: "The AI rewrite lost a fill-in, so your text was kept." };
}
