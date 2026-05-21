import { joinUrl, postJson, ProviderError } from "./http";
import { translationSystemPrompt, translationUserPrompt } from "./prompts";
import type { AiTranslationProvider, ProviderId, ProviderRuntimeConfig } from "./types";

export interface AzureOpenAIProviderConfig extends ProviderRuntimeConfig {
  id?: ProviderId;
  label?: string;
  endpoint: string;
  deployment: string;
  apiVersion: string;
}

interface AzureOpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export function createAzureOpenAIProvider(config: AzureOpenAIProviderConfig): AiTranslationProvider {
  const endpoint = requireValue(config.endpoint, "Azure OpenAI endpoint");
  const deployment = requireValue(config.deployment, "Azure OpenAI deployment");
  const apiVersion = requireValue(config.apiVersion, "Azure OpenAI API version");
  const apiKey = requireValue(config.apiKey, "Azure OpenAI API key");
  const url = `${joinUrl(endpoint, `/openai/deployments/${encodeURIComponent(deployment)}/chat/completions`)}?api-version=${encodeURIComponent(apiVersion)}`;

  return {
    id: config.id ?? "azureOpenAI",
    label: config.label ?? "Azure OpenAI",
    async translateChunk(request) {
      const response = await postJson<AzureOpenAIResponse>(
        url,
        {
          "api-key": apiKey
        },
        {
          temperature: 0.2,
          messages: [
            { role: "system", content: translationSystemPrompt() },
            {
              role: "user",
              content: translationUserPrompt(request.markdown, request.targetLanguage, request.context)
            }
          ]
        },
        config.timeoutMs,
        request.signal
      );

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new ProviderError("Azure OpenAI response did not include translated content");
      }
      return content;
    }
  };
}

function requireValue(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ProviderError(`${label} is required`);
  }
  return trimmed;
}
