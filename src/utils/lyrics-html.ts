/**
 * Shared helpers for extracting and reassembling standalone HTML lyrics documents.
 *
 * Lyrics files are full HTML documents (<html>, <head>, <body>). These functions
 * decompose them into style/body parts for editing and reassemble them for saving.
 */

import { DEFAULT_LYRICS_STYLE } from "../lyrics-default-style.js";

/** Extract the contents of the first <style> block, or return the default lyrics style. */
export function extractStyleBlock(raw: string): string {
  const m = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return m?.[1] ?? DEFAULT_LYRICS_STYLE;
}

/** Extract the contents of the <body> tag, or return the raw string if no body tag. */
export function extractBodyContent(raw: string): string {
  const m = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m?.[1] ?? raw;
}

/** Rewrite `body` selectors to `.lyrics-content` for embedding inside a div. */
export function rewriteBodySelectors(cssText: string): string {
  return cssText.replace(/\bbody\b/g, ".lyrics-content");
}

/** Reassemble a full HTML document from body content, CSS, and title. */
export function wrapLyricsHtml(
  bodyContent: string,
  cssText: string,
  title: string,
): string {
  return [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    `<title>${title}</title>`,
    "<style>",
    cssText,
    "</style>",
    "</head>",
    "<body>",
    bodyContent,
    "</body>",
    "</html>",
  ].join("\n");
}
