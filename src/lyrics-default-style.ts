/**
 * Lyric document typography tokens.
 *
 * One absolute root size; all other sizes are em ratios of that base so that
 * changing LYRICS_BODY_FONT_SIZE scales the entire lyric surface uniformly.
 *
 * Used by in-app lyrics CSS (song-play + lyrics-editor preview) and by the
 * HTML scraper when building an intermediate document before Markdown conversion.
 */

// ── Typography tokens ────────────────────────────────────────────────────────
export const LYRICS_UI_FONT_STACK =
  'Roboto, Arial, sans-serif';

// Absolute root for the lyric surface. Keep this in sync with any fallback styling
// used for plain-text lyrics in the player view.
export const LYRICS_BODY_FONT_SIZE = "13pt";

export const LYRICS_H1_SIZE = "1.25em"; // 13pt × 1.25  = 16.25pt
export const LYRICS_H2_SIZE = "1.125em"; // 13pt × 1.125 = 14.625pt
export const LYRICS_INFO_SIZE = "0.75em"; // 13pt × 0.75 = 9.75pt
// ────────────────────────────────────────────────────────────────────────────

export const DEFAULT_LYRICS_STYLE = [
  `  body { background: lightyellow; font-family: ${LYRICS_UI_FONT_STACK};`,
  `         font-size: ${LYRICS_BODY_FONT_SIZE}; line-height: 140%; color: black; margin: 0; }`,
  `  h1 { font-size: ${LYRICS_H1_SIZE}; display: inline; }`,
  `  .info { color: blue; font-size: ${LYRICS_INFO_SIZE}; font-weight: normal; }`,
  `  h2 { color: red; font-size: ${LYRICS_H2_SIZE}; font-weight: normal; margin: 0.6em 0 0; }`,
  "  p { margin: 0 0 0.4em; }",
].join("\n");
