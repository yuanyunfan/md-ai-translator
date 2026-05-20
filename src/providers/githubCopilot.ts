import * as vscode from "vscode";
import { ProviderError } from "./http";
import { translationSystemPrompt, translationUserPrompt } from "./prompts";
import type { AiTranslationProvider } from "./types";

export interface GitHubCopilotProviderConfig {
  modelId: string;
  timeoutMs: number;
}

export function createGitHubCopilotProvider(config: GitHubCopilotProviderConfig): AiTranslationProvider {
  return {
    id: "githubCopilot",
    label: "GitHub Copilot",
    async translateChunk(request) {
      const models = await selectCopilotModels(config.modelId);
      let lastError: ProviderError | undefined;

      for (const model of models) {
        try {
          return await translateWithModel(model, request, config.timeoutMs);
        } catch (error) {
          lastError = normalizeCopilotError(error, config.timeoutMs, model);
          if (lastError.providerCode === "NoPermissions") {
            break;
          }
        }
      }

      const tried = models.map((model) => modelLabel(model)).join(", ");
      if (lastError) {
        throw new ProviderError(`GitHub Copilot translation failed after trying ${tried}: ${lastError.message}`, undefined, lastError.providerCode);
      }
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
      {},
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
  const allModels = await vscode.lm.selectChatModels({ vendor: "copilot" });
  if (allModels.length === 0) {
    throw new ProviderError(
      "No GitHub Copilot language models are available. Install GitHub Copilot, sign in, and enable Copilot Chat in VS Code."
    );
  }

  const requestedId = normalizeModelPreference(modelId);
  const requestedModels = requestedId
    ? await vscode.lm.selectChatModels({ vendor: "copilot", id: requestedId })
    : [];
  return uniqueModels([...requestedModels, ...sortFallbackModels(allModels, requestedId)]);
}

function normalizeModelPreference(modelId: string): string {
  const trimmed = modelId.trim();
  return trimmed === "auto" ? "" : trimmed;
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
  return model.id === modelId || model.id === `copilot/${modelId}` || model.id.endsWith(`/${modelId}`);
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

function modelLabel(model: vscode.LanguageModelChat): string {
  return `${model.name} (${model.id})`;
}

function normalizeCopilotError(error: unknown, timeoutMs: number, model: vscode.LanguageModelChat): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }

  if (error instanceof vscode.LanguageModelError) {
    return new ProviderError(`${modelLabel(model)} request failed: ${error.message}`, undefined, error.code);
  }

  if (error instanceof Error && /cancel/i.test(error.message)) {
    return new ProviderError(`${modelLabel(model)} request timed out after ${timeoutMs}ms`);
  }

  if (error instanceof Error) {
    return new ProviderError(`${modelLabel(model)} request failed: ${error.message}`);
  }

  return new ProviderError(`${modelLabel(model)} request failed`);
}
