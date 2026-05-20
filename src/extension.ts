import * as vscode from "vscode";
import { providerIds, providerLabels, providerSecretKey, readExtensionConfig } from "./config";
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
      await setApiKey(context);
    }),
    vscode.commands.registerCommand("mdAiTranslator.clearApiKey", async () => {
      await clearApiKey(context);
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

async function setApiKey(context: vscode.ExtensionContext): Promise<void> {
  const providerId = await pickProvider("Set API key for provider");
  if (!providerId) {
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

async function pickProvider(placeHolder: string): Promise<ProviderId | undefined> {
  const activeProvider = readExtensionConfig().activeProvider;
  const picked = await vscode.window.showQuickPick(
    providerIds.map((id) => ({
      label: providerLabels[id],
      description: id === activeProvider ? "active" : undefined,
      id
    })),
    { placeHolder }
  );
  return picked?.id;
}
