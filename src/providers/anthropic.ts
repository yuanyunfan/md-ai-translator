import { joinUrl, postJson, ProviderError } from "./http";
import { translationSystemPrompt, translationUserPrompt } from "./prompts";
import type { AiTranslationProvider, ProviderId, ProviderRuntimeConfig } from "./types";

export interface AnthropicProviderConfig extends ProviderRuntimeConfig {
  id?: ProviderId;
  label?: string;
  baseUrl: string;
  model: string;
}

interface AnthropicResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

export function createAnthropicProvider(config: AnthropicProviderConfig): AiTranslationProvider {
  const baseUrl = requireValue(config.baseUrl, "Anthropic base URL");
  const model = requireValue(config.model, "Anthropic model");
  const apiKey = requireValue(config.apiKey, "Anthropic API key");

  return {
    id: config.id ?? "anthropic",
    label: config.label ?? "Anthropic",
    async translateChunk(request) {
      const response = await postJson<AnthropicResponse>(
        joinUrl(baseUrl, "/v1/messages"),
        {
          "anthropic-version": "2023-06-01",
          "x-api-key": apiKey
        },
        {
          model,
          max_tokens: config.maxOutputTokens,
          temperature: 0.2,
          system: translationSystemPrompt(),
          messages: [
            {
              role: "user",
              content: translationUserPrompt(request.markdown, request.targetLanguage, request.context)
            }
          ]
        },
        config.timeoutMs,
        request.signal
      );

      const content = response.content
        ?.filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("");

      if (!content) {
        throw new ProviderError("Anthropic response did not include translated content");
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
