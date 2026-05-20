import * as vscode from "vscode";
import { credentialProviderIds, providerLabels, providerSecretKey, readExtensionConfig } from "./config";
import type { ProviderId } from "./providers/types";
import { TranslationPreviewManager } from "./webview/panel";

let manager: TranslationPreviewManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  manager = new TranslationPreviewManager(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("mdAiTranslator.openPreview", () => {
      const document = getActiveMarkdownDocument();
      if (!document) {
        vscode.window.showWarningMessage("Open a Markdown document before starting AI translation preview.");
        return;
      }
      manager?.open(document);
    }),
    vscode.commands.registerCommand("mdAiTranslator.refreshPreview", () => {
      manager?.refreshActive();
    }),
    vscode.commands.registerCommand("mdAiTranslator.setApiKey", async () => {
      await setApiKeyOrProvider(context);
    }),
    vscode.commands.registerCommand("mdAiTranslator.clearApiKey", async () => {
      await clearApiKey(context);
    }),
    vscode.commands.registerCommand("mdAiTranslator.connectCopilot", async () => {
      await connectGitHubCopilot();
    }),
    vscode.commands.registerCommand("mdAiTranslator.selectCopilotModel", async () => {
      await connectGitHubCopilot();
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      manager?.updateDocument(event.document);
    })
  );
}

export function deactivate(): void {
  manager = undefined;
}

function getActiveMarkdownDocument(): vscode.TextDocument | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }
  return isMarkdownDocument(editor.document) ? editor.document : undefined;
}

function isMarkdownDocument(document: vscode.TextDocument): boolean {
  const fileName = document.fileName.toLowerCase();
  return document.languageId === "markdown" || fileName.endsWith(".md") || fileName.endsWith(".markdown");
}

async function setApiKeyOrProvider(context: vscode.ExtensionContext): Promise<void> {
  const providerId = await pickProvider("Set API key or choose GitHub Copilot", { includeCopilot: true });
  if (!providerId) {
    return;
  }

  if (providerId === "githubCopilot") {
    await connectGitHubCopilot();
    return;
  }

  const apiKey = await vscode.window.showInputBox({
    title: `Set ${providerLabels[providerId]} API Key`,
    prompt: "The key is stored in VS Code SecretStorage, not in settings.json.",
    password: true,
    ignoreFocusOut: true,
    validateInput(value) {
      return value.trim() ? undefined : "API key cannot be empty.";
    }
  });

  if (apiKey === undefined) {
    return;
  }

  await context.secrets.store(providerSecretKey(providerId), apiKey.trim());
  vscode.window.showInformationMessage(`${providerLabels[providerId]} API key saved.`);
}

async function clearApiKey(context: vscode.ExtensionContext): Promise<void> {
  const providerId = await pickProvider("Clear API key for provider");
  if (!providerId) {
    return;
  }

  await context.secrets.delete(providerSecretKey(providerId));
  vscode.window.showInformationMessage(`${providerLabels[providerId]} API key cleared.`);
}

async function pickProvider(
  placeHolder: string,
  options: { includeCopilot?: boolean } = {}
): Promise<ProviderId | undefined> {
  const activeProvider = readExtensionConfig().activeProvider;
  const ids: ProviderId[] = options.includeCopilot ? [...credentialProviderIds, "githubCopilot"] : credentialProviderIds;
  const picked = await vscode.window.showQuickPick(
    ids.map((id) => ({
      label: providerLabels[id],
      description: providerDescription(id, activeProvider),
      detail: id === "githubCopilot" ? "No API key required. Opens GitHub sign-in, then selects a Copilot model." : undefined,
      id
    })),
    { placeHolder }
  );
  return picked?.id;
}

function providerDescription(providerId: ProviderId, activeProvider: ProviderId): string | undefined {
  if (providerId === "githubCopilot") {
    return providerId === activeProvider ? "active · no API key" : "no API key";
  }
  return providerId === activeProvider ? "active" : undefined;
}

async function connectGitHubCopilot(): Promise<void> {
  const session = await signInToGitHubForCopilot();
  if (!session) {
    return;
  }

  await selectCopilotModel(session.account.label);
}

async function signInToGitHubForCopilot(): Promise<vscode.AuthenticationSession | undefined> {
  try {
    return await vscode.authentication.getSession(
      "github",
      ["read:user"],
      {
        createIfNone: {
          detail: "Sign in to GitHub so Markdown AI Translator can use the GitHub Copilot models exposed by VS Code."
        }
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(toUserMessage(error, "GitHub sign-in failed"));
    return undefined;
  }
}

async function selectCopilotModel(accountLabel: string): Promise<void> {
  const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
  if (models.length === 0) {
    vscode.window.showWarningMessage(
      `Signed in to GitHub as ${accountLabel}, but no GitHub Copilot language models are available. Install GitHub Copilot, sign in to Copilot Chat, and make sure your account has Copilot access.`
    );
    return;
  }

  const currentModelId = readExtensionConfig().githubCopilot.modelId;
  const picked = await vscode.window.showQuickPick(
    models.map((model) => ({
      label: model.name,
      description: [model.family, model.version].filter(Boolean).join(" · "),
      detail: model.id,
      model
    })),
    {
      placeHolder: currentModelId ? `Current: ${currentModelId}` : "Select a GitHub Copilot model for Markdown translation"
    }
  );

  if (!picked) {
    return;
  }

  const cfg = vscode.workspace.getConfiguration("mdAiTranslator");
  await cfg.update("githubCopilot.modelId", picked.model.id, vscode.ConfigurationTarget.Global);
  await cfg.update("activeProvider", "githubCopilot", vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(`Connected GitHub Copilot as ${accountLabel}. Model selected: ${picked.model.name}`);
}

function toUserMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return `${fallback}: ${error.message}`;
  }
  return fallback;
}
