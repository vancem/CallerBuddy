/**
 * Lyrics text filter and HTML charset decoding for import/paste.
 *
 * CallerBuddy stores and renders UTF-8 Markdown (Unicode is fine).
 * Producer HTML is often windows-1252; decode bytes with the declared charset
 * before scraping. {@link filterLyricsText} is the shared post-decode pass
 * (newlines, controls, light cleanup) used by HTML import and paste.
 * {@link plainTextToMarkdownHardBreaks} also bolds calls and escapes leading `#`/`*`.
 */

import { emphasizeCallsAsMarkdown } from "./lyrics-call-bold.js";

/** Map U+0080–U+009F to Windows-1252 characters (recovery if bytes were kept as C1). */
const WIN1252_C1: Record<number, string> = {
  0x80: "\u20ac",
  0x82: "\u201a",
  0x83: "\u0192",
  0x84: "\u201e",
  0x85: "\u2026",
  0x86: "\u2020",
  0x87: "\u2021",
  0x88: "\u02c6",
  0x89: "\u2030",
  0x8a: "\u0160",
  0x8b: "\u2039",
  0x8c: "\u0152",
  0x8e: "\u017d",
  0x91: "\u2018",
  0x92: "\u2019",
  0x93: "\u201c",
  0x94: "\u201d",
  0x95: "\u2022",
  0x96: "\u2013",
  0x97: "\u2014",
  0x98: "\u02dc",
  0x99: "\u2122",
  0x9a: "\u0161",
  0x9b: "\u203a",
  0x9c: "\u0153",
  0x9e: "\u017e",
  0x9f: "\u0178",
};

const CHARSET_ALIASES: Record<string, string> = {
  "utf-8": "utf-8",
  utf8: "utf-8",
  "utf-16": "utf-16",
  "utf-16le": "utf-16le",
  "utf-16be": "utf-16be",
  "windows-1252": "windows-1252",
  cp1252: "windows-1252",
  "iso-8859-1": "iso-8859-1",
  "iso-8859-15": "iso-8859-15",
  latin1: "iso-8859-1",
  "us-ascii": "utf-8",
  ascii: "utf-8",
};

/**
 * Shared filter for lyrics text after decoding (HTML scrape, TXT, paste).
 * Preserves Unicode; normalizes newlines; strips controls; recovers C1 bytes.
 */
export function filterLyricsText(text: string): string {
  let s = text ?? "";

  // Legacy C1 controls → proper Unicode (windows-1252 semantics)
  s = s.replace(/[\u0080-\u009F]/g, (ch) => {
    const cp = ch.codePointAt(0)!;
    return WIN1252_C1[cp] ?? "";
  });

  // Drop other C0 controls except TAB / LF / CR; drop DEL and replacement char
  // eslint-disable-next-line no-control-regex -- intentional control strip
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g, "");

  // NBSP → normal space (layout noise in cue sheets)
  s = s.replace(/\u00a0/g, " ");

  // Normalize newlines to LF (significant for paste → Markdown hard breaks)
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  return s;
}

/**
 * Escape `#` / `*` at the start of a line (after optional indent) so Markdown
 * does not treat the line as a heading or list.
 */
export function escapeMarkdownLineStart(line: string): string {
  return line.replace(/^([ \t]*)([#*]+)/, (_m, ws: string, marks: string) => {
    return ws + [...marks].map((ch) => `\\${ch}`).join("");
  });
}

/**
 * If a line begins with a section title — Open… / Close… / Figure / Tag /
 * Middle Break (and is not already a Markdown ATX heading), prefix `## `.
 * "Open"/"Close" match any word starting with those letters (Opener, Closer, …).
 * Leaves existing `## …` lines alone. Avoids promoting the call "Tag the line".
 */
export function promoteSectionHeaderLine(line: string): string | null {
  const m = line.match(
    /^([ \t]*)(#{1,6}[ \t]+)?(Middle\s+Break|Figure|Tag|Open\w*|Close\w*)(.*)$/i,
  );
  if (!m) return null;
  const ws = m[1] ?? "";
  const existingHashes = m[2];
  const word = m[3] ?? "";
  const rest = m[4] ?? "";
  // Don't treat "Tag the line" (call) as a section header
  if (/^tag$/i.test(word) && /^\s+the\b/i.test(rest)) return null;
  if (existingHashes) return line;
  // Normalize "Middle Break" spacing in the heading text
  const title = /^middle\s+break$/i.test(word) ? "Middle Break" : word;
  return `${ws}## ${title}${rest}`;
}

/**
 * Body-line conversion shared by paste and import: promote section titles,
 * escape MD starters, bold calls, trailing hard-break `\`.
 */
export function formatLyricsBodyLine(line: string): string {
  const promoted = promoteSectionHeaderLine(line);
  if (promoted != null) {
    // Headers are block titles — no trailing `\`, and do not escape the `##`
    return promoted;
  }
  const escaped = escapeMarkdownLineStart(line);
  const bolded = emphasizeCallsAsMarkdown(escaped);
  return bolded.endsWith("\\") ? bolded : `${bolded}\\`;
}

/**
 * Turn filtered plain text into Markdown body lines with trailing `\`,
 * escaping leading `#`/`*`, and bolding square-dance call names.
 * Blank lines become paragraph breaks (empty line, no backslash).
 */
export function plainTextToMarkdownHardBreaks(text: string): string {
  const filtered = filterLyricsText(text);
  const lines = filtered.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.replace(/[ \t]+$/g, "");
    if (trimmed === "") {
      out.push("");
      continue;
    }
    out.push(formatLyricsBodyLine(trimmed));
  }
  // Trim trailing blank lines
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n") + (out.length ? "\n" : "");
}

/**
 * Decode HTML (or similar) bytes using BOM / meta charset / UTF-8-or-1252 guess.
 * Cue sheets often omit charset and use windows-1252 bytes (e.g. 0x92 for ’).
 */
export function decodeHtmlBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }

  const head = latin1Preview(bytes, 4096);
  const charset = sniffCharset(head) ?? detectUtf8OrWindows1252(bytes);
  return decodeWithCharset(bytes, charset);
}

function latin1Preview(bytes: Uint8Array, max: number): string {
  const n = Math.min(bytes.length, max);
  let s = "";
  for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

function sniffCharset(head: string): string | null {
  const meta =
    head.match(/charset\s*=\s*["']?\s*([a-z0-9_\-]+)/i) ??
    head.match(/content\s*=\s*["'][^"']*charset\s*=\s*([a-z0-9_\-]+)/i);
  if (!meta?.[1]) return null;
  const key = meta[1].toLowerCase();
  return CHARSET_ALIASES[key] ?? null;
}

/** Prefer UTF-8 when valid; otherwise assume legacy Windows cue-sheet encoding. */
function detectUtf8OrWindows1252(bytes: Uint8Array): string {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "utf-8";
  } catch {
    return "windows-1252";
  }
}

function decodeWithCharset(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}
