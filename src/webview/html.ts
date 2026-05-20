export interface WebviewState {
  sourceHtml: string;
  translatedHtml: string;
  statusText: string;
  statusKind: "idle" | "loading" | "success" | "warning" | "error";
  providerLabel: string;
  targetLanguage: string;
  documentName: string;
}

export function getWebviewHtml(state: WebviewState): string {
  const nonce = createNonce();
  const encodedState = JSON.stringify(state).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
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

    button {
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      padding: 4px 10px;
      font: inherit;
      cursor: pointer;
    }

    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
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
      <button id="setKey" class="secondary" title="Set API key">Set Key</button>
      <button id="connectCopilot" class="secondary" title="Sign in and select a GitHub Copilot model">Connect Copilot</button>
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
    const initialState = ${encodedState};

    document.getElementById("refresh").addEventListener("click", () => {
      vscode.postMessage({ type: "refresh" });
    });
    document.getElementById("setKey").addEventListener("click", () => {
      vscode.postMessage({ type: "setApiKey" });
    });
    document.getElementById("connectCopilot").addEventListener("click", () => {
      vscode.postMessage({ type: "connectCopilot" });
    });
    document.getElementById("settings").addEventListener("click", () => {
      vscode.postMessage({ type: "openSettings" });
    });

    window.addEventListener("message", (event) => {
      if (event.data?.type === "state") {
        render(event.data.state);
      }
    });

    render(initialState);

    function render(state) {
      document.getElementById("document").textContent = state.documentName;
      document.getElementById("provider").textContent = state.providerLabel;
      document.getElementById("language").textContent = "→ " + state.targetLanguage;
      const status = document.getElementById("status");
      status.textContent = state.statusText;
      status.className = "status " + state.statusKind;
      document.getElementById("source").innerHTML = state.sourceHtml || '<p class="placeholder">No source content.</p>';
      document.getElementById("translated").innerHTML = state.translatedHtml || '<p class="placeholder">Translation will appear here.</p>';
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
