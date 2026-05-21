import type { ExtensionConfig } from "../config";
import { createAnthropicProvider } from "./anthropic";
import { createAzureOpenAIProvider } from "./azureOpenAI";
import { createGitHubCopilotProvider } from "./githubCopilot";
import { createOpenAIProvider } from "./openai";
import { getProviderDefinition } from "./registry";
import type { AiTranslationProvider, ProviderDefinition } from "./types";

export function createProvider(config: ExtensionConfig, apiKey?: string): AiTranslationProvider {
  const definition = getProviderDefinition(config.activeProvider);
  const runtime = {
    apiKey: apiKey ?? "",
    timeoutMs: config.request.timeoutMs,
    maxOutputTokens: config.request.maxOutputTokens
  };

  switch (definition.protocol) {
    case "openaiChat":
      return createOpenAIProvider({
        ...runtime,
        id: definition.id,
        label: definition.label,
        requiresApiKey: definition.auth !== "none",
        baseUrl: resolveBaseUrl(config, definition),
        model: resolveModel(config, definition)
      });
    case "azureOpenAI":
      return createAzureOpenAIProvider({
        ...runtime,
        id: definition.id,
        label: definition.label,
        endpoint: config.azureOpenAI.endpoint,
        deployment: resolveAzureDeployment(config),
        apiVersion: config.azureOpenAI.apiVersion
      });
    case "anthropicMessages":
      return createAnthropicProvider({
        ...runtime,
        id: definition.id,
        label: definition.label,
        baseUrl: resolveBaseUrl(config, definition),
        model: resolveModel(config, definition)
      });
    case "githubCopilot":
      return createGitHubCopilotProvider({
        ...runtime,
        id: definition.id,
        label: definition.label,
        modelId: resolveModel(config, definition)
      });
    default:
      return exhaustive(definition.protocol);
  }
}

export function resolveModel(config: ExtensionConfig, definition: ProviderDefinition): string {
  const configured = config.providerModels[definition.id]?.trim();
  if (configured) {
    return configured;
  }

  switch (definition.id) {
    case "openai":
      return config.openai.model;
    case "anthropic":
      return config.anthropic.model;
    case "azureOpenAI":
      return config.azureOpenAI.deployment;
    case "githubCopilot":
      return config.githubCopilot.modelId;
    default:
      return definition.defaultModel ?? "";
  }
}

export function resolveBaseUrl(config: ExtensionConfig, definition: ProviderDefinition): string {
  const configured = config.providerBaseUrls[definition.id]?.trim();
  if (configured) {
    return configured;
  }

  switch (definition.id) {
    case "openai":
      return config.openai.baseUrl;
    case "anthropic":
      return config.anthropic.baseUrl;
    default:
      return definition.baseUrl ?? "";
  }
}

function resolveAzureDeployment(config: ExtensionConfig): string {
  return config.providerModels.azureOpenAI?.trim() || config.azureOpenAI.deployment;
}

function exhaustive(value: never): never {
  throw new Error(`Unsupported provider protocol: ${String(value)}`);
}
