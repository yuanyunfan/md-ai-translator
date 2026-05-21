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
- `mdAiTranslator.githubCopilot.modelId`: GitHub Copilot model dropdown. Prefer full `vendor/family` values such as `copilot/gpt-4o` or `copilotcli/gpt-5.5`; legacy ids such as `gpt-5.5` are still accepted.
- `mdAiTranslator.openai.baseUrl` and `mdAiTranslator.openai.model`.
- `mdAiTranslator.azureOpenAI.endpoint`, `deployment`, and `apiVersion`.
- `mdAiTranslator.anthropic.baseUrl` and `mdAiTranslator.anthropic.model`.
- `mdAiTranslator.request.timeoutMs`, `maxChunkChars`, and `maxOutputTokens`.

API keys are configured with commands:

- `Markdown AI Translator: Set AI Provider API Key`
- `Markdown AI Translator: Clear AI Provider API Key`
- `Markdown AI Translator: Connect GitHub Copilot`
- `Markdown AI Translator: Select GitHub Copilot Model`

GitHub Copilot does not require an API key in this extension. Use `Markdown AI Translator: Connect GitHub Copilot` to open the GitHub browser sign-in flow, then select one of the Copilot language models exposed by VS Code. If you choose GitHub Copilot from the API key provider list, the extension opens the same connection flow instead of asking for a key.

Some Copilot models are exposed by VS Code as `copilot/...`, while newer Copilot CLI chat models can appear as `copilotcli/...`. The extension stores the model family after you pick a model and queries VS Code by `family`, because exact model IDs are internal and can change between VS Code/Copilot versions.

When installing or updating a local VSIX, reload the active VS Code window before retrying translation. VS Code keeps already activated extension code in the running extension host until the window reloads.

If Copilot translation fails, open `Output: Markdown AI Translator` to see the selected model, access state, and provider error.

## Development

```bash
npm install
npm run compile
npm test
```
