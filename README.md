# Markdown AI Translator

Markdown AI Translator is a VS Code extension for translating Markdown documents in a side-by-side preview. It keeps the source document on the left, renders the translated Markdown on the right, and preserves YAML frontmatter and fenced code blocks.

## Features

- Translate `.md` and `.markdown` files from the editor title button or Command Palette.
- Preview original and translated Markdown side by side.
- Choose the target language from a Settings dropdown.
- Connect providers through guided commands instead of editing credentials in `settings.json`.
- Store API keys and OAuth tokens in VS Code SecretStorage.
- Use GitHub Copilot through GitHub browser device login.
- Use OpenAI-compatible providers through one registry-driven adapter.

## Providers

Built-in providers:

- OpenAI
- Azure OpenAI
- Anthropic
- GitHub Copilot
- OpenRouter
- DeepSeek
- Moonshot / Kimi
- xAI
- Groq
- Together AI
- Fireworks AI
- SiliconFlow
- Ollama
- LM Studio
- Custom OpenAI-compatible endpoint

OpenAI-compatible providers share the same chat completions adapter. Anthropic, Azure OpenAI, and GitHub Copilot use provider-specific request protocols.

## Usage

1. Open a Markdown document.
2. Run `Markdown AI Translator: Connect AI Provider`.
3. Choose a provider and complete authentication:
   - API-key providers prompt for an API key.
   - GitHub Copilot opens GitHub device login in the browser.
   - Ollama and LM Studio do not require credentials.
4. Select a model from the provider model picker.
5. Run `Markdown AI Translator: Open AI Translation Preview` or click the globe button in the editor title.

Use `Markdown AI Translator: Select Provider Model` any time you want to change the model.

## Settings

The Settings UI intentionally exposes only user-facing choices:

- `mdAiTranslator.targetLanguage`: target translation language dropdown.
- `mdAiTranslator.activeProvider`: active provider dropdown.

Credentials, endpoint/base URL values, selected models, and Azure API versions are managed by commands and kept out of the Settings UI. Request tuning remains available as hidden advanced `settings.json` values for large Markdown files. Existing `settings.json` values for older versions are still read for backward compatibility.

Default request tuning:

- `maxChunkChars`: `12000`
- `maxOutputTokens`: `16384`
- `timeoutMs`: `120000`

## GitHub Copilot

GitHub Copilot does not require an API key. Choose GitHub Copilot in `Markdown AI Translator: Connect AI Provider`, enter the device code shown by VS Code in GitHub's browser login page, then select a model returned by Copilot. Some models may require a Copilot plan or explicit model access in GitHub settings.

## Development

```bash
npm install
npm test
npm run build
```

Package locally:

```bash
npx @vscode/vsce package
```
