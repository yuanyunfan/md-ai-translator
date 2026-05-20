import type { ExtensionConfig } from "../config";
import { createAnthropicProvider } from "./anthropic";
import { createAzureOpenAIProvider } from "./azureOpenAI";
import { createOpenAIProvider } from "./openai";
import type { AiTranslationProvider, ProviderId } from "./types";

export function createProvider(config: ExtensionConfig, apiKey: string): AiTranslationProvider {
  const runtime = {
    apiKey,
    timeoutMs: config.request.timeoutMs,
    maxOutputTokens: config.request.maxOutputTokens
  };

  switch (config.activeProvider) {
    case "openai":
      return createOpenAIProvider({
        ...runtime,
        baseUrl: config.openai.baseUrl,
        model: config.openai.model
      });
    case "azureOpenAI":
      return createAzureOpenAIProvider({
        ...runtime,
        endpoint: config.azureOpenAI.endpoint,
        deployment: config.azureOpenAI.deployment,
        apiVersion: config.azureOpenAI.apiVersion
      });
    case "anthropic":
      return createAnthropicProvider({
        ...runtime,
        baseUrl: config.anthropic.baseUrl,
        model: config.anthropic.model
      });
    default:
      return exhaustive(config.activeProvider);
  }
}

function exhaustive(provider: never): never {
  throw new Error(`Unsupported provider: ${String(provider as ProviderId)}`);
}
