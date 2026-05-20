import assert from "node:assert/strict";
import test from "node:test";
import { splitMarkdown } from "../../src/translation/markdown";
import { translateMarkdownDocument } from "../../src/translation/translator";
import type { AiTranslationProvider } from "../../src/providers/types";

test("splitMarkdown preserves frontmatter and fenced code blocks", () => {
  const markdown = [
    "---",
    "title: Demo",
    "---",
    "",
    "# Hello",
    "",
    "This should translate.",
    "",
    "```ts",
    "const language = 'TypeScript';",
    "```",
    "",
    "Final paragraph."
  ].join("\n");

  const chunks = splitMarkdown(markdown, 1000);
  assert.equal(chunks[0].translatable, false);
  assert.match(chunks[0].text, /title: Demo/);
  assert.ok(chunks.some((chunk) => !chunk.translatable && chunk.text.includes("const language")));
  assert.ok(chunks.some((chunk) => chunk.translatable && chunk.text.includes("This should translate.")));
});

test("splitMarkdown does not split inside a long fenced code block", () => {
  const markdown = ["# Title", "", "```", "x".repeat(2500), "```"].join("\n");
  const chunks = splitMarkdown(markdown, 1000);
  const codeChunk = chunks.find((chunk) => chunk.text.includes("x".repeat(100)));
  assert.ok(codeChunk);
  assert.equal(codeChunk.translatable, false);
});

test("translateMarkdownDocument preserves non-translatable chunks", async () => {
  const provider: AiTranslationProvider = {
    id: "openai",
    label: "Mock",
    async translateChunk(request) {
      return `[${request.targetLanguage}]\n${request.markdown.toUpperCase()}`;
    }
  };

  const markdown = ["---", "title: Demo", "---", "", "# Hello", "", "```js", "console.log('hello');", "```"].join("\n");
  const translated = await translateMarkdownDocument({
    markdown,
    targetLanguage: "Spanish",
    provider,
    maxChunkChars: 1000
  });

  assert.match(translated, /title: Demo/);
  assert.match(translated, /\[Spanish\]/);
  assert.match(translated, /# HELLO/);
  assert.match(translated, /console\.log\('hello'\);/);
});
