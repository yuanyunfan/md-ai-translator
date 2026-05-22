import assert from "node:assert/strict";
import test from "node:test";
import { getWebviewHtml, type WebviewState } from "../../src/webview/html";

test("getWebviewHtml embeds initial state without inline JSON literals", () => {
  const state: WebviewState = {
    sourceHtml: "<h1>Source</h1>",
    translatedHtml: "",
    statusText: "Ready",
    statusKind: "idle",
    providerLabel: "Mock",
    targetLanguage: "Simplified Chinese",
    documentName: "demo.md"
  };

  const html = getWebviewHtml(state, {
    cspSource: "vscode-webview://example",
    mermaidScriptUri: "vscode-webview://example/dist/mermaid.min.js"
  });

  assert.match(html, /const initialStateBase64 = "[A-Za-z0-9+/=]+"/);
  assert.doesNotMatch(html, /const initialState = \{/);
  assert.match(html, /webview init failed/);
  assert.match(html, /mermaidScriptUri = "vscode-webview:\/\/example\/dist\/mermaid\.min\.js"/);
});
