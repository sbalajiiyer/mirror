import "server-only";
import { regionForAssessment } from "@/lib/services/residency";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { chatFeature } from "@/lib/services/billing";
import { resolveModel } from "@/lib/ai/models";
import { citationFilter, generateChatReply, ROLEPLAY_PRESETS, streamChatReply, type ChatContext } from "@/lib/ai/features/chat";
import type { ReportData } from "@/lib/report/compute";
import type { StoredPlan } from "@/lib/ai/features/plan";

/*
 * AI coach chat (Phase 7). Free conversations use the free model with a daily message cap;
 * premium conversations (when a premium model is configured and chosen in Settings) cost 1 credit
 * when started. The AI only sees the person's own anonymised report aggregates, goals and plan focus.
 */

export const startChatSchema = z.object({
  mode: z.enum(["REPORT", "ROLEPLAY"]),
  assessmentId: z.string().nullable().optional(),
  preset: z.string().optional(),
  scenario: z.string().trim().max(300).optional(),
  premium: z.boolean().default(false),
});

async function visibleReport(userId: string, assessmentId: string) {
  const a = await db.assessment.findFirst({ where: { id: assessmentId, subjectId: userId, status: "CLOSED" }, include: { reports: { orderBy: { generatedAt: "desc" }, take: 1 } } });
  const d = a?.reports[0]?.data as unknown as ReportData | undefined;
  return a && d?.anonymity.available ? { a, d } : null;
}

/** Latest closed report with visible results, for chats not tied to one report. */
async function latestReport(userId: string) {
  const a = await db.assessment.findMany({ where: { subjectId: userId, status: "CLOSED" }, orderBy: { closedAt: "desc" }, include: { reports: { orderBy: { generatedAt: "desc" }, take: 1 } }, take: 10 });
  for (const x of a) {
    const d = x.reports[0]?.data as unknown as ReportData | undefined;
    if (d?.anonymity.available) return d;
  }
  return null;
}

async function context(userId: string, assessmentId: string | null): Promise<{ ctx: ChatContext; tone: string; aiModel: string }> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
  const report = assessmentId ? ((await visibleReport(userId, assessmentId))?.d ?? null) : await latestReport(userId);
  const goals = await db.goal.findMany({ where: { userId, status: { in: ["ACTIVE", "ACHIEVED"] } }, take: 5 });
  const plan = await db.developmentPlan.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
  const planFocus = plan ? (plan.data as unknown as StoredPlan).areas.map((a) => a.competency) : [];
  return {
    ctx: {
      firstName: (user.profile?.displayName ?? user.name ?? "there").split(" ")[0],
      role: user.profile?.jobTitle,
      goals: user.profile?.goals ?? [],
      report,
      activeGoals: goals.map((g) => ({ title: g.title, pct: g.status === "ACHIEVED" ? 100 : 0 })),
      planFocus,
    },
    tone: user.profile?.feedbackTone ?? "balanced",
    aiModel: user.profile?.aiModel ?? "free",
  };
}

export async function listChats(userId: string) {
  return db.coachChat.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, include: { _count: { select: { messages: true } } }, take: 50 });
}

export async function getChat(userId: string, chatId: string) {
  const c = await db.coachChat.findFirst({ where: { id: chatId, userId }, include: { messages: { orderBy: { createdAt: "asc" } }, assessment: { select: { title: true } } } });
  if (!c) throw new DomainError("Not found", "not_found");
  return c;
}

export async function startChat(userId: string, raw: unknown) {
  const input = startChatSchema.parse(raw);
  let title = "Questions about my feedback";
  if (input.assessmentId) {
    const r = await visibleReport(userId, input.assessmentId);
    if (!r) throw new DomainError("Chat needs a closed report with results.");
    title = `About ${r.a.title}`;
  }
  let scenario: string | null = null;
  if (input.mode === "ROLEPLAY") {
    const preset = ROLEPLAY_PRESETS.find((p) => p.key === input.preset);
    if (!preset && !input.scenario) throw new DomainError("Pick a situation or describe one.");
    scenario = input.scenario || preset!.persona;
    title = preset?.label ?? `Role-play: ${input.scenario!.slice(0, 50)}`;
  }
  const profile = await db.subjectProfile.findUnique({ where: { userId } });
  const premium = input.premium && resolveModel(profile?.aiModel).tier === "premium";
  if (input.premium && !premium) throw new DomainError("Choose an available premium model in Settings first.");
  const chat = await db.$transaction(async (tx) => {
    if (premium) {
      const spent = await tx.subjectProfile.updateMany({ where: { userId, aiCredits: { gte: 1 } }, data: { aiCredits: { decrement: 1 } } });
      if (spent.count !== 1) throw new DomainError("A premium conversation costs 1 credit.", "no_credits");
    }
    const c = await tx.coachChat.create({ data: { userId, assessmentId: input.assessmentId ?? null, mode: input.mode, title, scenario, tier: premium ? "premium" : "free" } });
    if (premium) await tx.creditLedger.create({ data: { userId, delta: -1, reason: "ai_chat", ref: c.id } });
    return c;
  });
  await audit(userId, "chat.start", "CoachChat", chat.id, { mode: input.mode, tier: chat.tier });
  return chat;
}

