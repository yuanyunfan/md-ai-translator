import test from "node:test";
import assert from "node:assert/strict";
import {
  createGitHubCopilotProvider,
  fetchGitHubCopilotModels,
  normalizeCopilotModelId,
  selectGitHubCopilotModel
} from "../../src/providers/githubCopilot";

test("fetchGitHubCopilotModels filters disabled and unsupported models", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), "https://mock.copilot/models");
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer token");
    return jsonResponse({
      data: [
        copilotModel({ id: "internal-embedding", endpoints: ["/embeddings"] }),
        copilotModel({ id: "gpt-5-mini", name: "GPT-5 mini" }),
        copilotModel({ id: "disabled", policyState: "disabled" }),
        copilotModel({ id: "gpt-4o", name: "GPT-4o" })
      ]
    });
  }) as typeof fetch;

  const models = await fetchGitHubCopilotModels("token", { baseUrl: "https://mock.copilot" });
  assert.deepEqual(
    models.map((model) => model.id),
    ["gpt-4o", "gpt-5-mini"]
  );
});

test("selectGitHubCopilotModel supports legacy vendor prefixes and auto fallback", () => {
  const models = [
    copilotModelInfo("gpt-4o", "GPT-4o"),
    copilotModelInfo("gpt-4o-mini", "GPT-4o mini")
  ];

  assert.equal(normalizeCopilotModelId("copilot/gpt-4o"), "gpt-4o");
  assert.equal(selectGitHubCopilotModel(models, "copilot/gpt-4o-mini").id, "gpt-4o-mini");
  assert.equal(selectGitHubCopilotModel(models, "auto").id, "gpt-4o");
  assert.equal(selectGitHubCopilotModel(models, "missing-model").id, "gpt-4o");
});

test("GitHub Copilot provider translates with direct chat completions API", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const requests: Array<{ url: string; body?: Record<string, unknown>; headers: Record<string, string> }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const headers = init?.headers as Record<string, string>;
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    requests.push({ url, body, headers });

    if (url.endsWith("/models")) {
      return jsonResponse({
        data: [copilotModel({ id: "gpt-4o", name: "GPT-4o", endpoints: ["/chat/completions"] })]
      });
    }

    if (url.endsWith("/chat/completions")) {
      assert.equal(headers.authorization, "Bearer token");
      assert.equal(headers["Openai-Intent"], "conversation-edits");
      assert.equal(headers["x-initiator"], "user");
      assert.equal(body?.model, "gpt-4o");
      assert.equal(body?.temperature, undefined);
      assert.equal(body?.max_tokens, undefined);
      return jsonResponse({
        choices: [
          {
            message: {
              content: "# 你好"
            }
          }
        ]
      });
    }

    return jsonResponse({ error: { message: "unexpected request" } }, 500);
  }) as typeof fetch;

  const provider = createGitHubCopilotProvider({
    apiKey: "token",
    timeoutMs: 5000,
    maxOutputTokens: 2048,
    modelId: "gpt-4o",
    baseUrl: "https://mock.copilot"
  });
  const translated = await provider.translateChunk({
    markdown: "# Hello",
    targetLanguage: "Simplified Chinese",
    context: ""
  });

  assert.equal(translated, "# 你好");
  assert.deepEqual(
    requests.map((request) => request.url),
    ["https://mock.copilot/models", "https://mock.copilot/chat/completions"]
  );
});

test("GitHub Copilot provider omits unsupported temperature for responses API models", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    requests.push({ url, body });

    if (url.endsWith("/models")) {
      return jsonResponse({
        data: [copilotModel({ id: "gpt-5", name: "GPT-5", endpoints: ["/responses"] })]
      });
    }

    if (url.endsWith("/responses")) {
      assert.equal(body?.model, "gpt-5");
      assert.equal(body?.temperature, undefined);
      assert.equal(body?.max_output_tokens, undefined);
      return jsonResponse({
        output_text: "# 你好"
      });
    }

    return jsonResponse({ error: { message: "unexpected request" } }, 500);
  }) as typeof fetch;

  const provider = createGitHubCopilotProvider({
    apiKey: "token",
    timeoutMs: 5000,
    maxOutputTokens: 2048,
    modelId: "gpt-5",
    baseUrl: "https://mock.copilot"
  });
  const translated = await provider.translateChunk({
    markdown: "# Hello",
    targetLanguage: "Simplified Chinese",
    context: ""
  });

  assert.equal(translated, "# 你好");
  assert.deepEqual(
    requests.map((request) => request.url),
    ["https://mock.copilot/models", "https://mock.copilot/responses"]
  );
});

function copilotModelInfo(id: string, name: string) {
  return {
    id,
    name,
    family: id,
    supportedEndpoints: ["/chat/completions"],
    supportsReasoning: false,
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsVision: false
  };
}

function copilotModel(options: {
  id: string;
  name?: string;
  endpoints?: string[];
  policyState?: string;
}): Record<string, unknown> {
  return {
    model_picker_enabled: true,
    id: options.id,
    name: options.name ?? options.id,
    version: `${options.id}-2026-01-01`,
    supported_endpoints: options.endpoints ?? ["/chat/completions", "/responses"],
    policy: options.policyState ? { state: options.policyState } : undefined,
    capabilities: {
      family: options.id,
      limits: {
        max_context_window_tokens: 128000,
        max_output_tokens: 8192,
        max_prompt_tokens: 120000
      },
      supports: {
        streaming: true,
        tool_calls: true
      }
    }
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
