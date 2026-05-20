export type ProviderId = "openai" | "azureOpenAI" | "anthropic";

export interface TranslationChunkRequest {
  markdown: string;
  targetLanguage: string;
  context: string;
  signal?: AbortSignal;
}

export interface AiTranslationProvider {
  id: ProviderId;
  label: string;
  translateChunk(request: TranslationChunkRequest): Promise<string>;
}

export interface ProviderRuntimeConfig {
  apiKey: string;
  timeoutMs: number;
  maxOutputTokens: number;
}
