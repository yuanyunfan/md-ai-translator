import { logInfo, logWarning } from "../logging";
import { joinUrl, postJson, ProviderError } from "./http";
import { translationSystemPrompt, translationUserPrompt } from "./prompts";
import type { AiTranslationProvider, ProviderId, ProviderRuntimeConfig } from "./types";

export const githubCopilotTokenSecretKey = "mdAiTranslator.githubCopilot.oauthToken";
export const githubCopilotBaseUrl = "https://api.githubcopilot.com";

const requestUserAgent = "MarkdownAITranslator/0.1.0";
const supportedModelEndpoints = new Set(["/chat/completions", "/responses", "/v1/messages"]);
const preferredModelOrder = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-5-mini",
  "gpt-5",
  "claude-3.5-sonnet",
  "claude-sonnet-4",
  "claude-haiku-4.5"
];

export interface GitHubCopilotProviderConfig extends ProviderRuntimeConfig {
  id?: ProviderId;
  label?: string;
  modelId: string;
  baseUrl?: string;
}

export interface GitHubCopilotModel {
  id: string;
  name: string;
  family?: string;
  version?: string;
  releaseDate?: string;
  supportedEndpoints: string[];
  maxContextWindowTokens?: number;
  maxPromptTokens?: number;
  maxOutputTokens?: number;
  supportsReasoning: boolean;
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  supportsVision: boolean;
}

interface CopilotChatResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
      reasoning_text?: string;
    };
  }>;
}

interface CopilotResponsesResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
}

interface CopilotMessagesResponse {
  content?: Array<{
    text?: string;
    type?: string;
  }>;
}

export function createGitHubCopilotProvider(config: GitHubCopilotProviderConfig): AiTranslationProvider {
  const token = requireValue(config.apiKey, "GitHub Copilot token");
  const baseUrl = (config.baseUrl ?? githubCopilotBaseUrl).replace(/\/+$/, "");
  let modelCache: Promise<GitHubCopilotModel[]> | undefined;

  const getModels = () => {
    modelCache ??= fetchGitHubCopilotModels(token, { baseUrl, timeoutMs: config.timeoutMs });
    return modelCache;
  };

  return {
    id: config.id ?? "githubCopilot",
    label: config.label ?? "GitHub Copilot",
    async translateChunk(request) {
      const models = await getModels();
      const model = selectGitHubCopilotModel(models, config.modelId);
      const endpoint = endpointForModel(model);
      logInfo(
        `Using GitHub Copilot model ${model.name} (${model.id}; family=${model.family ?? "unknown"}; endpoint=${endpoint})`
      );

      switch (endpoint) {
        case "responses":
          return translateWithResponsesApi(baseUrl, token, model, request, config);
        case "messages":
          return translateWithMessagesApi(baseUrl, token, model, request, config);
        case "chat":
          return translateWithChatCompletions(baseUrl, token, model, request, config);
        default:
          return exhaustive(endpoint);
      }
    }
  };
}

export async function fetchGitHubCopilotModels(
  token: string,
  options: {
    baseUrl?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {}
): Promise<GitHubCopilotModel[]> {
  const baseUrl = (options.baseUrl ?? githubCopilotBaseUrl).replace(/\/+$/, "");
  const payload = await getJson(joinUrl(baseUrl, "/models"), copilotHeaders(token), options.timeoutMs ?? 30000, options.signal);
  const records = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
  const models = records
    .map(parseCopilotModel)
    .filter((model): model is GitHubCopilotModel => Boolean(model))
    .filter(hasSupportedEndpoint)
    .sort(compareCopilotModels);

  if (models.length === 0) {
    throw new ProviderError(
      "GitHub Copilot did not return any model usable for Markdown translation. Check your Copilot subscription and model access settings."
    );
  }

  return models;
}

export function selectGitHubCopilotModel(models: GitHubCopilotModel[], preference: string): GitHubCopilotModel {
  const normalized = normalizeCopilotModelId(preference);
  if (normalized && normalized !== "auto") {
    const exact = models.find((model) => model.id === normalized);
    if (exact) {
      return exact;
    }
    const byFamily = models.find((model) => model.family === normalized || model.name === normalized);
    if (byFamily) {
      return byFamily;
    }
    logWarning(`Configured GitHub Copilot model "${preference}" is unavailable; using ${models[0].id}.`);
  }
  return models[0];
}

export function normalizeCopilotModelId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "auto";
  }
  const separator = trimmed.indexOf("/");
  if (separator >= 0) {
    return trimmed.slice(separator + 1).trim() || "auto";
  }
  return trimmed;
}

