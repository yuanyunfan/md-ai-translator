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
    this.markdown.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const language = token.info.trim().split(/\s+/)[0]?.toLowerCase();
      if (language === "mermaid" || language === "mmd") {
        return `<div class="mermaid">${this.markdown.utils.escapeHtml(token.content)}</div>\n`;
      }

      if (defaultFence) {
        return defaultFence(tokens, idx, options, env, self);
      }

      return `<pre><code>${this.markdown.utils.escapeHtml(token.content)}</code></pre>\n`;
    };
  }

  render(markdown: string): string {
    return this.markdown.render(markdown);
  }
}
