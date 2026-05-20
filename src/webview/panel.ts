import * as path from "node:path";
import * as vscode from "vscode";
import { providerLabels, providerSecretKey, readExtensionConfig } from "../config";
import { logError, logInfo, showLogOutput } from "../logging";
import { ProviderError } from "../providers/http";
import { createProvider } from "../providers";
import { translateMarkdownDocument } from "../translation/translator";
import { getWebviewHtml, type WebviewState } from "./html";
import { MarkdownRenderer } from "./renderer";

export class TranslationPreviewManager {
  private readonly panels = new Map<string, TranslationPreviewPanel>();
  private activePanel?: TranslationPreviewPanel;

  constructor(private readonly context: vscode.ExtensionContext) {}

  open(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const existing = this.panels.get(key);
    if (existing) {
      existing.reveal();
      void existing.refresh();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "mdAiTranslator.translationPreview",
      `Translation: ${path.basename(document.uri.fsPath || document.fileName)}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    const preview = new TranslationPreviewPanel(this.context, document, panel, () => {
      this.panels.delete(key);
      if (this.activePanel === preview) {
        this.activePanel = undefined;
      }
    }, () => {
      this.activePanel = preview;
    });
    this.panels.set(key, preview);
    this.activePanel = preview;
    void preview.refresh();
  }

  refreshActive(): void {
    if (this.activePanel) {
      void this.activePanel.refresh();
      return;
    }

    const visiblePanel = [...this.panels.values()].find((panel) => panel.isVisible);
    if (visiblePanel) {
      void visiblePanel.refresh();
      return;
    }

    vscode.window.showInformationMessage("No Markdown AI translation preview is open.");
  }

  updateDocument(document: vscode.TextDocument): void {
    const panel = this.panels.get(document.uri.toString());
    panel?.updateSource(document);
  }

}

class TranslationPreviewPanel {
  private readonly renderer = new MarkdownRenderer();
  private readonly documentUri: vscode.Uri;
  private readonly documentName: string;
  private state: WebviewState;
  private runId = 0;

  constructor(
    private readonly context: vscode.ExtensionContext,
    document: vscode.TextDocument,
    private readonly panel: vscode.WebviewPanel,
    onDispose: () => void,
    onActivate: () => void
  ) {
    this.documentUri = document.uri;
    this.documentName = path.basename(document.uri.fsPath || document.fileName);
    const config = readExtensionConfig(this.documentUri);
    this.state = {
      sourceHtml: this.renderer.render(document.getText()),
      translatedHtml: "",
      statusText: "Ready",
      statusKind: "idle",
      providerLabel: providerLabels[config.activeProvider],
      targetLanguage: config.targetLanguage,
      documentName: this.documentName
    };

    this.panel.webview.html = getWebviewHtml(this.state);

    this.panel.onDidDispose(onDispose, undefined, this.context.subscriptions);
    this.panel.onDidChangeViewState(
      (event) => {
        if (event.webviewPanel.active) {
          onActivate();
        }
      },
      undefined,
      this.context.subscriptions
    );
    this.panel.webview.onDidReceiveMessage(
      (message: { type?: string }) => {
        void this.handleMessage(message);
      },
      undefined,
      this.context.subscriptions
    );
  }

  get isVisible(): boolean {
    return this.panel.visible;
  }

  reveal(): void {
    this.panel.reveal(vscode.ViewColumn.Beside);
  }

  updateSource(document: vscode.TextDocument): void {
    if (document.uri.toString() !== this.documentUri.toString()) {
      return;
    }
    this.state = {
      ...this.state,
      sourceHtml: this.renderer.render(document.getText()),
      translatedHtml: this.state.translatedHtml,
      statusText: "Source changed. Refresh to update translation.",
      statusKind: "warning"
    };
    this.postState();
  }

  async refresh(): Promise<void> {
    const currentRun = this.runId + 1;
    this.runId = currentRun;
    const document = await vscode.workspace.openTextDocument(this.documentUri);
    const config = readExtensionConfig(this.documentUri);
    const apiKey = config.activeProvider === "githubCopilot"
      ? undefined
      : await this.context.secrets.get(providerSecretKey(config.activeProvider));

    this.state = {
      ...this.state,
      sourceHtml: this.renderer.render(document.getText()),
      translatedHtml: "",
      providerLabel: providerLabels[config.activeProvider],
      targetLanguage: config.targetLanguage,
      statusText: "Preparing translation...",
      statusKind: "loading"
    };
    this.postState();

    if (config.activeProvider !== "githubCopilot" && !apiKey) {
      this.state = {
        ...this.state,
        statusText: `Missing API key for ${providerLabels[config.activeProvider]}. Use Set Key.`,
        statusKind: "error"
      };
      this.postState();
      return;
    }

    try {
      logInfo(
        `Starting translation for ${this.documentName}; provider=${config.activeProvider}; target=${config.targetLanguage}; maxChunkChars=${config.request.maxChunkChars}`
      );
      const provider = createProvider(config, apiKey, {
        languageModelAccessInformation: this.context.languageModelAccessInformation
      });
      const translatedMarkdown = await translateMarkdownDocument({
        markdown: document.getText(),
        targetLanguage: config.targetLanguage,
        provider,
        maxChunkChars: config.request.maxChunkChars,
        onProgress: (completed, total) => {
          if (this.runId !== currentRun) {
            return;
          }
          this.state = {
            ...this.state,
            statusText: `Translating ${completed}/${total} chunks...`,
            statusKind: "loading"
          };
          this.postState();
        }
      });

      if (this.runId !== currentRun) {
        return;
      }

      this.state = {
        ...this.state,
        translatedHtml: this.renderer.render(translatedMarkdown),
        statusText: "Translation ready",
        statusKind: "success"
      };
      logInfo(`Translation ready for ${this.documentName}.`);
      this.postState();
    } catch (error) {
      if (this.runId !== currentRun) {
        return;
      }
      logError(`Translation failed for ${this.documentName}: ${toUserMessage(error)}`);
      this.state = {
        ...this.state,
        translatedHtml: "",
        statusText: `${toUserMessage(error)} See Output: Markdown AI Translator.`,
        statusKind: "error"
      };
      this.postState();
      showLogOutput();
    }
  }

  private async handleMessage(message: { type?: string }): Promise<void> {
    switch (message.type) {
      case "refresh":
        await this.refresh();
        break;
      case "setApiKey":
        await vscode.commands.executeCommand("mdAiTranslator.setApiKey");
        await this.refresh();
        break;
      case "connectCopilot":
        await vscode.commands.executeCommand("mdAiTranslator.connectCopilot");
        await this.refresh();
        break;
      case "openSettings":
        await vscode.commands.executeCommand("workbench.action.openSettings", "mdAiTranslator");
        break;
    }
  }

  private postState(): void {
    void this.panel.webview.postMessage({ type: "state", state: this.state });
  }
}

function toUserMessage(error: unknown): string {
  if (error instanceof ProviderError) {
    return error.status ? `${error.message} (HTTP ${error.status})` : error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Translation failed";
}