function parseCopilotModel(value: unknown): GitHubCopilotModel | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.model_picker_enabled !== true) {
    return undefined;
  }

  const policy = asRecord(value.policy);
  if (policy?.state === "disabled") {
    return undefined;
  }

  const id = typeof value.id === "string" ? value.id : undefined;
  if (!id) {
    return undefined;
  }

  const capabilities = asRecord(value.capabilities);
  const limits = asRecord(capabilities?.limits);
  const supports = asRecord(capabilities?.supports);
  const visionLimits = asRecord(limits?.vision);
  const supportedMediaTypes = stringArray(visionLimits?.supported_media_types);
  const version = typeof value.version === "string" ? value.version : undefined;

  return {
    id,
    name: typeof value.name === "string" && value.name.trim() ? value.name : id,
    version,
    releaseDate: version?.startsWith(`${id}-`) ? version.slice(id.length + 1) : version,
    family: typeof capabilities?.family === "string" ? capabilities.family : undefined,
    supportedEndpoints: stringArray(value.supported_endpoints),
    maxContextWindowTokens: numberValue(limits?.max_context_window_tokens),
    maxPromptTokens: numberValue(limits?.max_prompt_tokens),
    maxOutputTokens: numberValue(limits?.max_output_tokens),
    supportsReasoning:
      supports?.adaptive_thinking === true ||
      Array.isArray(supports?.reasoning_effort) ||
      typeof supports?.max_thinking_budget === "number" ||
      typeof supports?.min_thinking_budget === "number",
    supportsStreaming: supports?.streaming === true,
    supportsToolCalls: supports?.tool_calls === true,
    supportsVision: supports?.vision === true || supportedMediaTypes.some((item) => item.startsWith("image/"))
  };
}

function hasSupportedEndpoint(model: GitHubCopilotModel): boolean {
  return model.supportedEndpoints.length === 0 || model.supportedEndpoints.some((endpoint) => supportedModelEndpoints.has(endpoint));
}

function compareCopilotModels(a: GitHubCopilotModel, b: GitHubCopilotModel): number {
  const priority = modelPriority(a) - modelPriority(b);
  if (priority !== 0) {
    return priority;
  }
  const byName = a.name.localeCompare(b.name);
  if (byName !== 0) {
    return byName;
  }
  return a.id.localeCompare(b.id);
}

function modelPriority(model: GitHubCopilotModel): number {
  const candidates = [model.id, model.family, model.name].filter(Boolean).map((value) => value!.toLowerCase());
  const index = preferredModelOrder.findIndex((preferred) =>
    candidates.some((candidate) => candidate === preferred || candidate.includes(preferred))
  );
  return index >= 0 ? index : preferredModelOrder.length;
}

function endpointForModel(model: GitHubCopilotModel): "chat" | "responses" | "messages" {
  const endpoints = new Set(model.supportedEndpoints);
  if (shouldUseResponsesApi(model.id) && endpoints.has("/responses")) {
    return "responses";
  }
  if (endpoints.size === 0 || endpoints.has("/chat/completions")) {
    return "chat";
  }
  if (endpoints.has("/responses")) {
    return "responses";
  }
  if (endpoints.has("/v1/messages")) {
    return "messages";
  }
  throw new ProviderError(`GitHub Copilot model ${model.id} does not expose a supported text generation endpoint.`);
}

function shouldUseResponsesApi(modelId: string): boolean {
  const match = /^gpt-(\d+)/.exec(modelId);
  return Boolean(match && Number(match[1]) >= 5 && !modelId.startsWith("gpt-5-mini"));
}

