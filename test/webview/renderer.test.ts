import assert from "node:assert/strict";
import test from "node:test";
import { MarkdownRenderer } from "../../src/webview/renderer";

test("MarkdownRenderer renders Mermaid fences as diagram containers", () => {
  const renderer = new MarkdownRenderer();
  const html = renderer.render(["```mermaid", "graph TD", "  A --> B", "```"].join("\n"));

  assert.match(html, /<div class="mermaid">/);
  assert.match(html, /graph TD/);
  assert.doesNotMatch(html, /language-mermaid/);
});

test("MarkdownRenderer renders unlabeled Mermaid fences as diagram containers", () => {
  const renderer = new MarkdownRenderer();
  const html = renderer.render(["```", "flowchart TD", "  A --> B", "```"].join("\n"));

  assert.match(html, /<div class="mermaid">/);
  assert.match(html, /flowchart TD/);
});

test("MarkdownRenderer renders indented Mermaid code blocks as diagram containers", () => {
  const renderer = new MarkdownRenderer();
  const html = renderer.render(["    sequenceDiagram", "      A->>B: hello"].join("\n"));

  assert.match(html, /<div class="mermaid">/);
  assert.match(html, /sequenceDiagram/);
});

test("MarkdownRenderer keeps ordinary fenced code blocks as code", () => {
  const renderer = new MarkdownRenderer();
  const html = renderer.render(["```ts", "const value = 1;", "```"].join("\n"));

  assert.match(html, /<pre><code class="language-ts">/);
  assert.match(html, /const value = 1;/);
});
