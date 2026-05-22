# Markdown AI Translator

Markdown AI Translator is a VS Code extension for translating Markdown documents in a side-by-side preview. It keeps the source document on the left, renders the translated Markdown on the right, preserves protected Markdown blocks, renders Mermaid diagrams in the preview, and can export the translated Markdown text back to disk.

## Features

- Translate `.md` and `.markdown` files from the editor title button or Command Palette.
- Preview original and translated Markdown side by side.
- Render Mermaid fences (`mermaid` and `mmd`) as diagrams in the preview.
- Export the translated Markdown from the preview toolbar.
- Choose the target language from a Settings dropdown.
- Connect providers through guided commands instead of editing credentials in `settings.json`.
- Store API keys and OAuth tokens in VS Code SecretStorage.
- Use GitHub Copilot through GitHub browser device login.
- Use OpenAI-compatible providers through one registry-driven adapter.
- Preserve YAML frontmatter and fenced code blocks without sending them for translation.

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
6. Use the preview toolbar:
   - `Refresh`: rerun translation for the current document.
   - `Export`: save the translated Markdown text.
   - `Connect`: connect or switch the active provider.
   - `Model`: choose the provider model.
   - `Settings`: open extension settings.

Use `Markdown AI Translator: Select Provider Model` any time you want to change the model.

When the source document changes while a preview is open, the preview keeps the previous translation and shows a warning. Use `Refresh` to translate the updated document.

## Exporting translations

The `Export` button is enabled after a translation succeeds. It writes the raw translated Markdown, not the rendered preview HTML.

The default export location is:

- the source file directory for local `file:` documents;
- otherwise the first workspace folder;
- otherwise the current process directory.

The default export filename is `<source-name>.<language-suffix><source-extension>`. Examples:

- `README.md` translated to Simplified Chinese becomes `README.zh.md`.
- `README.md` translated to Traditional Chinese becomes `README.zh-TW.md`.
- `README.markdown` translated to English becomes `README.en.markdown`.

After saving, VS Code offers an `Open` action for the exported file.

## Chunking and Markdown preservation

Translation is chunked by character count, not by token count.

The splitter first converts the document into Markdown blocks:

- YAML frontmatter at the beginning of the file is marked non-translatable and copied back unchanged.
- Fenced code blocks using backticks or tildes are marked non-translatable and copied back unchanged.
- All other Markdown text is translatable.

Translatable blocks are accumulated into chunks up to `mdAiTranslator.request.maxChunkChars` characters. The default is `12000`, and the implementation enforces a minimum of `1000`.

If a translatable block is larger than the limit, it is split by line. If a single line is larger than the limit, that line is hard-split by character count.

Only non-empty translatable chunks are sent to the provider. Non-translatable chunks are pasted directly into the final output. The extension translates chunks sequentially with context such as `chunk 1 of 3`, preserves trailing newlines, and unwraps whole-response Markdown fences when a provider returns the entire chunk inside a Markdown code fence.

This strategy protects frontmatter and fenced blocks, but it does not currently perform token-aware splitting or semantic splitting by headings, paragraphs, lists, or tables.

## Settings

The Settings UI intentionally exposes only user-facing choices:

- `mdAiTranslator.targetLanguage`: target translation language dropdown.
- `mdAiTranslator.activeProvider`: active provider dropdown.

Credentials, endpoint/base URL values, selected models, and Azure API versions are managed by commands and kept out of the Settings UI. Request tuning remains available as hidden advanced `settings.json` values for large Markdown files. Existing `settings.json` values for older versions are still read for backward compatibility.

Default request tuning:

- `mdAiTranslator.request.maxChunkChars`: `12000`
- `mdAiTranslator.request.maxOutputTokens`: `16384`
- `mdAiTranslator.request.timeoutMs`: `120000`

`maxChunkChars` controls Markdown chunk size before translation. `timeoutMs` controls provider request timeouts. `maxOutputTokens` is passed to providers that support explicit output token limits, including Anthropic and GitHub Copilot.

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