async function translateWithChatCompletions(
  baseUrl: string,
  token: string,
  model: GitHubCopilotModel,
  request: Parameters<AiTranslationProvider["translateChunk"]>[0],
  config: GitHubCopilotProviderConfig
): Promise<string> {
  const response = await postJson<CopilotChatResponse>(
    joinUrl(baseUrl, "/chat/completions"),
    copilotHeaders(token, { "Openai-Intent": "conversation-edits", "x-initiator": "user" }),
    {
      model: model.id,
      max_tokens: shouldOmitMaxOutputTokens(model.id) ? undefined : maxOutputTokens(model, config),
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

  const content = textFromUnknownContent(response.choices?.[0]?.message?.content);
  if (!content) {
    throw new ProviderError(`GitHub Copilot model ${model.id} response did not include translated content`);
  }
  return content;
}

async function translateWithResponsesApi(
  baseUrl: string,
  token: string,
  model: GitHubCopilotModel,
  request: Parameters<AiTranslationProvider["translateChunk"]>[0],
  config: GitHubCopilotProviderConfig
): Promise<string> {
  const response = await postJson<CopilotResponsesResponse>(
    joinUrl(baseUrl, "/responses"),
    copilotHeaders(token, { "Openai-Intent": "conversation-edits", "x-initiator": "user" }),
    {
      model: model.id,
      max_output_tokens: shouldOmitMaxOutputTokens(model.id) ? undefined : maxOutputTokens(model, config),
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: translationSystemPrompt() }]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: translationUserPrompt(request.markdown, request.targetLanguage, request.context)
            }
          ]
        }
      ]
    },
    config.timeoutMs,
    request.signal
  );

  const content = response.output_text?.trim() || response.output?.flatMap((item) => item.content ?? []).map((part) => part.text ?? "").join("");
  if (!content?.trim()) {
    throw new ProviderError(`GitHub Copilot model ${model.id} response did not include translated content`);
  }
  return content;
}

async function translateWithMessagesApi(
  baseUrl: string,
  token: string,
  model: GitHubCopilotModel,
  request: Parameters<AiTranslationProvider["translateChunk"]>[0],
  config: GitHubCopilotProviderConfig
): Promise<string> {
  const response = await postJson<CopilotMessagesResponse>(
    joinUrl(baseUrl, "/v1/messages"),
    copilotHeaders(token, {
      "anthropic-version": "2023-06-01",
      "Openai-Intent": "conversation-edits",
      "x-initiator": "user"
    }),
    {
      model: model.id,
      max_tokens: maxOutputTokens(model, config),
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

  const content = response.content?.map((part) => part.text ?? "").join("");
  if (!content?.trim()) {
    throw new ProviderError(`GitHub Copilot model ${model.id} response did not include translated content`);
  }
  return content;
}

function shouldOmitMaxOutputTokens(modelId: string): boolean {
  return /^gpt/i.test(modelId);
}

function maxOutputTokens(model: GitHubCopilotModel, config: GitHubCopilotProviderConfig): number {
  return Math.min(config.maxOutputTokens, model.maxOutputTokens ?? config.maxOutputTokens);
}

function copilotHeaders(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "User-Agent": requestUserAgent,
    ...extra
  };
}

async function getJson<T>(url: string, headers: Record<string, string>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
  const combinedSignal = combineSignals(timeoutController.signal, signal);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: combinedSignal
    });
    const payload = await readResponsePayload(response);
    if (!response.ok) {
      const error = extractProviderError(payload);
      throw new ProviderError(error.message || `GitHub Copilot request failed with HTTP ${response.status}`, response.status, error.code);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError(`GitHub Copilot request timed out after ${timeoutMs}ms`);
    }
    if (error instanceof Error) {
      throw new ProviderError(error.message);
    }
    throw new ProviderError("GitHub Copilot request failed");
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: { message: text } };
  }
}

function extractProviderError(payload: unknown): { message?: string; code?: string } {
  if (!isRecord(payload)) {
    return {};
  }

  const error = payload.error;
  if (isRecord(error)) {
    return {
      message: typeof error.message === "string" ? error.message : undefined,
      code: typeof error.code === "string" ? error.code : undefined
    };
  }

  if (typeof payload.message === "string") {
    return { message: payload.message };
  }

  return {};
}

function combineSignals(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
  if (!secondary) {
    return primary;
  }

  const controller = new AbortController();
  const abort = () => controller.abort();

  if (primary.aborted || secondary.aborted) {
    controller.abort();
    return controller.signal;
  }

  primary.addEventListener("abort", abort, { once: true });
  secondary.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

function textFromUnknownContent(content: unknown): string | undefined {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  const text = content
    .map((part) => {
      if (!isRecord(part)) {
        return "";
      }
      return typeof part.text === "string" ? part.text : "";
    })
    .join("")
    .trim();
  return text || undefined;
}

function requireValue(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ProviderError(`${label} is required. Run 'Markdown AI Translator: Connect AI Provider' first.`);
  }
  return trimmed;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function exhaustive(value: never): never {
  throw new Error(`Unhandled GitHub Copilot endpoint: ${String(value)}`);
}
