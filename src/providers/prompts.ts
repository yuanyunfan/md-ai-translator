export function translationSystemPrompt(): string {
  return [
    "You are a precise technical documentation translator.",
    "Translate Markdown to the requested target language.",
    "Preserve Markdown structure, heading levels, lists, tables, links, link targets, inline code, and formatting.",
    "Do not translate fenced code block contents, YAML frontmatter, URLs, file paths, command names, environment variable names, API identifiers, or placeholders.",
    "Return only the translated Markdown with no commentary."
  ].join(" ");
}

export function translationUserPrompt(markdown: string, targetLanguage: string, context: string): string {
  return [
    `Target language: ${targetLanguage}`,
    `Document context: ${context}`,
    "",
    "Translate this Markdown chunk and return only Markdown:",
    "",
    markdown
  ].join("\n");
}
