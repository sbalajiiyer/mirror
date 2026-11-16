import "server-only";
import type { Region } from "@/lib/residency";
import { z } from "zod";
import type { ReportData } from "@/lib/report/compute";
import { goalLabel } from "@/lib/constants";
import { runAI } from "../client";
import { guardrails } from "../prompts";
import { reportDigest } from "./summary";

export const chatReplySchema = z.object({
  reply: z.string().min(1).max(2500),
  /** Facts from the person's own data that the reply relied on. */
  citations: z.array(z.string().max(160)).max(5).default([]),
});
export type ChatReply = z.infer<typeof chatReplySchema>;

export type ChatContext = {
  firstName: string;
  role?: string | null;
  goals: string[];
  report: ReportData | null;
  activeGoals: { title: string; pct: number }[];
  planFocus: string[];
};

export const ROLEPLAY_PRESETS = [
  { key: "feedback_peer", label: "Give difficult feedback to a peer", persona: "a peer who is defensive about a missed deadline" },
  { key: "ask_manager", label: "Ask your manager for a promotion", persona: "a busy, fair manager who wants evidence" },
  { key: "say_no", label: "Say no to extra work", persona: "a senior stakeholder asking for one more urgent project" },
  { key: "underperformer", label: "Talk to a struggling team member", persona: "a team member whose work has slipped for a month" },
] as const;

function systemPrompt(mode: "REPORT" | "ROLEPLAY", ctx: ChatContext, tone: string, scenario?: string | null) {
  const data = ctx.report ? JSON.stringify(reportDigest(ctx.report)) : "No completed report yet.";
  const common = [
    guardrails(tone),
    `You are chatting with ${ctx.firstName}${ctx.role ? ` (${ctx.role})` : ""}. Their goals: ${ctx.goals.map(goalLabel).join(", ") || "not set"}.`,
    ctx.activeGoals.length ? `Active goals: ${ctx.activeGoals.map((g) => `${g.title} (${g.pct}% there)`).join("; ")}.` : "",
    ctx.planFocus.length ? `Development plan focus: ${ctx.planFocus.join(", ")}.` : "",
    `Their latest 360 report (aggregated, anonymised): ${data}`,
    "Never reveal or guess who said what. If asked who a rater is, explain that Mirror keeps raters anonymous.",
    "If the person seems in distress or raises a health or safety issue, respond kindly, don't diagnose, and suggest talking to someone they trust or a professional.",
    'Return JSON: {"reply": your message (plain text, under 180 words), "citations": up to 3 short facts from the report data you relied on, e.g. "Communication: others 3.2, self 4.0" (empty if none)}.',
  ];
  if (mode === "REPORT")
    return [...common, "Answer questions about their report and how to act on it. Be specific and practical; ground claims in the numbers and themes above; end with one small next step when useful."].filter(Boolean).join("\n");
  return [
    ...common,
    `Role-play: you play ${scenario || "the other person in a difficult work conversation"}. Stay in character, reply as that person would (1-4 sentences), and react realistically to how ${ctx.firstName} handles it.`,
    `If ${ctx.firstName} writes "feedback" or asks how they did, step out of character and give brief, specific coaching on what worked and one thing to try, linked to their 360 growth areas.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function templateReply(mode: "REPORT" | "ROLEPLAY", ctx: ChatContext, last: string): ChatReply {
  const r = ctx.report;
  const name = (k: string | null) => (k && r ? (r.competencies.find((c) => c.key === k)?.name ?? k) : null);
  if (mode === "ROLEPLAY") {
    if (/feedback|how did i do/i.test(last))
      return { reply: "Stepping out of the role-play: you named the issue clearly. Next time, pause after stating it and ask an open question before suggesting a fix.", citations: [] };
    return { reply: "I hear you, but I've had a lot on my plate. What exactly do you need from me?", citations: [] };
  }
  if (!r) return { reply: "You don't have a completed report yet. Once your 360 closes, I can help you make sense of it.", citations: [] };
  const top = r.summary.strengths.map(name).filter(Boolean)[0];
  const grow = name(r.summary.growthAreas[0] ?? null);
  const comp = r.competencies.find((c) => c.key === r.summary.growthAreas[0]);
  return {
    reply: `Your clearest strength is ${top ?? "spread across several areas"}. The area with the most room to grow is ${grow ?? "not clear yet"}. A good next step: pick one behaviour in ${grow ?? "that area"} and ask a colleague to watch for it in your next meeting.`,
    citations: comp ? [`${comp.name}: others ${comp.others.mean?.toFixed(1)}${comp.self != null ? `, self ${comp.self.toFixed(1)}` : ""}`] : [],
  };
}

export async function generateChatReply(params: {
  region?: Region;
  userId: string;
  mode: "REPORT" | "ROLEPLAY";
  scenario?: string | null;
  ctx: ChatContext;
  history: { role: "user" | "assistant"; content: string }[];
  tone: string;
  modelChoice?: string | null;
  premium: boolean;
  /** Pro plan: higher daily message cap on the free model. */
  pro?: boolean;
}) {
  const last = params.history[params.history.length - 1]?.content ?? "";
  return runAI({
    feature: params.premium ? "chat_premium" : params.pro ? "chat_pro" : "chat",
    region: params.region,
    userId: params.userId,
    modelChoice: params.premium ? params.modelChoice : "free",
    schema: chatReplySchema,
    request: {
      system: systemPrompt(params.mode, params.ctx, params.tone, params.scenario),
      messages: params.history.slice(-20),
      maxTokens: 700,
      temperature: params.mode === "ROLEPLAY" ? 0.8 : 0.4,
    },
    mock: () => {
      const t = templateReply(params.mode, params.ctx, last);
      return { ...t, reply: `${t.reply} (Sample reply — add GROQ_API_KEY for real AI.)` };
    },
    fallback: () => templateReply(params.mode, params.ctx, last),
  });
}
