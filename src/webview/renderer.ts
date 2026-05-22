import MarkdownIt from "markdown-it";

export class MarkdownRenderer {
  private readonly markdown: MarkdownIt;

  constructor() {
    this.markdown = new MarkdownIt({
      html: false,
      linkify: true,
      typographer: false
    });

    const defaultFence = this.markdown.renderer.rules.fence;
    const defaultCodeBlock = this.markdown.renderer.rules.code_block;
    this.markdown.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const language = token.info.trim().split(/\s+/)[0]?.toLowerCase();
      if (isMermaidLanguage(language) || (isPlainTextLanguage(language) && looksLikeMermaid(token.content))) {
        return this.renderMermaid(token.content);
      }

      if (defaultFence) {
        return defaultFence(tokens, idx, options, env, self);
      }

      return `<pre><code>${this.markdown.utils.escapeHtml(token.content)}</code></pre>\n`;
    };

    this.markdown.renderer.rules.code_block = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if (looksLikeMermaid(token.content)) {
        return this.renderMermaid(token.content);
      }

      if (defaultCodeBlock) {
        return defaultCodeBlock(tokens, idx, options, env, self);
      }

      return `<pre><code>${this.markdown.utils.escapeHtml(token.content)}</code></pre>\n`;
    };
  }

  render(markdown: string): string {
    return this.markdown.render(markdown);
  }

  private renderMermaid(source: string): string {
    return `<div class="mermaid">${this.markdown.utils.escapeHtml(source)}</div>\n`;
  }
}

function isMermaidLanguage(language: string): boolean {
  return language === "mermaid" || language === "mmd";
}

function isPlainTextLanguage(language: string): boolean {
  return language === "" || language === "text" || language === "plain" || language === "plaintext";
}

function looksLikeMermaid(source: string): boolean {
  const firstMeaningfulLine = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("%%"));
  if (!firstMeaningfulLine) {
    return false;
  }

  return /^(architecture-beta|block-beta|c4context|c4container|c4component|c4dynamic|classdiagram|erdiagram|flowchart|gantt|gitgraph|graph|journey|mindmap|packet-beta|pie|quadrantchart|requirementdiagram|sankey-beta|sequencediagram|statediagram(?:-v2)?|timeline|xychart-beta)\b/i.test(
    firstMeaningfulLine
  );
}