export async function sendMessage(userId: string, chatId: string, rawText: string) {
  const text = z.string().trim().min(1, "Write a message first").max(2000).parse(rawText);
  const chat = await getChat(userId, chatId);
  if (chat.messages.length >= 80) throw new DomainError("This conversation is long; start a new one to keep answers sharp.");
  const { ctx, tone, aiModel } = await context(userId, chat.assessmentId);
  const history = [...chat.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })), { role: "user" as const, content: text }];
  const res = await generateChatReply({ region: await regionForAssessment(chat.assessmentId ?? ctx.report?.assessment.id), userId, mode: chat.mode, scenario: chat.scenario, ctx, history, tone, modelChoice: aiModel, premium: chat.tier === "premium", pro: (await chatFeature(userId)) === "chat_pro" });
  if (!res.ok && /limit/i.test(res.error)) throw new DomainError(`${res.error} Your message wasn't sent.`, "rate_limited");
  const reply = res.ok ? res.data : res.fallback;
  await db.$transaction([
    db.chatMessage.create({ data: { chatId, role: "user", content: text } }),
    db.chatMessage.create({ data: { chatId, role: "assistant", content: reply.reply, citations: reply.citations } }),
    db.coachChat.update({ where: { id: chatId }, data: { updatedAt: new Date() } }),
  ]);
  return { reply: reply.reply, citations: reply.citations, generatedBy: res.ok ? res.generatedBy : "template" };
}

export type ChatStreamEvent = { t: "delta"; v: string } | { t: "done"; citations: string[]; generatedBy: string; note?: string } | { t: "error"; error: string };

/** Like sendMessage, but yields the reply as it is written. Both messages are saved at the end. */
export async function* sendMessageStream(userId: string, chatId: string, rawText: string): AsyncGenerator<ChatStreamEvent> {
  const text = z.string().trim().min(1, "Write a message first").max(2000).parse(rawText);
  const chat = await getChat(userId, chatId);
  if (chat.messages.length >= 80) throw new DomainError("This conversation is long; start a new one to keep answers sharp.");
  const { ctx, tone, aiModel } = await context(userId, chat.assessmentId);
  const history = [...chat.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })), { role: "user" as const, content: text }];
  const filter = citationFilter();
  let end: { ok: boolean; generatedBy: string; error?: string; limited?: boolean } | null = null;
  for await (const ev of streamChatReply({ region: await regionForAssessment(chat.assessmentId ?? ctx.report?.assessment.id), userId, mode: chat.mode, scenario: chat.scenario, ctx, history, tone, modelChoice: aiModel, premium: chat.tier === "premium", pro: (await chatFeature(userId)) === "chat_pro" })) {
    if (ev.type === "text") {
      const out = filter.push(ev.text);
      if (out) yield { t: "delta", v: out };
    } else end = ev;
  }
  if (end?.limited) {
    yield { t: "error", error: `${end.error} Your message wasn't sent.` };
    return;
  }
  const { tail, reply, citations } = filter.finish();
  if (tail) yield { t: "delta", v: tail };
  if (!reply) {
    yield { t: "error", error: "No reply came back. Please try again." };
    return;
  }
  await db.$transaction([
    db.chatMessage.create({ data: { chatId, role: "user", content: text } }),
    db.chatMessage.create({ data: { chatId, role: "assistant", content: reply, citations } }),
    db.coachChat.update({ where: { id: chatId }, data: { updatedAt: new Date() } }),
  ]);
  yield { t: "done", citations, generatedBy: end?.generatedBy ?? "template", ...(end && !end.ok && end.error ? { note: end.error } : {}) };
}

export async function deleteChat(userId: string, chatId: string) {
  await getChat(userId, chatId);
  await db.coachChat.delete({ where: { id: chatId } });
}
