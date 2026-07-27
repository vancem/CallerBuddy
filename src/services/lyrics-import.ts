/**
 * Lean lyrics import: flatten source → classify lines → CallerBuddy Markdown.
 *
 * Prefers keeping text (easy to edit) over perfect structure.
 */

import { toTitleCase } from "./html-scraper.js";

const SECTION_KEYWORD_RE =
  /^(opener|figure|breaks?|middle\s*break|closer?|tag|verse|bridge)\b/i;

const COMBINED_SECTION_RE =
  /^(opener\s*[,/&]\s*(break\s*[,/&]\s*)*(closer?)?|opener\s*[,/&]\s*closer?)/i;

/** Longest-first so multi-word calls match before short ones. */
const CALL_NAMES = [
  "right and left thru",
  "chain down the line",
  "double pass thru",
  "touch a quarter",
  "sweep a quarter",
  "california twirl",
  "split circulate",
  "wheel and deal",
  "pass the ocean",
  "ladies chain",
  "spin the top",
  "partner trade",
  "tag the line",
  "courtesy turn",
  "bend the line",
  "box the gnat",
  "star right",
  "men sashay",
  "square thru",
  "eight chain",
  "lead right",
  "scoot back",
  "swing thru",
  "do sa do",
  "flutterwheel",
  "ferris wheel",
  "slide thru",
  "star thru",
  "veer left",
  "allemande",
  "circulate",
  "cloverleaf",
  "promenade",
  "dive thru",
  "half tag",
  "cast off",
  "reverse",
  "recycle",
  "trade by",
  "ladies",
  "dosado",
  "extend",
  "circle",
  "weave",
  "heads",
  "girls",
  "hinge",
  "right",
  "swing",
  "trade",
  "left",
  "star",
  "boys",
  "ends",
  "zoom",
  "men",
  "run",
];

const CALL_REGEX = new RegExp(
  `\\b(${CALL_NAMES.map((n) =>
    n
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+and\s+/gi, "\\s+(?:and|&)\\s+"),
  ).join("|")})\\b`,
  "gi",
);

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "tr",
  "li",
  "section",
  "article",
  "blockquote",
  "pre",
  "br",
]);

export interface ImportLyricsResult {
  markdown: string;
  /** True when structure looked weak and we kept a fuller text dump. */
  lowConfidence: boolean;
}

/** Convert producer HTML/HTM into CallerBuddy lyrics Markdown. */
export function importHtmlToMarkdown(
  rawHtml: string,
  label: string,
  title: string,
): ImportLyricsResult {
  const lines = flattenHtmlToLines(rawHtml);
  return linesToMarkdown(lines, label, title);
}

/** Convert plain text (TXT file or paste) into CallerBuddy lyrics Markdown. */
export function importTextToMarkdown(
  rawText: string,
  label: string,
  title: string,
): ImportLyricsResult {
  const lines = rawText.split(/\r?\n/).map((l) => sanitizeText(l).trim()).filter(Boolean);
  return linesToMarkdown(lines, label, title);
}

// ---------------------------------------------------------------------------
// Flatten HTML → ordered lines (keeps bare text + FONT.lyrics)
// ---------------------------------------------------------------------------

function flattenHtmlToLines(rawHtml: string): string[] {
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  const body = doc.body;
  if (!body) return [];

  stripNoise(body);

  const lines: string[] = [];
  let buf = "";

  const flush = () => {
    const t = collapseWs(buf);
    if (t) lines.push(t);
    buf = "";
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      buf += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === "br") {
      flush();
      return;
    }

    if (BLOCK_TAGS.has(tag) || el.classList.contains("hdr")) {
      flush();
      for (const child of Array.from(el.childNodes)) walk(child);
      flush();
      return;
    }

    for (const child of Array.from(el.childNodes)) walk(child);
  };

  walk(body);
  flush();
  return lines;
}

function stripNoise(body: Element): void {
  for (const sel of ["img", "object", "embed", "script", "style", "link"]) {
    for (const el of Array.from(body.querySelectorAll(sel))) el.remove();
  }
  for (const el of Array.from(body.querySelectorAll("[style]"))) {
    if ((el as HTMLElement).style?.display === "none") el.remove();
  }
}

// ---------------------------------------------------------------------------
// Classify lines → Markdown
// ---------------------------------------------------------------------------

