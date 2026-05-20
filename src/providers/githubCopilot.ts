import * as vscode from "vscode";
import { logError, logInfo, logWarning } from "../logging";
import { ProviderError } from "./http";
import { translationSystemPrompt, translationUserPrompt } from "./prompts";
import type { AiTranslationProvider } from "./types";

export interface GitHubCopilotProviderConfig {
  modelId: string;
  timeoutMs: number;
  accessInformation?: vscode.LanguageModelAccessInformation;
}

const preferredCopilotModelIds = ["gpt-4.1", "gpt-4o", "gpt-4o-mini", "gpt-5.2", "gpt-5.5"];
const unusableModelPattern = /embedding|embed|utility|internal|search|codex|1m/i;

export function createGitHubCopilotProvider(config: GitHubCopilotProviderConfig): AiTranslationProvider {
  return {
    id: "githubCopilot",
    label: "GitHub Copilot",
    async translateChunk(request) {
      const models = await selectCopilotModels(config.modelId);
      let lastError: ProviderError | undefined;

      logInfo(
        `GitHub Copilot translation candidates for "${config.modelId}": ${models.map((model) => modelLabel(model)).join("; ")}`
      );

      for (const model of models) {
        const access = config.accessInformation?.canSendRequest(model);
        logInfo(`Trying GitHub Copilot model ${modelLabel(model)}; access=${String(access)}`);

        if (access === false) {
          lastError = new ProviderError(
            `VS Code language model access is denied for ${modelLabel(model)}. Enable access for Markdown AI Translator and retry from the preview button.`,
            undefined,
            "NoPermissions"
          );
          logWarning(lastError.message);
          break;
        }

        try {
          return await translateWithModel(model, request, config.timeoutMs);
        } catch (error) {
          lastError = normalizeCopilotError(error, config.timeoutMs, model);
          logWarning(lastError.message);
          if (lastError.providerCode === "NoPermissions" || lastError.providerCode === "Blocked") {
            break;
          }
        }
      }

      const tried = models.map((model) => modelLabel(model)).join(", ");
      if (lastError) {
        logError(`GitHub Copilot translation failed after trying ${tried}: ${lastError.message}`);
        throw new ProviderError(`GitHub Copilot translation failed after trying ${tried}: ${lastError.message}`, undefined, lastError.providerCode);
      }
      logError(`GitHub Copilot translation failed after trying ${tried}`);
      throw new ProviderError(`GitHub Copilot translation failed after trying ${tried}`);
    }
  };
}

async function translateWithModel(
  model: vscode.LanguageModelChat,
  request: Parameters<AiTranslationProvider["translateChunk"]>[0],
  timeoutMs: number
): Promise<string> {
  const cancellation = new vscode.CancellationTokenSource();
  const timeout = setTimeout(() => cancellation.cancel(), timeoutMs);
  const abort = () => cancellation.cancel();
  request.signal?.addEventListener("abort", abort, { once: true });

  try {
    const response = await model.sendRequest(
      [
        vscode.LanguageModelChatMessage.User(
          [
            translationSystemPrompt(),
            "",
            translationUserPrompt(request.markdown, request.targetLanguage, request.context)
          ].join("\n")
        )
      ],
      {
        justification: "Translate the active Markdown document in Markdown AI Translator."
      },
      cancellation.token
    );
    let text = "";
    for await (const chunk of response.text) {
      text += chunk;
    }
    if (!text.trim()) {
      throw new ProviderError(`${modelLabel(model)} response did not include translated content`);
    }
    return text;
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", abort);
    cancellation.dispose();
  }
}

async function selectCopilotModels(modelId: string): Promise<vscode.LanguageModelChat[]> {
  const requestedId = normalizeModelPreference(modelId);
  const requestedModels = requestedId ? await selectUsableCopilotModels(requestedId) : [];
  const fallbackIds = preferredCopilotModelIds.filter((id) => id !== requestedId);
  const preferredModels = (await Promise.all(fallbackIds.map((id) => selectUsableCopilotModels(id)))).flat();
  const narrowModels = uniqueModels([...requestedModels, ...preferredModels]);

  if (narrowModels.length > 0) {
    return narrowModels;
  }

  const allModels = (await vscode.lm.selectChatModels({ vendor: "copilot" })).filter(isUsableCopilotChatModel);
  if (allModels.length === 0) {
    throw new ProviderError(
      "No GitHub Copilot language models are available. Install GitHub Copilot, sign in, and enable Copilot Chat in VS Code."
    );
  }

  return sortFallbackModels(allModels, requestedId);
}

