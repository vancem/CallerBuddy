/**
 * Small string helpers shared by import heuristics and lyrics rendering.
 */

/** Title Case, leaving short conjunctions/prepositions lowercase after the first word. */
export function toTitleCase(text: string): string {
  const minorWords = new Set([
    "a",
    "an",
    "the",
    "and",
    "but",
    "or",
    "for",
    "nor",
    "at",
    "by",
    "in",
    "of",
    "on",
    "to",
    "up",
    "with",
  ]);
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      if (i > 0 && minorWords.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** Escape `& < > "` for safe HTML text. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
