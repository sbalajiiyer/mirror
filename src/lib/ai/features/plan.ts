import "server-only";
import type { Region } from "@/lib/residency";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ReportData } from "@/lib/report/compute";
import { goalLabel } from "@/lib/constants";
import { runAI } from "../client";
import { guardrails } from "../prompts";
import { reportDigest } from "./summary";

const resource = z.object({
  type: z.enum(["book", "article", "video", "course", "podcast", "practice"]).catch("practice"),
  title: z.string().max(200),
  note: z.string().max(300).optional().default(""),
});

export const planSchema = z.object({
  intro: z.string().max(800),
  areas: z
    .array(
      z.object({
        competency: z.string(),
        why: z.string().max(600),
        actions: z.array(z.object({ title: z.string().max(160), detail: z.string().max(500) })).min(3).max(5),
        exercise: z.string().max(600),
        resources: z.array(resource).max(4),
        milestones: z.object({ d30: z.string().max(300), d60: z.string().max(300), d90: z.string().max(300) }),
        helpers: z.array(z.string().max(200)).max(4),
      }),
    )
    .min(1)
    .max(3),
});
export type PlanContent = z.infer<typeof planSchema>;

/** Stored shape: AI content + stable ids and completion state for each action. */
export type StoredPlan = {
  intro: string;
  generatedBy: "ai" | "mock" | "template";
  areas: (Omit<PlanContent["areas"][number], "actions"> & {
    competencyKey: string | null;
    actions: { id: string; title: string; detail: string; done: boolean }[];
  })[];
};

export function focusAreas(r: ReportData): string[] {
  const keys = [...r.summary.growthAreas];
  if (r.summary.blindSpot && !keys.includes(r.summary.blindSpot)) keys.unshift(r.summary.blindSpot);
  return keys.slice(0, 3);
}

function templatePlan(r: ReportData): PlanContent {
  const name = (k: string) => r.competencies.find((c) => c.key === k)?.name ?? k;
  return {
    intro: "A starter plan built from your lowest-rated competencies. Pick one action per area and revisit it in 30 days.",
    areas: focusAreas(r).map((k) => {
      const low = r.questions.filter((q) => q.competencyKey === k && q.others.mean !== null).sort((a, b) => a.others.mean! - b.others.mean!)[0];
      return {
        competency: name(k),
        why: `Others rated ${name(k).toLowerCase()} ${r.competencies.find((c) => c.key === k)?.others.mean?.toFixed(1)} on average${low ? `, lowest on “${low.text.replace(/\.$/, "")}”` : ""}.`,
        actions: [
          { title: "Ask for one specific example", detail: `Ask two raters you trust what “better ${name(k).toLowerCase()}” would look like in a recent situation.` },
          { title: "Pick one behaviour to practise", detail: low ? `Focus on: ${low.text}` : `Choose one concrete behaviour in ${name(k).toLowerCase()} to practise weekly.` },
          { title: "Reflect weekly", detail: "Spend five minutes each Friday noting one moment it went well and one to improve." },
        ],
        exercise: "Before your next important meeting, write down one behaviour you'll practise; afterwards, rate yourself 1-5 and note why.",
        resources: [{ type: "practice", title: "Weekly reflection journal", note: "Five minutes, every Friday." }],
        milestones: { d30: "Chosen behaviour practised at least 4 times.", d60: "Asked for quick feedback from two people.", d90: "Run a short pulse check to see if others notice a change." },
        helpers: ["A peer who is strong in this area", "Your manager or a mentor"],
      };
    }),
  };
}

export function toStoredPlan(content: PlanContent, r: ReportData, generatedBy: StoredPlan["generatedBy"]): StoredPlan {
  const keyOf = (name: string) => r.competencies.find((c) => c.name.toLowerCase() === name.toLowerCase())?.key ?? null;
  return {
    intro: content.intro,
    generatedBy,
    areas: content.areas.map((a) => ({
      ...a,
      competencyKey: keyOf(a.competency),
      actions: a.actions.map((x) => ({ id: randomUUID(), title: x.title, detail: x.detail, done: false })),
    })),
  };
}

export async function generatePlan(params: {
  region?: Region;
  report: ReportData;
  userId: string;
  modelChoice: string;
  tone: string;
  profile: { jobTitle?: string | null; seniority?: string | null; industry?: string | null; learningStyle?: string | null };
}) {
  const { report, profile } = params;
  const focus = focusAreas(report).map((k) => report.competencies.find((c) => c.key === k)?.name);
  const res = await runAI({
    feature: "plan",
    region: params.region,
    userId: params.userId,
    modelChoice: params.modelChoice,
    schema: planSchema,
    request: {
      system: guardrails(params.tone),
      messages: [
        {
          role: "user",
          content: `Create a development plan for ${report.assessment.subjectFirstName}.
Goal: ${goalLabel(report.assessment.goal)}. Role: ${profile.jobTitle || "not given"}. Career stage: ${profile.seniority || "not given"}. Industry: ${profile.industry || "not given"}. Preferred learning style: ${profile.learningStyle || "no preference"}.
Focus areas (in order): ${focus.join(", ")}.

Return JSON: {"intro": 2 sentences, "areas": one per focus area, each {"competency": exact name from the focus list, "why": 1-2 sentences citing their data, "actions": 3-5 {"title","detail"} concrete, observable actions suited to their role and goal, "exercise": one practice exercise, "resources": up to 3 {"type": book|article|video|course|podcast|practice, "title", "note"} — only widely known, real titles; if unsure use type "practice", "milestones": {"d30","d60","d90"} measurable checkpoints, "helpers": up to 3 kinds of people to ask for help (roles, not names)}}.

Report data:
${JSON.stringify(reportDigest(report))}`,
        },
      ],
      maxTokens: 3000,
      temperature: 0.5,
    },
    mock: () => templatePlan(report),
    fallback: () => templatePlan(report),
  });
  return res.ok
    ? { ok: true as const, plan: toStoredPlan(res.data, report, res.generatedBy), modelId: res.modelId }
    : { ok: false as const, error: res.error, plan: toStoredPlan(res.fallback, report, "template"), modelId: "template" };
}
