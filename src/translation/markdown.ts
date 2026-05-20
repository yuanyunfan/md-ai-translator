export interface MarkdownChunk {
  index: number;
  text: string;
  translatable: boolean;
}

interface Block {
  text: string;
  translatable: boolean;
}

interface Fence {
  marker: "`" | "~";
  length: number;
}

export function splitMarkdown(markdown: string, maxChunkChars: number): MarkdownChunk[] {
  const safeMax = Math.max(1000, maxChunkChars);
  const blocks = toBlocks(markdown);
  const chunks: Omit<MarkdownChunk, "index">[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) {
      chunks.push({ text: buffer, translatable: true });
      buffer = "";
    }
  };

  for (const block of blocks) {
    if (!block.translatable) {
      flush();
      chunks.push(block);
      continue;
    }

    if (block.text.length > safeMax) {
      flush();
      for (const part of splitLargeTextBlock(block.text, safeMax)) {
        chunks.push({ text: part, translatable: true });
      }
      continue;
    }

    if (buffer && buffer.length + block.text.length > safeMax) {
      flush();
    }
    buffer += block.text;
  }

  flush();

  return chunks
    .filter((chunk) => chunk.text.length > 0)
    .map((chunk, index) => ({ ...chunk, index }));
}

function toBlocks(markdown: string): Block[] {
  const lines = splitLinesKeepEnd(markdown);
  const blocks: Block[] = [];
  let i = 0;

  if (lines[0]?.trim() === "---") {
    const frontmatter: string[] = [lines[0]];
    i = 1;
    while (i < lines.length) {
      frontmatter.push(lines[i]);
      if (/^(---|\.\.\.)\s*$/.test(lines[i].trim())) {
        i += 1;
        break;
      }
      i += 1;
    }
    blocks.push({ text: frontmatter.join(""), translatable: false });
  }

  let textBuffer = "";
  const flushText = () => {
    if (textBuffer) {
      blocks.push({ text: textBuffer, translatable: true });
      textBuffer = "";
    }
  };

  while (i < lines.length) {
    const fence = parseFenceStart(lines[i]);
    if (fence) {
      flushText();
      const code: string[] = [lines[i]];
      i += 1;
      while (i < lines.length) {
        code.push(lines[i]);
        if (isFenceEnd(lines[i], fence)) {
          i += 1;
          break;
        }
        i += 1;
      }
      blocks.push({ text: code.join(""), translatable: false });
      continue;
    }

    textBuffer += lines[i];
    i += 1;
  }

  flushText();
  return blocks;
}

function splitLargeTextBlock(text: string, maxChunkChars: number): string[] {
  const lines = splitLinesKeepEnd(text);
  const parts: string[] = [];
  let buffer = "";

  for (const line of lines) {
    if (buffer && buffer.length + line.length > maxChunkChars) {
      parts.push(buffer);
      buffer = "";
    }

    if (line.length > maxChunkChars) {
      parts.push(...splitLongLine(line, maxChunkChars));
      continue;
    }

    buffer += line;
  }

  if (buffer) {
    parts.push(buffer);
  }

  return parts;
}

function splitLongLine(line: string, maxChunkChars: number): string[] {
  const parts: string[] = [];
  for (let start = 0; start < line.length; start += maxChunkChars) {
    parts.push(line.slice(start, start + maxChunkChars));
  }
  return parts;
}

function splitLinesKeepEnd(markdown: string): string[] {
  return markdown.match(/[^\n]*\n|[^\n]+/g) ?? [];
}

function parseFenceStart(line: string): Fence | undefined {
  const match = line.match(/^\s*(`{3,}|~{3,})/);
  if (!match) {
    return undefined;
  }
  const markerText = match[1];
  return {
    marker: markerText[0] as "`" | "~",
    length: markerText.length
  };
}

function isFenceEnd(line: string, fence: Fence): boolean {
  const escapedMarker = fence.marker === "`" ? "`" : "~";
  const pattern = new RegExp(`^\\s*${escapedMarker}{${fence.length},}\\s*$`);
  return pattern.test(line);
}
