import * as vscode from "vscode";
import {
  credentialProviderIds,
  normalizeProviderId,
  providerIds,
  providerLabels,
  providerSecretKey
} from "./providers/registry";
import type { ProviderId } from "./providers/types";

export interface RequestConfig {
  timeoutMs: number;
  maxChunkChars: number;
  maxOutputTokens: number;
}

export interface ExtensionConfig {
  targetLanguage: string;
  activeProvider: ProviderId;
  providerModels: Record<string, string>;
  providerBaseUrls: Record<string, string>;
  request: RequestConfig;
  openai: {
    baseUrl: string;
    model: string;
  };
  azureOpenAI: {
    endpoint: string;
    deployment: string;
    apiVersion: string;
  };
  anthropic: {
    baseUrl: string;
    model: string;
  };
  githubCopilot: {
    modelId: string;
  };
}

export { credentialProviderIds, providerIds, providerLabels, providerSecretKey };

export function readExtensionConfig(resource?: vscode.Uri): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration("mdAiTranslator", resource);

  return {
    targetLanguage: cfg.get("targetLanguage", "Simplified Chinese").trim() || "Simplified Chinese",
    activeProvider: normalizeProviderId(cfg.get("activeProvider", "openai")),
    providerModels: cfg.get<Record<string, string>>("providerModels", {}),
    providerBaseUrls: cfg.get<Record<string, string>>("providerBaseUrls", {}),
    request: {
      timeoutMs: cfg.get("request.timeoutMs", 120000),
      maxChunkChars: cfg.get("request.maxChunkChars", 12000),
      maxOutputTokens: cfg.get("request.maxOutputTokens", 16384)
    },
    openai: {
      baseUrl: cfg.get("openai.baseUrl", "https://api.openai.com/v1"),
      model: cfg.get("openai.model", "gpt-4o-mini")
    },
    azureOpenAI: {
      endpoint: cfg.get("azureOpenAI.endpoint", ""),
      deployment: cfg.get("azureOpenAI.deployment", ""),
      apiVersion: cfg.get("azureOpenAI.apiVersion", "2024-10-21")
    },
    anthropic: {
      baseUrl: cfg.get("anthropic.baseUrl", "https://api.anthropic.com"),
      model: cfg.get("anthropic.model", "claude-3-5-sonnet-latest")
    },
    githubCopilot: {
      modelId: cfg.get("githubCopilot.modelId", "auto")
    }
  };
}
