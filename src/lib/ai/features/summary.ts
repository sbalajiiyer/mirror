import "server-only";
import type { Region } from "@/lib/residency";
import { z } from "zod";
import type { ReportData } from "@/lib/report/compute";
import { goalLabel } from "@/lib/constants";
import { runAI } from "../client";
import { guardrails, plainLanguageRules } from "../prompts";
import { scrubIdentifiers } from "../scrub";

const insights = z.array(z.object({ competency: z.string(), insight: z.string().max(400) })).max(3);
const simpleSchema = z.object({ summary: z.string().min(30).max(900), strengths: insights, growth: insights });
export const aiSummarySchema = z.object({
  summary: z.string().min(40).max(1500),
  strengths: insights,
  growth: insights,
  /** Simplified version: shorter, everyday words, no numbers. Optional for summaries written before 2026-11-17. */
  simple: simpleSchema.optional(),
});
export type AISummary = z.infer<typeof aiSummarySchema>;

/** Smallest run of words copied from a comment that counts as quoting it. */
export const VERBATIM_WORDS = 8;
const words = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/** True if `text` copies VERBATIM_WORDS or more consecutive words from any comment. */
export function quotesAComment(text: string, comments: string[]): boolean {
  const out = ` ${words(text).join(" ")} `;
  for (const c of comments) {
    const w = words(c);
    for (let i = 0; i + VERBATIM_WORDS <= w.length; i++) {
      if (out.includes(` ${w.slice(i, i + VERBATIM_WORDS).join(" ")} `)) return true;
    }
  }
  return false;
}

const allText = (s: AISummary) =>
  [s.summary, ...s.strengths.map((x) => x.insight), ...s.growth.map((x) => x.insight), s.simple?.summary ?? "", ...(s.simple ? [...s.simple.strengths, ...s.simple.growth].map((x) => x.insight) : [])].join(" \n ");

/** Groups with fewer than this many raters are never broken out in AI summaries. */
const MIN_GROUP = 3;
/** A comment theme must be supported by at least this many raters to reach the AI. */
const MIN_THEME_RATERS = 2;
const themeRaters = (t: { raters?: number; count: number }) => t.raters ?? t.count;

/** Compact, anonymised view of a report for the model (aggregates and group-labelled quotes only). */
export function reportDigest(r: ReportData) {
  const qText = new Map(r.questions.map((q) => [q.id, q]));
  const bigGroups = new Set(r.anonymity.groups.filter((g) => g.n >= MIN_GROUP).map((g) => g.label));
  const groupOf = (label: string) => (bigGroups.has(label) ? label : "rater");
  return {
    raters: r.anonymity.othersN,
    groups: r.anonymity.groups.filter((g) => g.n >= MIN_GROUP).map((g) => `${g.label} (${g.n})`),
    scale: `1-${r.assessment.scaleMax}`,
    competencies: r.competencies.map((c) => ({ name: c.name, self: c.self, others: c.others.mean, gap: c.gap, quadrant: c.quadrant })),
    strengths: r.summary.strengths.map((k) => r.competencies.find((c) => c.key === k)?.name),
    growthAreas: r.summary.growthAreas.map((k) => r.competencies.find((c) => c.key === k)?.name),
    blindSpot: r.competencies.find((c) => c.key === r.summary.blindSpot)?.name ?? null,
    hiddenStrength: r.competencies.find((c) => c.key === r.summary.hiddenStrength)?.name ?? null,
    highestBehaviours: r.highest.map((id) => ({ text: qText.get(id)?.text, score: qText.get(id)?.others.mean })),
    lowestBehaviours: r.lowest.map((id) => ({ text: qText.get(id)?.text, score: qText.get(id)?.others.mean })),
    commentThemes: r.comments.themes
      .filter((t) => t.key !== "other" && themeRaters(t) >= MIN_THEME_RATERS)
      .map((t) => ({
        theme: t.label,
        raters: themeRaters(t),
        sentiment: Math.round(t.sentiment * 100) / 100,
        // For context only: the prompt says to paraphrase, and quotesAComment() rejects copies.
        examples: t.comments.slice(0, 2).map((c) => `${scrubIdentifiers(c.text)} (${groupOf(c.group)})`),
      })),
    startStopContinue: Object.fromEntries(
      (["START", "STOP", "CONTINUE"] as const).map((k) => [
        k.toLowerCase(),
        r.comments.ssc[k].filter((t) => t.key !== "other" && themeRaters(t) >= MIN_THEME_RATERS).map((t) => `${t.label} (${themeRaters(t)} raters)`),
      ]),
    ),
  };
}

function templateSummary(r: ReportData): AISummary {
  const comp = (k: string) => r.competencies.find((c) => c.key === k);
  const first = (keys: string[]) => keys.map((k) => comp(k)!.name);
  const top = first(r.summary.strengths);
  const grow = first(r.summary.growthAreas);
  return {
    simple: {
      summary: [
        top.length ? `Others see ${top[0]} as your clearest strength.` : "",
        grow.length ? `${grow[0]} is a good area to work on next.` : "",
        "Look at the scores below to see the details.",
      ]
        .filter(Boolean)
        .join(" "),
      strengths: top.map((name) => ({ competency: name, insight: "Others rate this highly." })),
      growth: grow.map((name) => ({ competency: name, insight: "Others rate this lower. Pick one small action to try." })),
    },
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
  region?: Region;
  report: ReportData;
  userId: string;
  modelChoice: string;
  tone: string;
  role?: string | null;
}) {
  const { report } = params;
  const digest = reportDigest(report);
  const sent = digest.commentThemes.flatMap((t) => t.examples);
  const schema = aiSummarySchema.refine((s) => !quotesAComment(allText(s), sent), { message: "Summary quotes a rater comment" });
  return runAI({
    feature: "summary",
    region: params.region,
    userId: params.userId,
    modelChoice: params.modelChoice,
    schema,
    request: {
      system: `${guardrails(params.tone)}\n${plainLanguageRules("summary")}`,
      messages: [
        {
          role: "user",
          content: `Write the summary for ${report.assessment.subjectFirstName}'s 360 report.
Goal: ${goalLabel(report.assessment.goal)}${params.role ? `; role: ${params.role}` : ""}.

Return JSON with two versions of the same message:
{"summary": one paragraph of 90-140 words that names the strongest pattern, the most important growth area and any self/others gap,
 "strengths": up to 3 {"competency","insight"} where insight is one sentence citing scores or comment themes,
 "growth": up to 3 {"competency","insight"} likewise,
 "simple": {"summary": 40-80 words in very simple everyday words, no numbers or scores, no terms like "gap" or "competency", "strengths": the same competencies with one short sentence each, "growth": likewise}}.
Both versions must say the same things and use the same competency names. Every sentence: at most 20 words.
Comment examples are for context only. Paraphrase them; never copy their wording.

Report data:
${JSON.stringify(digest)}`,
        },
      ],
      maxTokens: 1800,
      temperature: 0.4,
    },
    mock: () => {
      const t = templateSummary(report);
      return { ...t, summary: `${t.summary} (Sample AI summary — add GROQ_API_KEY for real AI writing.)` };
    },
    fallback: () => templateSummary(report),
  });
}
