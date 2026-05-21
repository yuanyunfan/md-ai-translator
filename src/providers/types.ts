export type ProviderId =
  | "openai"
  | "azureOpenAI"
  | "anthropic"
  | "githubCopilot"
  | "openrouter"
  | "deepseek"
  | "moonshot"
  | "xai"
  | "groq"
  | "together"
  | "fireworks"
  | "siliconflow"
  | "ollama"
  | "lmstudio"
  | "customOpenAI";

export type ProviderAuthType = "apiKey" | "oauthDevice" | "none";
export type ProviderProtocol = "openaiChat" | "anthropicMessages" | "azureOpenAI" | "githubCopilot";

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

export interface ProviderModel {
  id: string;
  name: string;
  description?: string;
}

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  auth: ProviderAuthType;
  protocol: ProviderProtocol;
  description: string;
  baseUrl?: string;
  defaultModel?: string;
  models?: ProviderModel[];
  supportsDynamicModels?: boolean;
  requiresBaseUrl?: boolean;
}
