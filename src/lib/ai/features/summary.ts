import "server-only";
import { z } from "zod";
import type { ReportData } from "@/lib/report/compute";
import { goalLabel } from "@/lib/constants";
import { runAI } from "../client";
import { guardrails } from "../prompts";
import { scrubIdentifiers } from "../scrub";

export const aiSummarySchema = z.object({
  summary: z.string().min(40).max(1500),
  strengths: z.array(z.object({ competency: z.string(), insight: z.string().max(400) })).max(3),
  growth: z.array(z.object({ competency: z.string(), insight: z.string().max(400) })).max(3),
});
export type AISummary = z.infer<typeof aiSummarySchema>;

/** Compact, anonymised view of a report for the model (aggregates and group-labelled quotes only). */
export function reportDigest(r: ReportData) {
  const qText = new Map(r.questions.map((q) => [q.id, q]));
  return {
    raters: r.anonymity.othersN,
    groups: r.anonymity.groups.map((g) => `${g.label} (${g.n})`),
    scale: `1-${r.assessment.scaleMax}`,
    competencies: r.competencies.map((c) => ({ name: c.name, self: c.self, others: c.others.mean, gap: c.gap, quadrant: c.quadrant })),
    strengths: r.summary.strengths.map((k) => r.competencies.find((c) => c.key === k)?.name),
    growthAreas: r.summary.growthAreas.map((k) => r.competencies.find((c) => c.key === k)?.name),
    blindSpot: r.competencies.find((c) => c.key === r.summary.blindSpot)?.name ?? null,
    hiddenStrength: r.competencies.find((c) => c.key === r.summary.hiddenStrength)?.name ?? null,
    highestBehaviours: r.highest.map((id) => ({ text: qText.get(id)?.text, score: qText.get(id)?.others.mean })),
    lowestBehaviours: r.lowest.map((id) => ({ text: qText.get(id)?.text, score: qText.get(id)?.others.mean })),
    commentThemes: r.comments.themes.map((t) => ({
      theme: t.label,
      mentions: t.count,
      sentiment: Math.round(t.sentiment * 100) / 100,
      quotes: t.comments.slice(0, 2).map((c) => `${scrubIdentifiers(c.text)} (${c.group})`),
    })),
    startStopContinue: Object.fromEntries(
      (["START", "STOP", "CONTINUE"] as const).map((k) => [k.toLowerCase(), r.comments.ssc[k].map((t) => `${t.label} (${t.count})`)]),
    ),
  };
}

function templateSummary(r: ReportData): AISummary {
  const comp = (k: string) => r.competencies.find((c) => c.key === k);
  return {
    summary: r.summary.narrative,
    strengths: r.summary.strengths.map((k) => ({
      competency: comp(k)!.name,
      insight: `Rated ${comp(k)!.others.mean?.toFixed(1)} on average by others — one of your clearest strengths.`,
    })),
    growth: r.summary.growthAreas.map((k) => ({
      competency: comp(k)!.name,
      insight: `Rated ${comp(k)!.others.mean?.toFixed(1)} by others${comp(k)!.gap && comp(k)!.gap! > 0 ? `, below your own ${comp(k)!.self?.toFixed(1)}` : ""} — a good place to focus.`,
    })),
  };
}

export async function generateAISummary(params: {
  report: ReportData;
  userId: string;
  modelChoice: string;
  tone: string;
  role?: string | null;
}) {
  const { report } = params;
  return runAI({
    feature: "summary",
    userId: params.userId,
    modelChoice: params.modelChoice,
    schema: aiSummarySchema,
    request: {
      system: guardrails(params.tone),
      messages: [
        {
          role: "user",
          content: `Write the summary for ${report.assessment.subjectFirstName}'s 360 report.
Goal: ${goalLabel(report.assessment.goal)}${params.role ? `; role: ${params.role}` : ""}.

Return JSON: {"summary": one paragraph of 90-140 words that names the strongest pattern, the most important growth area and any self/others gap, "strengths": up to 3 {"competency","insight"} where insight is one sentence citing scores or comment themes, "growth": up to 3 {"competency","insight"} likewise}.

Report data:
${JSON.stringify(reportDigest(report))}`,
        },
      ],
      maxTokens: 1200,
      temperature: 0.4,
    },
    mock: () => {
      const t = templateSummary(report);
      return { ...t, summary: `${t.summary} (Sample AI summary — add GROQ_API_KEY for real AI writing.)` };
    },
    fallback: () => templateSummary(report),
  });
}
