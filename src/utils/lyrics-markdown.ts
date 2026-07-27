/**
 * Lyrics Markdown → HTML for in-app display.
 *
 * Supported subset: # / ## headings, **bold**, _italic_ / *italic* (as .info),
 * trailing \ hard breaks, paragraphs. Raw HTML is escaped.
 */

import { Marked } from "marked";

const lyricsMarked = new Marked();

lyricsMarked.use({
  gfm: false,
  breaks: false,
  pedantic: false,
  renderer: {
    em({ tokens }) {
      return `<em class="info">${this.parser.parseInline(tokens)}</em>`;
    },
    html({ text }) {
      return escapeHtml(text);
    },
    link({ tokens }) {
      return this.parser.parseInline(tokens);
    },
    image() {
      return "";
    },
    code({ text }) {
      return `<p>${escapeHtml(text)}</p>\n`;
    },
    codespan({ text }) {
      return escapeHtml(text);
    },
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Parse CallerBuddy lyrics Markdown into an HTML fragment for `.lyrics-content`.
 */
export function parseLyricsMarkdown(md: string): string {
  const source = md ?? "";
  const html = lyricsMarked.parse(source, { async: false }) as string;
  // Trailing \ on the last line of a paragraph is intentional in our files
  // (so new lines hard-break by default) but has no following line for marked
  // to turn into <br> — strip the leftover visible backslash.
  return html.replace(/\\<\/p>/g, "</p>").replace(/\\(?=\s*<\/)/g, "");
}

/** Default template for newly created lyrics. */
export function generateLyricsMarkdownTemplate(title: string, label: string): string {
  const t = title || "Untitled";
  const info = label ? `_(${label})_\n\n` : "";
  return `# ${t}\n${info}## Figure\nEnter lyrics here\\\n`;
}
