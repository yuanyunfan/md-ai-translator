import type { ProviderDefinition, ProviderId, ProviderModel } from "./types";

const openAIModels: ProviderModel[] = [
  { id: "gpt-4o-mini", name: "GPT-4o mini" },
  { id: "gpt-4o", name: "GPT-4o" },
  { id: "gpt-4.1", name: "GPT-4.1" },
  { id: "gpt-4.1-mini", name: "GPT-4.1 mini" },
  { id: "gpt-5-mini", name: "GPT-5 mini" },
  { id: "gpt-5", name: "GPT-5" }
];

const providerDefinitions = [
  {
    id: "openai",
    label: "OpenAI",
    auth: "apiKey",
    protocol: "openaiChat",
    description: "OpenAI API using chat completions.",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    models: openAIModels
  },
  {
    id: "azureOpenAI",
    label: "Azure OpenAI",
    auth: "apiKey",
    protocol: "azureOpenAI",
    description: "Azure OpenAI deployment configured by endpoint and deployment name.",
    defaultModel: "deployment-name",
    models: [{ id: "deployment-name", name: "Azure deployment name" }]
  },
  {
    id: "anthropic",
    label: "Anthropic",
    auth: "apiKey",
    protocol: "anthropicMessages",
    description: "Anthropic Claude Messages API.",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-3-5-sonnet-latest",
    models: [
      { id: "claude-3-5-sonnet-latest", name: "Claude 3.5 Sonnet" },
      { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku" },
      { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }
    ]
  },
  {
    id: "githubCopilot",
    label: "GitHub Copilot",
    auth: "oauthDevice",
    protocol: "githubCopilot",
    description: "GitHub Copilot subscription through GitHub browser device login.",
    defaultModel: "auto",
    supportsDynamicModels: true
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    auth: "apiKey",
    protocol: "openaiChat",
    description: "OpenRouter OpenAI-compatible API.",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    models: [
      { id: "openai/gpt-4o-mini", name: "OpenAI GPT-4o mini" },
      { id: "openai/gpt-4o", name: "OpenAI GPT-4o" },
      { id: "anthropic/claude-3.5-sonnet", name: "Anthropic Claude 3.5 Sonnet" },
      { id: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash" }
    ]
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    auth: "apiKey",
    protocol: "openaiChat",
    description: "DeepSeek OpenAI-compatible API.",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    models: [
      { id: "deepseek-chat", name: "DeepSeek Chat" },
      { id: "deepseek-reasoner", name: "DeepSeek Reasoner" }
    ]
  },
  {
    id: "moonshot",
    label: "Moonshot / Kimi",
    auth: "apiKey",
    protocol: "openaiChat",
    description: "Moonshot AI OpenAI-compatible API.",
    baseUrl: "https://api.moonshot.ai/v1",
    defaultModel: "moonshot-v1-8k",
    models: [
      { id: "moonshot-v1-8k", name: "Moonshot v1 8K" },
      { id: "moonshot-v1-32k", name: "Moonshot v1 32K" },
      { id: "moonshot-v1-128k", name: "Moonshot v1 128K" }
    ]
  },
  {
    id: "xai",
    label: "xAI",
    auth: "apiKey",
    protocol: "openaiChat",
    description: "xAI OpenAI-compatible API.",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-3-mini",
    models: [
      { id: "grok-3-mini", name: "Grok 3 mini" },
      { id: "grok-3", name: "Grok 3" },
      { id: "grok-4", name: "Grok 4" }
    ]
  },
  {
    id: "groq",
    label: "Groq",
    auth: "apiKey",
    protocol: "openaiChat",
    description: "Groq OpenAI-compatible API.",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.1-8b-instant",
    models: [
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant" },
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile" }
    ]
  },
  {
    id: "together",
    label: "Together AI",
    auth: "apiKey",
    protocol: "openaiChat",
    description: "Together AI OpenAI-compatible API.",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    models: [
      { id: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", name: "Llama 3.1 8B Turbo" },
      { id: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", name: "Llama 3.1 70B Turbo" }
    ]
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    auth: "apiKey",
    protocol: "openaiChat",
    description: "Fireworks AI OpenAI-compatible API.",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    defaultModel: "accounts/fireworks/models/llama-v3p1-8b-instruct",
    models: [
      { id: "accounts/fireworks/models/llama-v3p1-8b-instruct", name: "Llama 3.1 8B Instruct" },
      { id: "accounts/fireworks/models/llama-v3p1-70b-instruct", name: "Llama 3.1 70B Instruct" }
    ]
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    auth: "apiKey",
    protocol: "openaiChat",
    description: "SiliconFlow OpenAI-compatible API.",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "deepseek-ai/DeepSeek-V3",
    models: [
      { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3" },
      { id: "Qwen/Qwen2.5-72B-Instruct", name: "Qwen2.5 72B Instruct" }
    ]
  },
  {
    id: "ollama",
    label: "Ollama",
    auth: "none",
    protocol: "openaiChat",
    description: "Local Ollama OpenAI-compatible endpoint.",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    models: [
      { id: "llama3.2", name: "Llama 3.2" },
      { id: "qwen2.5", name: "Qwen2.5" },
      { id: "mistral", name: "Mistral" }
    ]
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    auth: "none",
    protocol: "openaiChat",
    description: "Local LM Studio OpenAI-compatible endpoint.",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "local-model",
    models: [{ id: "local-model", name: "Local model" }]
  },
  {
    id: "customOpenAI",
    label: "Custom OpenAI-compatible",
    auth: "apiKey",
    protocol: "openaiChat",
    description: "Custom OpenAI-compatible endpoint and model.",
    requiresBaseUrl: true,
    defaultModel: "model-id",
    models: [{ id: "model-id", name: "Custom model" }]
  }
] as const satisfies readonly ProviderDefinition[];

export const providerRegistry: readonly ProviderDefinition[] = providerDefinitions;
export const providerIds = providerRegistry.map((provider) => provider.id) as ProviderId[];
export const providerLabels = Object.fromEntries(providerRegistry.map((provider) => [provider.id, provider.label])) as Record<
  ProviderId,
  string
>;
export const credentialProviderIds = providerRegistry
  .filter((provider) => provider.auth === "apiKey")
  .map((provider) => provider.id) as ProviderId[];

export function getProviderDefinition(providerId: ProviderId): ProviderDefinition {
  const provider = providerRegistry.find((item) => item.id === providerId);
  if (!provider) {
    throw new Error(`Unsupported provider: ${providerId}`);
  }
  return provider;
}

export function normalizeProviderId(value: string): ProviderId {
  return providerIds.includes(value as ProviderId) ? (value as ProviderId) : "openai";
}

export function providerSecretKey(providerId: ProviderId): string {
  if (providerId === "githubCopilot") {
    return "mdAiTranslator.githubCopilot.oauthToken";
  }
  if (providerId === "openai" || providerId === "azureOpenAI" || providerId === "anthropic") {
    return `mdAiTranslator.apiKey.${providerId}`;
  }
  return `mdAiTranslator.credential.${providerId}`;
}
