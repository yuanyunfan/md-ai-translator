import { joinUrl, postJson, ProviderError } from "./http";
import { translationSystemPrompt, translationUserPrompt } from "./prompts";
import type { AiTranslationProvider, ProviderId, ProviderRuntimeConfig } from "./types";

export interface OpenAIProviderConfig extends ProviderRuntimeConfig {
  id?: ProviderId;
  label?: string;
  requiresApiKey?: boolean;
  baseUrl: string;
  model: string;
}

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export function createOpenAIProvider(config: OpenAIProviderConfig): AiTranslationProvider {
  const baseUrl = requireValue(config.baseUrl, "OpenAI-compatible base URL");
  const model = requireValue(config.model, "OpenAI-compatible model");
  const apiKey = config.requiresApiKey === false ? config.apiKey.trim() : requireValue(config.apiKey, "OpenAI-compatible API key");

  return {
    id: config.id ?? "openai",
    label: config.label ?? "OpenAI-compatible",
    async translateChunk(request) {
      const response = await postJson<OpenAIResponse>(
        joinUrl(baseUrl, "/chat/completions"),
        apiKey ? { authorization: `Bearer ${apiKey}` } : {},
        {
          model,
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
        throw new ProviderError("OpenAI-compatible response did not include translated content");
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