function linesToMarkdown(
  lines: string[],
  label: string,
  title: string,
): ImportLyricsResult {
  type Seg =
    | { kind: "header"; text: string }
    | { kind: "body"; text: string };

  const segs: Seg[] = [];
  let seenHeader = false;
  let sourceAfterHeaderChars = 0;
  let bodyChars = 0;

  for (const raw of lines) {
    const line = collapseWs(raw);
    if (!line) continue;

    if (isSectionHeaderLine(line)) {
      seenHeader = true;
      const { header, body } = splitHeaderFromBody(line);
      segs.push({ kind: "header", text: normalizeHeader(header) });
      if (body) {
        segs.push({ kind: "body", text: body });
        bodyChars += body.length;
        sourceAfterHeaderChars += body.length;
      }
      continue;
    }

    if (!seenHeader) continue; // drop title/label/artist chrome

    sourceAfterHeaderChars += line.length;
    segs.push({ kind: "body", text: line });
    bodyChars += line.length;
  }

  // No headers → keep everything (better than empty)
  if (!seenHeader) {
    for (const raw of lines) {
      const line = collapseWs(raw);
      if (line) segs.push({ kind: "body", text: line });
    }
    bodyChars = segs.reduce((n, s) => n + s.text.length, 0);
    sourceAfterHeaderChars = bodyChars;
  }

  let lowConfidence = false;
  if (
    seenHeader &&
    sourceAfterHeaderChars > 0 &&
    bodyChars / sourceAfterHeaderChars < 0.3
  ) {
    lowConfidence = true;
  }
  // Also treat "headers only" as low confidence
  if (seenHeader && bodyChars === 0 && sourceAfterHeaderChars === 0) {
    // Flatten kept only header lines — recover by not skipping chrome? Already failed.
    lowConfidence = true;
  }

  const md = emitMarkdown(title, label, segs);
  return { markdown: md, lowConfidence };
}

function emitMarkdown(
  title: string,
  label: string,
  segs: Array<{ kind: "header" | "body"; text: string }>,
): string {
  const parts: string[] = [];
  parts.push(`# ${title || "Untitled"}`);
  if (label) parts.push(`_(${label})_`);

  let bodyRun: string[] = [];
  const flushBody = () => {
    if (!bodyRun.length) return;
    parts.push(bodyRun.map((l) => `${emphasizeCalls(l)}\\`).join("\n"));
    bodyRun = [];
  };

  for (const seg of segs) {
    if (seg.kind === "header") {
      flushBody();
      parts.push(`## ${seg.text}`);
    } else {
      bodyRun.push(seg.text);
    }
  }
  flushBody();

  return parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function isSectionHeaderLine(text: string): boolean {
  if (text.length >= 120) return false;
  const t = text.trim().replace(/^[(\s]+/, "");
  return SECTION_KEYWORD_RE.test(t) || COMBINED_SECTION_RE.test(t);
}

function splitHeaderFromBody(text: string): { header: string; body: string } {
  const trimmed = text.trim();
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx >= 0) {
    const before = trimmed.slice(0, colonIdx).replace(/[()]/g, "").trim();
    const after = trimmed.slice(colonIdx + 1).replace(/^[-–\s]+/, "").trim();
    if (isSectionHeaderLine(before) && after) {
      return { header: before, body: after };
    }
  }
  let cleaned = trimmed;
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return { header: cleaned, body: "" };
}

function normalizeHeader(text: string): string {
  let t = collapseWs(text);
  if (t === t.toUpperCase() && t.length > 2) t = toTitleCase(t);
  const lowered = t.replace(/[A-Z]{2,}/g, (m) => m.toLowerCase());
  if (lowered !== t) {
    t = lowered.replace(/^([^a-zA-Z]*)([a-z])/, (_, pre, ch) => pre + ch.toUpperCase());
  }
  // Drop trailing colon from "Opener:"
  return t.replace(/:\s*$/, "");
}

function emphasizeCalls(line: string): string {
  let result = normalizeAllCaps(line);
  CALL_REGEX.lastIndex = 0;
  result = result.replace(CALL_REGEX, (m) => `**${m}**`);
  return result;
}

function normalizeAllCaps(line: string): string {
  let result = line.replace(/[A-Z]{2,}/g, (m) => m.toLowerCase());
  if (result === line) return line;
  result = result.replace(/^([^a-zA-Z]*)([a-z])/, (_, pre, ch) => pre + ch.toUpperCase());
  result = result.replace(/\bi\b/g, "I");
  return result;
}

function sanitizeText(text: string): string {
  return text
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2026]/g, "...")
    .replace(/\uFFFD/g, "")
    // eslint-disable-next-line no-control-regex -- strip non-printable
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
}

function collapseWs(text: string): string {
  return text.replace(/[\s\u00a0]+/g, " ").trim();
}
