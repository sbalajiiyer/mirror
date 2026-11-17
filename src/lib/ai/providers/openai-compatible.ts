import { AIUnavailableError, sseData, type AIProvider, type AIRequest } from "../types";

/** Chat Completions API (OpenAI format). Used for Groq and OpenAI. */
export function openAICompatible(name: string, baseUrl: string, apiKey: () => string | undefined): AIProvider {
  return {
    name,
    async complete(model: string, req: AIRequest) {
      const key = apiKey();
      if (!key) throw new AIUnavailableError(`${name}: API key not configured`);
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: req.system }, ...req.messages],
          max_completion_tokens: req.maxTokens ?? 1500,
          temperature: req.temperature ?? 0.4,
          ...(req.json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new AIUnavailableError(`${name}: HTTP ${res.status} ${body.slice(0, 200)}`, res.status === 429 || res.status >= 500);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        text: data.choices?.[0]?.message?.content ?? "",
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      };
    },
    async *stream(model: string, req: AIRequest) {
      const key = apiKey();
      if (!key) throw new AIUnavailableError(`${name}: API key not configured`);
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: req.system }, ...req.messages],
          max_completion_tokens: req.maxTokens ?? 1500,
          temperature: req.temperature ?? 0.4,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => "");
        throw new AIUnavailableError(`${name}: HTTP ${res.status} ${body.slice(0, 200)}`, res.status === 429 || res.status >= 500);
      }
      for await (const data of sseData(res.body)) {
        if (data === "[DONE]") break;
        const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } | null; x_groq?: { usage?: { prompt_tokens?: number; completion_tokens?: number } } };
        const t = j.choices?.[0]?.delta?.content;
        if (t) yield { type: "text" as const, text: t };
        const u = j.usage ?? j.x_groq?.usage;
        if (u) yield { type: "usage" as const, inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0 };
      }
    },
  };
}

export const groqProvider = openAICompatible("groq", "https://api.groq.com/openai/v1", () => process.env.GROQ_API_KEY);
export const openAIProvider = openAICompatible("openai", "https://api.openai.com/v1", () => process.env.OPENAI_API_KEY);
