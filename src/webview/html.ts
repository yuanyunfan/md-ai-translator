export interface WebviewState {
  sourceHtml: string;
  translatedHtml: string;
  statusText: string;
  statusKind: "idle" | "loading" | "success" | "warning" | "error";
  providerLabel: string;
  targetLanguage: string;
  documentName: string;
}

export interface WebviewAssets {
  cspSource: string;
  mermaidScriptUri: string;
}

export function getWebviewHtml(state: WebviewState, assets: WebviewAssets): string {
  const nonce = createNonce();
  const encodedState = Buffer.from(JSON.stringify(state), "utf8").toString("base64");
  const encodedMermaidScriptUri = JSON.stringify(assets.mermaidScriptUri).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${assets.cspSource}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' ${assets.cspSource};">
  <title>Markdown AI Translation Preview</title>
  <style>
    :root {
      color-scheme: light dark;
    }

    body {
      margin: 0;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    .toolbar {
      position: sticky;
      top: 0;
      z-index: 1;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: center;
      min-height: 44px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
      box-sizing: border-box;
    }

    .meta {
      min-width: 0;
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }

    .document {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: min(44vw, 520px);
    }

    .status {
      color: var(--vscode-descriptionForeground);
    }

    .status.loading {
      color: var(--vscode-progressBar-background);
    }

    .status.success {
      color: var(--vscode-testing-iconPassed);
    }

    .status.warning {
      color: var(--vscode-editorWarning-foreground);
    }

    .status.error {
      color: var(--vscode-editorError-foreground);
    }

    .actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    button,
    .button {
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      padding: 4px 10px;
      font: inherit;
      cursor: pointer;
      text-decoration: none;
      box-sizing: border-box;
    }

    button.secondary,
    .button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }

    button:hover,
    .button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button.secondary:hover,
    .button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .button[aria-disabled="true"] {
      opacity: 0.7;
      pointer-events: none;
    }

    .panes {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      min-height: calc(100vh - 45px);
    }

    .pane {
      min-width: 0;
      border-right: 1px solid var(--vscode-panel-border);
    }

    .pane:last-child {
      border-right: 0;
    }

    .pane-title {
      position: sticky;
      top: 45px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-editor-background);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .content {
      padding: 16px;
      line-height: 1.58;
      overflow-wrap: anywhere;
    }

    .content :first-child {
      margin-top: 0;
    }

    .content pre {
      overflow: auto;
      padding: 12px;
      border-radius: 6px;
      background: var(--vscode-textCodeBlock-background);
    }

    .content code {
      font-family: var(--vscode-editor-font-family);
      font-size: 0.95em;
    }

    .content table {
      border-collapse: collapse;
      width: 100%;
      display: block;
      overflow-x: auto;
    }

    .content th,
    .content td {
      border: 1px solid var(--vscode-panel-border);
      padding: 6px 8px;
    }

    .content .mermaid {
      margin: 1em 0;
      overflow-x: auto;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      text-align: center;
    }

    .content .mermaid svg {
      max-width: 100%;
      height: auto;
      background: transparent;
    }

    .content .mermaid-error {
      padding: 12px;
      border-left: 3px solid var(--vscode-editorError-foreground);
      text-align: left;
    }

    .content .mermaid-error-message {
      margin: 0 0 8px;
      color: var(--vscode-editorError-foreground);
      font-weight: 600;
    }

    .placeholder {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }

    @media (max-width: 760px) {
      .toolbar {
        grid-template-columns: 1fr;
      }

      .panes {
        grid-template-columns: 1fr;
      }

      .pane {
        border-right: 0;
        border-bottom: 1px solid var(--vscode-panel-border);
      }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="meta">
      <span id="document" class="document"></span>
      <span id="provider"></span>
      <span id="language"></span>
      <span id="status" class="status"></span>
    </div>
    <div class="actions">
      <button id="refresh" title="Refresh translation">Refresh</button>
      <button id="connectProvider" class="secondary" title="Connect an AI provider">Connect</button>
      <button id="selectModel" class="secondary" title="Select provider model">Model</button>
      <button id="settings" class="secondary" title="Open settings">Settings</button>
    </div>
  </div>
  <div class="panes">
    <section class="pane">
      <div class="pane-title">Original Markdown</div>
      <article id="source" class="content"></article>
    </section>
    <section class="pane">
      <div class="pane-title">Translation</div>
      <article id="translated" class="content"></article>
    </section>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const initialStateBase64 = "${encodedState}";
    const mermaidScriptUri = ${encodedMermaidScriptUri};
    let mermaidTheme = "";
    let mermaidRenderId = 0;
    let mermaidLoading = false;
    let mermaidLoadAttempted = false;

    window.addEventListener("error", (event) => {
      postLog("error", "webview error: " + formatError(event.error || event.message));
    });

    window.addEventListener("unhandledrejection", (event) => {
      postLog("error", "webview unhandled rejection: " + formatError(event.reason));
    });

    document.getElementById("refresh").addEventListener("click", () => {
      vscode.postMessage({ type: "refresh" });
    });
    document.getElementById("connectProvider").addEventListener("click", () => {
      vscode.postMessage({ type: "connectProvider" });
    });
    document.getElementById("selectModel").addEventListener("click", () => {
      vscode.postMessage({ type: "selectModel" });
    });
    document.getElementById("settings").addEventListener("click", () => {
      vscode.postMessage({ type: "openSettings" });
    });

    window.addEventListener("message", (event) => {
      if (event.data?.type === "state") {
        render(event.data.state);
      }
    });

    try {
      postLog("info", "webview init started");
      render(readInitialState());
      postLog("info", "webview init rendered");
    } catch (error) {
      postLog("error", "webview init failed: " + formatError(error));
      renderFallback(error);
    }

    function render(state) {
      document.getElementById("document").textContent = state.documentName;
      document.getElementById("provider").textContent = state.providerLabel;
      document.getElementById("language").textContent = "→ " + state.targetLanguage;
      const status = document.getElementById("status");
      status.textContent = state.statusText;
      status.className = "status " + state.statusKind;
      const refresh = document.getElementById("refresh");
      refresh.disabled = state.statusKind === "loading";
      refresh.setAttribute("aria-busy", state.statusKind === "loading" ? "true" : "false");
      document.getElementById("source").innerHTML = state.sourceHtml || '<p class="placeholder">No source content.</p>';
      document.getElementById("translated").innerHTML = state.translatedHtml || '<p class="placeholder">Translation will appear here.</p>';
      loadMermaidIfNeeded();
    }

    function readInitialState() {
      const binary = atob(initialStateBase64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    }

    function loadMermaidIfNeeded() {
      const hasMermaid = Boolean(document.querySelector(".mermaid"));
      if (!hasMermaid) {
        return;
      }
      if (window.mermaid) {
        renderMermaidDiagrams();
        return;
      }
      if (mermaidLoading || mermaidLoadAttempted) {
        return;
      }

      mermaidLoading = true;
      mermaidLoadAttempted = true;
      const script = document.createElement("script");
      script.src = mermaidScriptUri;
      script.onload = () => {
        mermaidLoading = false;
        postLog("info", "mermaid script loaded");
        renderMermaidDiagrams();
      };
      script.onerror = () => {
        mermaidLoading = false;
        postLog("error", "mermaid script failed to load: " + mermaidScriptUri);
      };
      document.head.appendChild(script);
    }

    function renderMermaidDiagrams() {
      const diagrams = Array.from(document.querySelectorAll(".mermaid")).filter((node) => !node.dataset.rendered);
      if (diagrams.length === 0) {
        return;
      }

      const theme = document.body.classList.contains("vscode-dark") || document.body.classList.contains("vscode-high-contrast")
        ? "dark"
        : "default";
      if (mermaidTheme !== theme) {
        window.mermaid.initialize({
          startOnLoad: false,
          theme,
          securityLevel: "strict"
        });
        mermaidTheme = theme;
      }

      for (const node of diagrams) {
        const source = node.textContent || "";
        node.dataset.rendered = "true";
        const id = "md-ai-translator-mermaid-" + String(mermaidRenderId++);
        void window.mermaid.render(id, source)
          .then((result) => {
            node.innerHTML = result.svg;
            if (typeof result.bindFunctions === "function") {
              result.bindFunctions(node);
            }
          })
          .catch((error) => {
            const message = document.createElement("p");
            message.className = "mermaid-error-message";
            message.textContent = "Mermaid render failed: " + (error instanceof Error ? error.message : String(error));
            const code = document.createElement("code");
            code.textContent = source;
            const pre = document.createElement("pre");
            pre.appendChild(code);
            node.classList.add("mermaid-error");
            node.replaceChildren(message, pre);
          });
    }

    function renderFallback(error) {
      document.getElementById("status").textContent = "Preview render failed. See Output: Markdown AI Translator.";
      document.getElementById("status").className = "status error";
      document.getElementById("source").innerHTML = '<p class="placeholder">Preview render failed.</p>';
      document.getElementById("translated").innerHTML = '<p class="placeholder">' + escapeHtml(formatError(error)) + '</p>';
    }

    function postLog(level, message) {
      try {
        vscode.postMessage({ type: "webviewLog", level, message });
      } catch {
        // Logging must never break preview rendering.
      }
    }

    function formatError(error) {
      if (error instanceof Error) {
        return error.stack || error.message;
      }
      return String(error);
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }
  </script>
</body>
</html>`;
}

function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i += 1) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
