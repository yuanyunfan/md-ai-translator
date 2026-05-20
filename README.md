# Markdown AI Translator

Markdown AI Translator is a VS Code extension that opens a side-by-side translation preview for Markdown documents.

## Features

- Opens a Markdown-only translation preview from the editor title button or Command Palette.
- Renders the original Markdown on the left and translated Markdown on the right.
- Supports OpenAI-compatible APIs, Azure OpenAI, Anthropic, and GitHub Copilot models exposed by VS Code.
- Stores API keys in VS Code SecretStorage instead of `settings.json`.
- Preserves YAML frontmatter and fenced code blocks during translation.

## Quick Start

1. Run `npm install`.
2. Run `npm run compile`.
3. Start the extension with the `Run Extension` debug profile in VS Code.
4. Open a `.md` file.
5. Run `Markdown AI Translator: Set AI Provider API Key`.
6. Click the globe button in the editor title or run `Markdown AI Translator: Open AI Translation Preview`.

## Settings

- `mdAiTranslator.targetLanguage`: target translation language.
- `mdAiTranslator.activeProvider`: `openai`, `azureOpenAI`, `anthropic`, or `githubCopilot`.
- `mdAiTranslator.githubCopilot.modelId`: selected GitHub Copilot language model ID.
- `mdAiTranslator.openai.baseUrl` and `mdAiTranslator.openai.model`.
- `mdAiTranslator.azureOpenAI.endpoint`, `deployment`, and `apiVersion`.
- `mdAiTranslator.anthropic.baseUrl` and `mdAiTranslator.anthropic.model`.
- `mdAiTranslator.request.timeoutMs`, `maxChunkChars`, and `maxOutputTokens`.

API keys are configured with commands:

- `Markdown AI Translator: Set AI Provider API Key`
- `Markdown AI Translator: Clear AI Provider API Key`
- `Markdown AI Translator: Select GitHub Copilot Model`

## Development

```bash
npm install
npm run compile
npm test
```
