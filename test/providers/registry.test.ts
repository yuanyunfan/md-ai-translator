import assert from "node:assert/strict";
import test from "node:test";
import { createProvider, resolveBaseUrl, resolveModel } from "../../src/providers";
import { getProviderDefinition, normalizeProviderId, providerRegistry, providerSecretKey } from "../../src/providers/registry";
import type { ExtensionConfig } from "../../src/config";

test("provider registry exposes built-in and OpenAI-compatible providers", () => {
  assert.ok(providerRegistry.some((provider) => provider.id === "githubCopilot" && provider.auth === "oauthDevice"));
  assert.ok(providerRegistry.some((provider) => provider.id === "openrouter" && provider.protocol === "openaiChat"));
  assert.ok(providerRegistry.some((provider) => provider.id === "ollama" && provider.auth === "none"));
  assert.equal(normalizeProviderId("missing"), "openai");
});

test("provider credentials preserve legacy secret keys for existing providers", () => {
  assert.equal(providerSecretKey("openai"), "mdAiTranslator.apiKey.openai");
  assert.equal(providerSecretKey("anthropic"), "mdAiTranslator.apiKey.anthropic");
  assert.equal(providerSecretKey("githubCopilot"), "mdAiTranslator.githubCopilot.oauthToken");
  assert.equal(providerSecretKey("openrouter"), "mdAiTranslator.credential.openrouter");
});

test("provider factory creates OpenAI-compatible preset providers from registry", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestedUrl = "";
  let requestedAuth = "";
  let requestedBody: Record<string, unknown> = {};
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedAuth = String((init?.headers as Record<string, string>).authorization);
    requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return jsonResponse({
      choices: [
        {
          message: {
            content: "Bonjour"
          }
        }
      ]
    });
  }) as typeof fetch;

  const config = configFor("openrouter", {
    providerModels: {
      openrouter: "anthropic/claude-3.5-sonnet"
    }
  });
  const provider = createProvider(config, "token");
  const translated = await provider.translateChunk({
    markdown: "# Hello",
    targetLanguage: "French",
    context: ""
  });

  assert.equal(provider.id, "openrouter");
  assert.equal(translated, "Bonjour");
  assert.equal(requestedUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(requestedAuth, "Bearer token");
  assert.equal(requestedBody.model, "anthropic/claude-3.5-sonnet");
});

test("custom OpenAI-compatible provider uses base URL and model overrides", () => {
  const definition = getProviderDefinition("customOpenAI");
  const config = configFor("customOpenAI", {
    providerBaseUrls: {
      customOpenAI: "https://custom.example/v1"
    },
    providerModels: {
      customOpenAI: "custom-model"
    }
  });

  assert.equal(resolveBaseUrl(config, definition), "https://custom.example/v1");
  assert.equal(resolveModel(config, definition), "custom-model");
});

test("local OpenAI-compatible providers do not require authorization headers", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestedAuth: string | undefined;
  globalThis.fetch = (async (_input, init) => {
    requestedAuth = (init?.headers as Record<string, string>).authorization;
    return jsonResponse({
      choices: [
        {
          message: {
            content: "本地翻译"
          }
        }
      ]
    });
  }) as typeof fetch;

  const provider = createProvider(configFor("ollama", { providerModels: { ollama: "llama3.2" } }));
  const translated = await provider.translateChunk({
    markdown: "# Hello",
    targetLanguage: "Simplified Chinese",
    context: ""
  });

  assert.equal(translated, "本地翻译");
  assert.equal(requestedAuth, undefined);
});

function configFor(providerId: ExtensionConfig["activeProvider"], overrides: Partial<ExtensionConfig> = {}): ExtensionConfig {
  return {
    targetLanguage: "Simplified Chinese",
    activeProvider: providerId,
    providerModels: {},
    providerBaseUrls: {},
    request: {
      timeoutMs: 1000,
      maxChunkChars: 6000,
      maxOutputTokens: 4096
    },
    openai: {
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini"
    },
    azureOpenAI: {
      endpoint: "https://azure.example.openai.azure.com",
      deployment: "deployment",
      apiVersion: "2024-10-21"
    },
    anthropic: {
      baseUrl: "https://api.anthropic.com",
      model: "claude-3-5-sonnet-latest"
    },
    githubCopilot: {
      modelId: "auto"
    },
    ...overrides
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}
