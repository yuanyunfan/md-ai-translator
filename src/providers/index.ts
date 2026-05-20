import * as vscode from "vscode";
import type { ExtensionConfig } from "../config";
import { createAnthropicProvider } from "./anthropic";
import { createAzureOpenAIProvider } from "./azureOpenAI";
import { createGitHubCopilotProvider } from "./githubCopilot";
import { createOpenAIProvider } from "./openai";
import type { AiTranslationProvider, ProviderId } from "./types";

export interface ProviderFactoryOptions {
  languageModelAccessInformation?: vscode.LanguageModelAccessInformation;
}

export function createProvider(config: ExtensionConfig, apiKey?: string, options: ProviderFactoryOptions = {}): AiTranslationProvider {
  const runtime = {
    apiKey: apiKey ?? "",
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
    case "githubCopilot":
      return createGitHubCopilotProvider({
        modelId: config.githubCopilot.modelId,
        timeoutMs: config.request.timeoutMs,
        accessInformation: options.languageModelAccessInformation
      });
    default:
      return exhaustive(config.activeProvider);
  }
}

function exhaustive(provider: never): never {
  throw new Error(`Unsupported provider: ${String(provider as ProviderId)}`);
}
