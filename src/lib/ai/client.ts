import "server-only";
import { createHash } from "node:crypto";
import type { z } from "zod";
import { db } from "@/lib/db";
import { costMicros, resolveModel, type AIModelEntry } from "./models";
import { anthropicProvider } from "./providers/anthropic";
import { groqProvider, openAIProvider } from "./providers/openai-compatible";
import { AIUnavailableError, type AIProvider, type AIRequest } from "./types";

export type AIFeature = "summary" | "plan" | "deidentify" | "framework" | "invite_message" | "questionnaire" | "coach_brief" | "chat" | "chat_premium";

/** Daily caps protect the free Groq quota and premium spend. */
export const DAILY_LIMITS: Record<AIFeature, number> = {
  summary: 10,
  plan: 10,
  deidentify: 40, // per rater invite
  framework: 20,
  invite_message: 20,
  questionnaire: 5,
  coach_brief: 20,
  chat: 30, // free model: messages per user per day
  chat_premium: 200, // premium conversations are paid with credits
};

const PROVIDERS: Record<string, AIProvider> = { groq: groqProvider, openai: openAIProvider, anthropic: anthropicProvider };

export type AIResult<T> = { ok: true; data: T; modelId: string; generatedBy: "ai" | "mock" } | { ok: false; error: string; fallback: T };

export const actorKeyFor = (id: string) => createHash("sha256").update(`actor:${id}`).digest("hex");

/** Pull the first JSON object out of a model reply (tolerates code fences / stray prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in reply");
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * Run one AI task: pick the model, enforce the daily cap, call the provider (one retry on
 * rate-limit/5xx), validate the JSON against `schema`, and meter the call. Never throws:
 * on any failure it returns `fallback` so the product keeps working without AI.
 */
export async function runAI<T>(opts: {
  feature: AIFeature;
  userId?: string | null;
  actorKey?: string | null;
  modelChoice?: string | null;
  fast?: boolean;
  request: AIRequest;
  schema: z.ZodType<T>;
  mock: () => T;
  fallback: () => T;
}): Promise<AIResult<T>> {
  const entry = resolveModel(opts.modelChoice);
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const used = await db.aIInteractionLog.count({
    where: {
      feature: opts.feature,
      createdAt: { gte: since },
      ...(opts.userId ? { userId: opts.userId } : { actorKey: opts.actorKey ?? "anonymous" }),
    },
  });
  if (used >= DAILY_LIMITS[opts.feature]) {
    return { ok: false, error: "Daily AI limit reached for this feature. Try again tomorrow.", fallback: opts.fallback() };
  }

  const log = (status: string, extra: { inputTokens?: number; outputTokens?: number; error?: string } = {}) =>
    db.aIInteractionLog
      .create({
        data: {
          userId: opts.userId ?? null,
          actorKey: opts.userId ? null : (opts.actorKey ?? "anonymous"),
          feature: opts.feature,
          modelId: entry.id,
          provider: entry.provider,
          tier: entry.provider === "mock" ? "mock" : entry.tier,
          inputTokens: extra.inputTokens ?? 0,
          outputTokens: extra.outputTokens ?? 0,
          costMicros: status === "ok" ? costMicros(entry, extra.inputTokens ?? 0, extra.outputTokens ?? 0) : 0,
          status,
          error: extra.error?.slice(0, 500),
        },
      })
      .catch((e) => console.error("[ai] log failed", e));

  if (entry.provider === "mock") {
    const data = opts.schema.parse(opts.mock());
    await log("ok");
    return { ok: true, data, modelId: entry.id, generatedBy: "mock" };
  }

  try {
    const res = await callWithRetry(entry, opts.fast ? entry.fastModel : entry.model, { ...opts.request, json: true });
    const data = opts.schema.parse(extractJson(res.text));
    await log("ok", res);
    return { ok: true, data, modelId: entry.id, generatedBy: "ai" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[ai] ${opts.feature} failed: ${error}`);
    await log("fallback", { error });
    return { ok: false, error: "The AI service is unavailable right now, so a standard version was used.", fallback: opts.fallback() };
  }
}

async function callWithRetry(entry: AIModelEntry, model: string, req: AIRequest) {
  const provider = PROVIDERS[entry.provider];
  if (!provider) throw new AIUnavailableError(`Unknown provider ${entry.provider}`);
  try {
    return await provider.complete(model, req);
  } catch (e) {
    if (e instanceof AIUnavailableError && e.retryable) {
      await new Promise((r) => setTimeout(r, 1500));
      return provider.complete(model, req);
    }
    throw e;
  }
}
