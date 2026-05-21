import * as vscode from "vscode";
import { logError, logInfo, logWarning } from "../logging";
import {
  copilotModelPreferenceToSelectors,
  formatCopilotModelPreference,
  isCopilotModelVendor
} from "./copilotModels";
import { ProviderError } from "./http";
import { translationSystemPrompt, translationUserPrompt } from "./prompts";
import type { AiTranslationProvider } from "./types";

export interface GitHubCopilotProviderConfig {
  modelId: string;
  timeoutMs: number;
  accessInformation?: vscode.LanguageModelAccessInformation;
}

const modelSelectionTimeoutMs = 10000;
const unusableModelPattern = /embedding|embed|utility|internal|search/i;

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
  const selectors = copilotModelPreferenceToSelectors(modelId);

  for (const selector of selectors) {
    const selected = await selectUsableCopilotModels(selector);
    if (selected.length > 0) {
      return selected;
    }
  }

  throw new ProviderError(
    `VS Code did not expose a usable GitHub Copilot chat model for ${selectors.map(formatCopilotModelPreference).join(", ")} within ${modelSelectionTimeoutMs}ms. ` +
      "Copilot Chat can be signed in while third-party Language Model API access is unavailable, blocked, or still resolving. " +
      "Run 'Markdown AI Translator: Connect GitHub Copilot' to choose another model, or switch to an API-key provider."
  );
}

async function selectUsableCopilotModels(selector: vscode.LanguageModelChatSelector): Promise<vscode.LanguageModelChat[]> {
  const selected: vscode.LanguageModelChat[] = [];

  try {
    logInfo(`Selecting GitHub Copilot models with ${JSON.stringify(selector)}.`);
    selected.push(
      ...await withTimeout(
        vscode.lm.selectChatModels(selector),
        modelSelectionTimeoutMs,
        `Timed out selecting GitHub Copilot models with ${JSON.stringify(selector)} after ${modelSelectionTimeoutMs}ms`
      )
    );
  } catch (error) {
    logWarning(`Failed to select GitHub Copilot models with ${JSON.stringify(selector)}: ${errorToMessage(error)}`);
  }

  return uniqueModels(selected.filter(isUsableCopilotChatModel));
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
  return isCopilotModelVendor(model.vendor);
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

function withTimeout<T>(promise: Thenable<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}
