import { AIUnavailableError, type AIProvider } from "../types";

/** Anthropic Messages API (premium tier). */
export const anthropicProvider: AIProvider = {
  name: "anthropic",
  async complete(model, req) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new AIUnavailableError("anthropic: API key not configured");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        system: req.json ? `${req.system}\n\nRespond with a single JSON object only, no prose.` : req.system,
        messages: req.messages.filter((m) => m.role !== "system"),
        max_tokens: req.maxTokens ?? 1500,
        temperature: req.temperature ?? 0.4,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new AIUnavailableError(`anthropic: HTTP ${res.status} ${body.slice(0, 200)}`, res.status === 429 || res.status >= 500);
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
    return {
      text: (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join(""),
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    };
  },
};
