import "server-only";
import { z } from "zod";
import type { Region } from "@/lib/residency";
import { runAI } from "../client";
import { scrubIdentifiers } from "../scrub";

const schema = z.object({
  themes: z
    .array(z.object({ label: z.string().min(2).max(60), summary: z.string().max(240), sentiment: z.enum(["positive", "mixed", "constructive"]), items: z.array(z.number().int().min(0)).min(1) }))
    .min(1)
    .max(8),
});
export type AIThemeResult = z.infer<typeof schema>;

/**
 * Group anonymous written feedback into themes by meaning (any language), on the subject's request.
 * Only the comment text is sent (emails, phone numbers and links are scrubbed first); no rater identity exists to send.
 */
export async function groupCommentsWithAI(comments: string[], ctx: { userId: string; subjectFirstName: string; modelChoice?: string | null; region?: Region }) {
  const texts = comments.map((c) => scrubIdentifiers(c).slice(0, 800));
  return runAI({
    feature: "themes",
    region: ctx.region,
    userId: ctx.userId,
    modelChoice: ctx.modelChoice,
    schema,
    request: {
      system: [
        `You group anonymous 360-degree feedback about ${ctx.subjectFirstName} into themes by meaning. Comments may be in different languages.`,
        "Make 3-7 themes named in plain English (2-5 words, about behaviour, e.g. 'Listening in meetings'). Put every comment in exactly one theme, by its index.",
        "For each theme write a one-sentence neutral summary in English of what people said, without quoting or naming anyone, and mark the overall tone as positive, mixed or constructive.",
        "Never guess who wrote a comment.",
        'Return JSON: {"themes": [{"label": "...", "summary": "...", "sentiment": "positive|mixed|constructive", "items": [indices]}]}.',
      ].join("\n"),
      messages: [{ role: "user", content: JSON.stringify(texts.map((text, i) => ({ i, text }))) }],
      maxTokens: 1800,
      temperature: 0.2,
    },
    mock: () => ({
      themes: [
        { label: "Sample theme A", summary: "Sample grouping — add GROQ_API_KEY for real AI.", sentiment: "positive" as const, items: texts.map((_, i) => i).filter((i) => i % 2 === 0) },
        { label: "Sample theme B", summary: "Sample grouping — add GROQ_API_KEY for real AI.", sentiment: "constructive" as const, items: texts.map((_, i) => i).filter((i) => i % 2 === 1) },
      ].filter((t) => t.items.length),
    }),
    fallback: () => ({ themes: [] as AIThemeResult["themes"] }),
  });
}
