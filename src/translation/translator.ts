import type { AiTranslationProvider } from "../providers/types";
import { splitMarkdown } from "./markdown";

export interface TranslateDocumentOptions {
  markdown: string;
  targetLanguage: string;
  provider: AiTranslationProvider;
  maxChunkChars: number;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}

export async function translateMarkdownDocument(options: TranslateDocumentOptions): Promise<string> {
  const chunks = splitMarkdown(options.markdown, options.maxChunkChars);
  const translatableChunks = chunks.filter((chunk) => chunk.translatable && chunk.text.trim().length > 0);
  let completed = 0;
  let output = "";

  for (const chunk of chunks) {
    if (!chunk.translatable || chunk.text.trim().length === 0) {
      output += chunk.text;
      continue;
    }

    const translated = await options.provider.translateChunk({
      markdown: chunk.text,
      targetLanguage: options.targetLanguage,
      context: `chunk ${completed + 1} of ${translatableChunks.length}`,
      signal: options.signal
    });
    output += alignTrailingNewline(chunk.text, translated);
    completed += 1;
    options.onProgress?.(completed, translatableChunks.length);
  }

  return output;
}

function alignTrailingNewline(original: string, translated: string): string {
  if (original.endsWith("\n") && !translated.endsWith("\n")) {
    return `${translated}\n`;
  }
  return translated;
}
