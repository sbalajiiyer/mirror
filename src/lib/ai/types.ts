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
export interface AIProvider {
  readonly name: string;
  complete(model: string, req: AIRequest): Promise<AIResponse>;
}

export class AIUnavailableError extends Error {
  constructor(message: string, public readonly retryable = false) {
    super(message);
  }
}