async function selectUsableCopilotModels(modelId: string): Promise<vscode.LanguageModelChat[]> {
  const ids = uniqueStrings([modelId, stripCopilotVendorPrefix(modelId)]);
  const selectors: vscode.LanguageModelChatSelector[] = ids.flatMap((id) => [
    { vendor: "copilot", id },
    { vendor: "copilot", family: id }
  ]);
  const selected: vscode.LanguageModelChat[] = [];

  for (const selector of selectors) {
    try {
      selected.push(...await vscode.lm.selectChatModels(selector));
    } catch (error) {
      logWarning(`Failed to select GitHub Copilot models with ${JSON.stringify(selector)}: ${errorToMessage(error)}`);
    }
  }

  return uniqueModels(selected.filter(isUsableCopilotChatModel));
}

function normalizeModelPreference(modelId: string): string {
  const trimmed = modelId.trim();
  return trimmed === "auto" ? "" : stripCopilotVendorPrefix(trimmed);
}

function stripCopilotVendorPrefix(modelId: string): string {
  return modelId.startsWith("copilot/") ? modelId.slice("copilot/".length) : modelId;
}

function sortFallbackModels(models: vscode.LanguageModelChat[], requestedId: string): vscode.LanguageModelChat[] {
  const order = ["gpt-4.1", "gpt-4o", "gpt-4o-mini", "auto"];
  return [...models].sort((a, b) => scoreModel(a, requestedId, order) - scoreModel(b, requestedId, order));
}

function scoreModel(model: vscode.LanguageModelChat, requestedId: string, order: string[]): number {
  if (requestedId && matchesModelId(model, requestedId)) {
    return -100;
  }

  const orderIndex = order.findIndex((id) => matchesModelId(model, id));
  if (orderIndex >= 0) {
    return orderIndex;
  }

  if (/utility|embedding|internal|1m|codex/i.test(model.id)) {
    return 100;
  }

  return 50;
}

function matchesModelId(model: vscode.LanguageModelChat, modelId: string): boolean {
  const id = stripCopilotVendorPrefix(modelId);
  return model.id === id || model.id === modelId || model.family === id || model.id.endsWith(`/${id}`);
}

function uniqueModels(models: vscode.LanguageModelChat[]): vscode.LanguageModelChat[] {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (seen.has(model.id)) {
      return false;
    }
    seen.add(model.id);
    return true;
  });
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function modelLabel(model: vscode.LanguageModelChat): string {
  return `${model.name} (${model.vendor}/${model.id}; family=${model.family}; version=${model.version})`;
}

export function isUsableCopilotChatModel(model: vscode.LanguageModelChat): boolean {
  const searchable = [model.id, model.name, model.family, model.version].filter(Boolean).join(" ");
  if (unusableModelPattern.test(searchable)) {
    return false;
  }
  return model.vendor === "copilot" && model.id !== "auto";
}

function normalizeCopilotError(error: unknown, timeoutMs: number, model: vscode.LanguageModelChat): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }

  if (error instanceof vscode.LanguageModelError) {
    return new ProviderError(`${modelLabel(model)} request failed: ${languageModelErrorMessage(error)}`, undefined, error.code);
  }

  if (error instanceof Error && /cancel|abort/i.test(`${error.name} ${error.message}`)) {
    return new ProviderError(`${modelLabel(model)} request timed out after ${timeoutMs}ms`);
  }

  if (error instanceof Error) {
    return new ProviderError(`${modelLabel(model)} request failed: ${error.message}`);
  }

  return new ProviderError(`${modelLabel(model)} request failed`);
}

function languageModelErrorMessage(error: vscode.LanguageModelError): string {
  const cause = error.cause instanceof Error ? ` Cause: ${error.cause.message}` : "";
  return `${error.message}${cause}`;
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
