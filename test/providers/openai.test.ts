import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAIProvider } from "../../src/providers/openai";

test("OpenAI-compatible provider sends chat completions request and parses content", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedBody: unknown;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requestedUrl = String(input);
    requestedBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "Bonjour"
            }
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  try {
    const provider = createOpenAIProvider({
      apiKey: "test-key",
      baseUrl: "https://example.test/v1/",
      model: "test-model",
      timeoutMs: 1000,
      maxOutputTokens: 4096
    });
    const result = await provider.translateChunk({
      markdown: "# Hello",
      targetLanguage: "French",
      context: "test"
    });

    assert.equal(result, "Bonjour");
    assert.equal(requestedUrl, "https://example.test/v1/chat/completions");
    assert.equal((requestedBody as { model: string }).model, "test-model");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
