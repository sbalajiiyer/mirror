import "server-only";
import { z } from "zod";
import type { Region } from "@/lib/residency";
import { LOCALE_NAMES, type RaterLocale } from "@/lib/i18n/rater";
import { actorKeyFor, runAI } from "../client";

const schema = z.object({ items: z.array(z.object({ text: z.string().max(600), competency: z.string().max(120) })) });

/**
 * Translate custom 360 statements (and their competency names) into one rater language.
 * Free model; keeps the {name} placeholder. Falls back to English on any failure.
 */
export async function translateStatements(items: { text: string; competency: string }[], locale: RaterLocale, ctx: { assessmentId: string; region?: Region }) {
  if (!items.length) return { items, usedAI: false };
  const res = await runAI({
    feature: "translate",
    region: ctx.region,
    actorKey: actorKeyFor(`translate:${ctx.assessmentId}`),
    modelChoice: "free",
    fast: true,
    schema,
    request: {
      system: [
        `Translate workplace 360-feedback statements from English into ${LOCALE_NAMES[locale]} (${locale}).`,
        "Keep the literal placeholder {name} exactly as is; it stands for a person's first name. Use natural, gender-neutral phrasing where the language allows.",
        "Translate each competency name too. Keep the meaning precise and the register professional. Do not add or drop statements.",
        'Return JSON: {"items": [{"text": "...", "competency": "..."}]} in the same order and count as the input.',
      ].join("\n"),
      messages: [{ role: "user", content: JSON.stringify({ items }) }],
      maxTokens: 2500,
      temperature: 0,
    },
    mock: () => ({ items: items.map((i) => ({ text: `[${locale}] ${i.text}`, competency: `[${locale}] ${i.competency}` })) }),
    fallback: () => ({ items }),
  });
  const out = res.ok ? res.data.items : items;
  if (out.length !== items.length || out.some((o, i) => items[i].text.includes("{name}") && !o.text.includes("{name}"))) return { items, usedAI: false };
  return { items: out, usedAI: res.ok };
}
