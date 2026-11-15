import "server-only";
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
