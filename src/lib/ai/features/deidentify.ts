import "server-only";
import type { Region } from "@/lib/residency";
import { z } from "zod";
import { actorKeyFor, runAI } from "../client";
import { scrubIdentifiers } from "../scrub";

const schema = z.object({ texts: z.array(z.string().max(2500)) });

/**
 * Rewrite a rater's comments to remove details that could identify them (names, places,
 * dates, unique events, distinctive phrasing) while keeping the meaning. Always uses the
 * free model: raters never pay, and the subject's model choice doesn't apply to raters.
 */
export async function deidentifyComments(texts: string[], ctx: { inviteId: string; subjectFirstName: string; region?: Region }) {
  const cleaned = texts.map(scrubIdentifiers);
  const nonEmpty = cleaned.filter((t) => t.trim());
  if (!nonEmpty.length) return { texts: cleaned, usedAI: false };
  const res = await runAI({
    feature: "deidentify",
    region: ctx.region,
    actorKey: actorKeyFor(ctx.inviteId),
    modelChoice: "free",
    fast: true,
    schema,
    request: {
      system: [
        "You remove identifying details from anonymous workplace feedback.",
        `Rewrite each comment so it can't be traced to its author: remove or generalise names of people other than ${ctx.subjectFirstName}, team or project names, places, dates, specific events, and the author's own role or relationship ("as your manager", "when I joined").`,
        "Keep the meaning, tone and any concrete behaviour described. Keep it about the same length. Do not add new content.",
        'Return JSON: {"texts": [rewritten comments, same order and count as the input]}.',
      ].join("\n"),
      messages: [{ role: "user", content: JSON.stringify({ comments: cleaned }) }],
      maxTokens: 1500,
      temperature: 0,
    },
    mock: () => ({ texts: cleaned }),
    fallback: () => ({ texts: cleaned }),
  });
  const out = res.ok ? res.data.texts : res.fallback.texts;
  if (out.length !== cleaned.length) return { texts: cleaned, usedAI: false };
  return { texts: out.map((t, i) => (cleaned[i].trim() ? t : "")), usedAI: res.ok };
}
