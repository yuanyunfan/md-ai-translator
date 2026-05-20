import MarkdownIt from "markdown-it";

export class MarkdownRenderer {
  private readonly markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false
  });

  render(markdown: string): string {
    return this.markdown.render(markdown);
  }
}
