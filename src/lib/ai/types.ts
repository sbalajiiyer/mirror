export type AIMessage = { role: "system" | "user" | "assistant"; content: string };

export type AIRequest = {
  system: string;
  messages: AIMessage[];
  /** Ask the model for a single JSON object (validated by the caller). */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
};

export type AIResponse = { text: string; inputTokens: number; outputTokens: number };

/** Every LLM backend implements this. Add providers in src/lib/ai/providers/. */
export type AIStreamEvent = { type: "text"; text: string } | { type: "usage"; inputTokens: number; outputTokens: number };

export interface AIProvider {
  readonly name: string;
  complete(model: string, req: AIRequest): Promise<AIResponse>;
  /** Plain-text streaming (chat). Yields text deltas, then usage when the API reports it. */
  stream?(model: string, req: AIRequest): AsyncGenerator<AIStreamEvent>;
}

/** Split a Server-Sent Events byte stream into the JSON payloads of its `data:` lines. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
}

export class AIUnavailableError extends Error {
  constructor(message: string, public readonly retryable = false) {
    super(message);
  }
}
