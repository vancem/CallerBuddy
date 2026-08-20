/**
 * Lyric document typography tokens.
 *
 * One absolute root size; all other sizes are em ratios of that base so that
 * changing LYRICS_BODY_FONT_SIZE scales the entire lyric surface uniformly.
 *
 * Used by in-app lyrics CSS (song-play + lyrics-editor preview).
 */

export const LYRICS_UI_FONT_STACK = "Roboto, Arial, sans-serif";

// Absolute root for the lyric surface. Keep this in sync with any fallback styling
// used for plain-text lyrics in the player view.
export const LYRICS_BODY_FONT_SIZE = "13pt";

export const LYRICS_H1_SIZE = "1.25em"; // 13pt × 1.25  = 16.25pt
export const LYRICS_H2_SIZE = "1.125em"; // 13pt × 1.125 = 14.625pt
export const LYRICS_INFO_SIZE = "0.75em"; // 13pt × 0.75 = 9.75pt
