import * as path from "node:path";
import * as vscode from "vscode";
import { providerLabels, providerSecretKey, readExtensionConfig } from "../config";
import { logError, logInfo, showLogOutput } from "../logging";
import { ProviderError } from "../providers/http";
import { createProvider } from "../providers";
import { getProviderDefinition } from "../providers/registry";
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
        retainContextWhenHidden: true,
        localResourceRoots: [this.context.extensionUri]
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
  private isRefreshing = false;

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
      translatedMarkdown: "",
      statusText: "Ready",
      statusKind: "idle",
      providerLabel: providerLabels[config.activeProvider],
      targetLanguage: config.targetLanguage,
      documentName: this.documentName
    };

    this.panel.webview.html = getWebviewHtml(this.state, this.webviewAssets());

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
      (message: { type?: string; level?: string; message?: string }) => {
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
      translatedMarkdown: this.state.translatedMarkdown,
      statusText: "Source changed. Refresh to update translation.",
      statusKind: "warning"
    };
    this.postState();
  }

  async refresh(): Promise<void> {
    if (this.isRefreshing) {
      this.state = {
        ...this.state,
        statusText: "Translation already running...",
        statusKind: "loading"
      };
      this.postState();
      return;
    }

    this.isRefreshing = true;
    const currentRun = this.runId + 1;
    this.runId = currentRun;
    const abortController = new AbortController();

    try {
      const document = await vscode.workspace.openTextDocument(this.documentUri);
      const config = readExtensionConfig(this.documentUri);
      const providerDefinition = getProviderDefinition(config.activeProvider);
      const apiKey = providerDefinition.auth === "none" ? "" : await this.context.secrets.get(providerSecretKey(config.activeProvider));

      this.state = {
        ...this.state,
        sourceHtml: this.renderer.render(document.getText()),
        translatedHtml: "",
        translatedMarkdown: "",
        providerLabel: providerLabels[config.activeProvider],
        targetLanguage: config.targetLanguage,
        statusText: "Preparing translation...",
        statusKind: "loading"
      };
      this.postState();

      if (providerDefinition.auth !== "none" && !apiKey) {
        this.state = {
          ...this.state,
          statusText:
            providerDefinition.auth === "oauthDevice"
              ? `${providerLabels[config.activeProvider]} is not connected. Run Markdown AI Translator: Connect AI Provider.`
              : `Missing API key for ${providerLabels[config.activeProvider]}. Run Markdown AI Translator: Connect AI Provider.`,
          statusKind: "error"
        };
        this.postState();
        return;
      }

      logInfo(
        `Starting translation for ${this.documentName}; provider=${config.activeProvider}; target=${config.targetLanguage}; maxChunkChars=${config.request.maxChunkChars}`
      );
      const provider = createProvider(config, apiKey);
      const translatedMarkdown = await translateMarkdownDocument({
        markdown: document.getText(),
        targetLanguage: config.targetLanguage,
        provider,
        maxChunkChars: config.request.maxChunkChars,
        signal: abortController.signal,
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
        translatedMarkdown,
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
        translatedMarkdown: "",
        statusText: `${toUserMessage(error)} See Output: Markdown AI Translator.`,
        statusKind: "error"
      };
      this.postState();
      showLogOutput();
    } finally {
      abortController.abort();
      if (this.runId === currentRun) {
        this.isRefreshing = false;
        this.postState();
      }
    }
  }

  private async handleMessage(message: { type?: string; level?: string; message?: string }): Promise<void> {
    switch (message.type) {
      case "refresh":
        await this.refresh();
        break;
      case "exportTranslation":
        await this.exportTranslation();
        break;
      case "connectProvider":
        await vscode.commands.executeCommand("mdAiTranslator.connectProvider");
        await this.refresh();
        break;
      case "selectModel":
        await vscode.commands.executeCommand("mdAiTranslator.selectModel");
        await this.refresh();
        break;
      case "openSettings":
        await vscode.commands.executeCommand("workbench.action.openSettings", "mdAiTranslator");
        break;
      case "webviewLog":
        this.logWebviewMessage(message);
        break;
    }
  }

  private postState(): void {
    void this.panel.webview.postMessage({ type: "state", state: this.state });
  }

  private webviewAssets(): { cspSource: string; mermaidScriptUri: string; webviewScriptUri: string } {
    return {
      cspSource: this.panel.webview.cspSource,
      mermaidScriptUri: this.panel.webview
        .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "dist", "mermaid.min.js"))
        .toString(),
      webviewScriptUri: this.panel.webview
        .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js"))
        .toString()
    };
  }

  private logWebviewMessage(message: { level?: string; message?: string }): void {
    const text = `Webview ${this.documentName}: ${message.message ?? ""}`;
    switch (message.level) {
      case "error":
        logError(text);
        break;
      case "warn":
        logInfo(text);
        break;
      default:
        logInfo(text);
        break;
    }
  }

  private async exportTranslation(): Promise<void> {
    if (this.state.translatedMarkdown.trim().length === 0) {
      vscode.window.showWarningMessage("No translated Markdown is available to export yet.");
      return;
    }

    const target = await vscode.window.showSaveDialog({
      defaultUri: this.defaultExportUri(),
      filters: {
        Markdown: ["md", "markdown"],
        "Plain Text": ["txt"]
      },
      saveLabel: "Export Translation",
      title: "Export translated Markdown"
    });

    if (!target) {
      return;
    }

    await vscode.workspace.fs.writeFile(target, Buffer.from(this.state.translatedMarkdown, "utf8"));
    logInfo(`Exported translated Markdown for ${this.documentName} to ${target.fsPath || target.toString()}.`);

    const open = "Open";
    const picked = await vscode.window.showInformationMessage(`Translation exported to ${path.basename(target.fsPath || target.path)}.`, open);
    if (picked === open) {
      const document = await vscode.workspace.openTextDocument(target);
      await vscode.window.showTextDocument(document, vscode.ViewColumn.Active);
    }
  }

  private defaultExportUri(): vscode.Uri {
    const exportName = defaultExportFileName(this.documentName, this.state.targetLanguage);
    if (this.documentUri.scheme === "file") {
      return vscode.Uri.file(path.join(path.dirname(this.documentUri.fsPath), exportName));
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      return vscode.Uri.joinPath(workspaceFolder.uri, exportName);
    }

    return vscode.Uri.file(path.join(process.cwd(), exportName));
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

function defaultExportFileName(documentName: string, targetLanguage: string): string {
  const parsed = path.parse(documentName);
  const base = parsed.name || documentName || "translation";
  const extension = parsed.ext || ".md";
  return `${base}.${languageSuffix(targetLanguage)}${extension}`;
}

function languageSuffix(targetLanguage: string): string {
  const normalized = targetLanguage.trim().toLowerCase();
  const known: Record<string, string> = {
    "simplified chinese": "zh-CN",
    "traditional chinese": "zh-TW",
    english: "en",
    japanese: "ja",
    korean: "ko",
    french: "fr",
    german: "de",
    spanish: "es",
    portuguese: "pt",
    italian: "it",
    russian: "ru",
    arabic: "ar",
    hindi: "hi",
    vietnamese: "vi",
    thai: "th",
    indonesian: "id"
  };

  return known[normalized] ?? (normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "translated");
}
