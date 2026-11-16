import "server-only";
import { z } from "zod";
import { runAI } from "../client";
import { matchWidget, widgetsFor, type Scope, type WidgetType } from "@/lib/dashboards/widgets";

/**
 * Natural-language questions → one widget from the catalog (never free-form queries), so answers always go
 * through the same privacy-safe services. The keyword matcher is the offline fallback.
 */
export async function questionToWidget(p: { userId: string; question: string; scope: Scope; groups: { id: string; name: string }[]; surveys: { id: string; title: string }[] }) {
  const types = widgetsFor(p.scope).map((w) => w.type) as [WidgetType, ...WidgetType[]];
  const schema = z.object({
    type: z.enum(types),
    groupId: z.string().nullable().optional(),
    surveyId: z.string().nullable().optional(),
    explanation: z.string().max(300),
  });
  const byName = (list: { id: string; name: string }[]) => list.find((g) => p.question.toLowerCase().includes(g.name.toLowerCase()))?.id ?? null;
  const fallback = () => {
    const type = matchWidget(p.question, p.scope) ?? types[0];
    return { type, groupId: byName(p.groups), surveyId: byName(p.surveys.map((s) => ({ id: s.id, name: s.title }))), explanation: "Matched your question to the closest view." };
  };
  const r = await runAI({
    feature: "nl_query",
    userId: p.userId,
    schema,
    request: {
      system:
        "You map a person's question about their 360 feedback data to exactly one predefined view. Never invent data or views. Return JSON {type, groupId, surveyId, explanation (one sentence: what the view shows)}.",
      messages: [
        {
          role: "user",
          content: `Question: ${p.question}\n\nViews:\n${widgetsFor(p.scope)
            .map((w) => `- ${w.type}: ${w.description}${w.needs ? ` (needs ${w.needs.join(", ")})` : ""}`)
            .join("\n")}\n\nTeams/cohorts: ${JSON.stringify(p.groups)}\nSurveys: ${JSON.stringify(p.surveys)}`,
        },
      ],
      maxTokens: 300,
      temperature: 0,
    },
    mock: fallback,
    fallback,
  });
  const out = r.ok ? r.data : r.fallback;
  // Only accept ids the person can actually use.
  return {
    type: out.type,
    groupId: p.groups.some((g) => g.id === out.groupId) ? out.groupId! : null,
    surveyId: p.surveys.some((s) => s.id === out.surveyId) ? out.surveyId! : null,
    explanation: out.explanation,
  };
}
