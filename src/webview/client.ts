declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
};

export {};

interface WebviewState {
  sourceHtml: string;
  translatedHtml: string;
  translatedMarkdown: string;
  statusText: string;
  statusKind: "idle" | "loading" | "success" | "warning" | "error";
  providerLabel: string;
  targetLanguage: string;
  documentName: string;
}

interface MermaidRenderResult {
  svg: string;
  bindFunctions?: (element: Element) => void;
}

interface MermaidApi {
  initialize(config: { startOnLoad: boolean; theme: string; securityLevel: string }): void;
  render(id: string, source: string): Promise<MermaidRenderResult>;
}

declare global {
  interface Window {
    mermaid?: MermaidApi;
  }
}

const vscode = acquireVsCodeApi();
let mermaidTheme = "";
let mermaidRenderId = 0;
let mermaidLoading = false;
let mermaidLoadAttempted = false;

window.addEventListener("error", (event) => {
  postLog("error", `webview error: ${formatError(event.error || event.message)}`);
});

window.addEventListener("unhandledrejection", (event) => {
  postLog("error", `webview unhandled rejection: ${formatError(event.reason)}`);
});

bindButton("refresh", { type: "refresh" });
bindButton("exportTranslation", { type: "exportTranslation" });
bindButton("connectProvider", { type: "connectProvider" });
bindButton("selectModel", { type: "selectModel" });
bindButton("settings", { type: "openSettings" });

window.addEventListener("message", (event: MessageEvent<{ type?: string; state?: WebviewState }>) => {
  if (event.data?.type === "state" && event.data.state) {
    render(event.data.state);
  }
});

try {
  postLog("info", "webview init started");
  render(readInitialState());
  postLog("info", "webview init rendered");
} catch (error) {
  postLog("error", `webview init failed: ${formatError(error)}`);
  renderFallback(error);
}

function bindButton(id: string, message: { type: string }): void {
  document.getElementById(id)?.addEventListener("click", () => {
    vscode.postMessage(message);
  });
}

function render(state: WebviewState): void {
  setText("document", state.documentName);
  setText("provider", state.providerLabel);
  setText("language", `-> ${state.targetLanguage}`);
  const status = requiredElement("status");
  status.textContent = state.statusText;
  status.className = `status ${state.statusKind}`;

  const refresh = requiredElement("refresh") as HTMLButtonElement;
  refresh.disabled = state.statusKind === "loading";
  refresh.setAttribute("aria-busy", state.statusKind === "loading" ? "true" : "false");

  const exportTranslation = requiredElement("exportTranslation") as HTMLButtonElement;
  exportTranslation.disabled = state.statusKind === "loading" || state.translatedMarkdown.trim().length === 0;

  requiredElement("source").innerHTML = state.sourceHtml || '<p class="placeholder">No source content.</p>';
  requiredElement("translated").innerHTML = state.translatedHtml || '<p class="placeholder">Translation will appear here.</p>';
  loadMermaidIfNeeded();
}

function readInitialState(): WebviewState {
  const initialState = document.body.dataset.initialState;
  if (!initialState) {
    throw new Error("Missing initial preview state");
  }

  const binary = atob(initialState);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as WebviewState;
}

function loadMermaidIfNeeded(): void {
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

  const mermaidScriptUri = document.body.dataset.mermaidScriptUri;
  if (!mermaidScriptUri) {
    postLog("error", "mermaid script URI is missing");
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
    postLog("error", `mermaid script failed to load: ${mermaidScriptUri}`);
  };
  document.head.appendChild(script);
}

function renderMermaidDiagrams(): void {
  if (!window.mermaid) {
    return;
  }

  const diagrams = Array.from(document.querySelectorAll(".mermaid")).filter((node) => !node.hasAttribute("data-rendered"));
  if (diagrams.length === 0) {
    return;
  }

  const theme = document.body.classList.contains("vscode-dark") || document.body.classList.contains("vscode-high-contrast") ? "dark" : "default";
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
    node.setAttribute("data-rendered", "true");
    const id = `md-ai-translator-mermaid-${String(mermaidRenderId++)}`;
    void window.mermaid
      .render(id, source)
      .then((result) => {
        node.innerHTML = result.svg;
        result.bindFunctions?.(node);
      })
      .catch((error) => {
        const message = document.createElement("p");
        message.className = "mermaid-error-message";
        message.textContent = `Mermaid render failed: ${formatError(error)}`;
        const code = document.createElement("code");
        code.textContent = source;
        const pre = document.createElement("pre");
        pre.appendChild(code);
        node.classList.add("mermaid-error");
        node.replaceChildren(message, pre);
      });
  }
}

function renderFallback(error: unknown): void {
  setText("status", "Preview render failed. See Output: Markdown AI Translator.");
  requiredElement("status").className = "status error";
  requiredElement("source").innerHTML = '<p class="placeholder">Preview render failed.</p>';
  requiredElement("translated").innerHTML = `<p class="placeholder">${escapeHtml(formatError(error))}</p>`;
}

function setText(id: string, value: string): void {
  requiredElement(id).textContent = value;
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing webview element: ${id}`);
  }
  return element;
}

function postLog(level: "info" | "warn" | "error", message: string): void {
  try {
    vscode.postMessage({ type: "webviewLog", level, message });
  } catch {
    // Logging must never break preview rendering.
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
