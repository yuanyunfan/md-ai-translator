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
      const model = await selectCopilotModel(config.modelId);
      const cancellation = new vscode.CancellationTokenSource();
      const timeout = setTimeout(() => cancellation.cancel(), config.timeoutMs);
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
          throw new ProviderError("GitHub Copilot response did not include translated content");
        }
        return text;
      } catch (error) {
        throw normalizeCopilotError(error, config.timeoutMs);
      } finally {
        clearTimeout(timeout);
        request.signal?.removeEventListener("abort", abort);
        cancellation.dispose();
      }
    }
  };
}

async function selectCopilotModel(modelId: string): Promise<vscode.LanguageModelChat> {
  const requestedId = modelId.trim();
  const selector: vscode.LanguageModelChatSelector = requestedId
    ? { vendor: "copilot", id: requestedId }
    : { vendor: "copilot" };
  let models = await vscode.lm.selectChatModels(selector);

  if (requestedId && models.length === 0) {
    models = await vscode.lm.selectChatModels({ vendor: "copilot" });
  }

  if (models.length === 0) {
    throw new ProviderError(
      "No GitHub Copilot language models are available. Install GitHub Copilot, sign in, and enable Copilot Chat in VS Code."
    );
  }

  return models[0];
}

function normalizeCopilotError(error: unknown, timeoutMs: number): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }

  if (error instanceof vscode.LanguageModelError) {
    return new ProviderError(`GitHub Copilot request failed: ${error.message}`, undefined, error.code);
  }

  if (error instanceof Error && /cancel/i.test(error.message)) {
    return new ProviderError(`GitHub Copilot request timed out after ${timeoutMs}ms`);
  }

  if (error instanceof Error) {
    return new ProviderError(`GitHub Copilot request failed: ${error.message}`);
  }

  return new ProviderError("GitHub Copilot request failed");
}
