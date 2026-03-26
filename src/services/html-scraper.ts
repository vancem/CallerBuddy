/**
 * HTML lyric scraper and normalizer for Song Onboarding.
 *
 * Takes raw HTML (from diverse producer formats: Word export, LibreOffice,
 * cuesheet2 CSS, hand-crafted) and produces a normalized HTML document
 * matching the CallerBuddy lyrics format (see demoMusic/Maple Leaf Rag.html).
 *
 * Also provides TXT fallback parsing when no HTML is available.
 */

import { DEFAULT_LYRICS_STYLE } from "../lyrics-default-style.js";

const SECTION_KEYWORD_RE =
  /^(opener|figure|breaks?|middle\s*break|closer?|tag|verse|bridge)\b/i;

const COMBINED_SECTION_RE =
  /^(opener\s*[,\/&]\s*(break\s*[,\/&]\s*)*(closer?)?|opener\s*[,\/&]\s*closer?)/i;

/**
 * Square dance call names (from calls.txt).
 * Sorted longest-first so the compiled regex prefers longer matches.
 */
const CALL_NAMES: string[] = [
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

const CALL_REGEX = buildCallRegex(CALL_NAMES);

interface TextBlock {
  type: "header" | "text";
  content: string;
}

/**
 * Scrape raw HTML lyrics and produce normalized CallerBuddy HTML.
 * The label and title are used to generate the header line:
 * `<p><h1>title</h1>&nbsp;<span class="info">label</span></p>` (`.info` is a sibling of `h1`, not inside it).
 * The body content comes from parsing the source HTML.
 */
export function scrapeAndNormalizeLyrics(
  rawHtml: string,
  label: string,
  title: string,
): string {
  const blocks = extractBlocks(rawHtml);
  postProcessBlocks(blocks);
  const bodyHtml = blocksToHtml(blocks);
  return wrapDocument(title, label, bodyHtml);
}

/** Parse a plain-text lyrics file into normalized CallerBuddy HTML. */
export function scrapeTxtLyrics(
  rawText: string,
  label: string,
  title: string,
): string {
  const blocks = extractBlocksFromText(rawText);
  postProcessBlocks(blocks);
  const bodyHtml = blocksToHtml(blocks);
  return wrapDocument(title, label, bodyHtml);
}

// ---------------------------------------------------------------------------
// DOM-based HTML extraction
// ---------------------------------------------------------------------------

function extractBlocks(rawHtml: string): TextBlock[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, "text/html");
  const body = doc.body;
  if (!body) return [];

  stripNoiseElements(body);

  const blocks: TextBlock[] = [];
  let foundFirstHeader = false;

  walkChildren(body, (node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const text = collapseWhitespace(sanitizeText(el.textContent ?? ""));
      if (!text) return;

      if (isSectionHeader(el, text)) {
        foundFirstHeader = true;
        const { header, body } = splitHeaderFromBody(text);
        blocks.push({ type: "header", content: normalizeHeaderText(header) });
        if (body) {
          blocks.push({ type: "text", content: body });
        }
      } else if (foundFirstHeader) {
        const lines = extractLinesFromElement(el);
        if (lines.length > 0) {
          const content = lines.join("<br>\n");
          const last = blocks[blocks.length - 1];
          if (last && last.type === "text") {
            last.content += "<br>\n" + content;
          } else {
            blocks.push({ type: "text", content });
          }
        }
      }
    }
  });

  // If no section headers were found, include all text as one block
  if (!foundFirstHeader) {
    const allLines = extractLinesFromElement(body);
    if (allLines.length > 0) {
      blocks.push({ type: "text", content: allLines.join("<br>\n") });
    }
  }

  return blocks;
}

function stripNoiseElements(body: Element): void {
  const removeSelectors = [
    "img", "object", "embed", "script", "style", "link",
    "o\\:p", "o\\:DocumentProperties",
  ];

  for (const sel of removeSelectors) {
    try {
      for (const el of Array.from(body.querySelectorAll(sel))) {
        el.remove();
      }
    } catch {
      // Some selectors like o:p may not parse; handle via tagName
    }
  }

  // Remove Office namespace elements by tagName
  const removeByTag = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag.startsWith("o:") || tag.startsWith("w:")) {
        child.remove();
      } else {
        removeByTag(child);
      }
    }
  };
  removeByTag(body);

  // Remove elements with display:none
  for (const el of Array.from(body.querySelectorAll("[style]"))) {
    const style = (el as HTMLElement).style;
    if (style.display === "none") el.remove();
  }

  // Remove footer sections
  for (const el of Array.from(body.querySelectorAll('[title="footer"]'))) {
    el.remove();
  }
}

function walkChildren(
  parent: Node,
  callback: (node: Node) => void,
): void {
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (isBlockElement(tag)) {
        // Container blocks (div, section, etc.) that hold other blocks:
        // recurse into them instead of treating as a single unit.
        if (containsBlockChildren(el)) {
          walkChildren(child, callback);
        } else {
          callback(child);
        }
      } else {
        walkChildren(child, callback);
      }
    }
  }
}

function containsBlockChildren(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    if (isBlockElement(child.tagName.toLowerCase())) return true;
  }
  return false;
}

const BLOCK_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "tr", "section", "article", "header", "main",
  "blockquote", "pre", "li", "ul", "ol", "dl", "dt", "dd",
]);

function isBlockElement(tagName: string): boolean {
  return BLOCK_TAGS.has(tagName.toLowerCase());
}

function isSectionHeader(el: Element, text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Class-based detection (cuesheet2 family)
  if (el.classList.contains("hdr")) return true;
  if (el.querySelector(".hdr")) return true;

  // Check if it's a heading tag with section keywords
  const tag = el.tagName.toLowerCase();
  if ((tag === "h1" || tag === "h2") && matchesSectionKeyword(trimmed)) {
    return true;
  }

  // Underlined text with section keywords
  if (hasUnderline(el) && matchesSectionKeyword(trimmed)) {
    return true;
  }

  // Red/colored bold text with section keywords (COY / LibreOffice style)
  if (hasRedColor(el) && isBold(el) && matchesSectionKeyword(trimmed)) {
    return true;
  }

  // Plain text matching section keyword at start of a short block
  if (trimmed.length < 120 && matchesSectionKeyword(trimmed)) {
    return true;
  }

  return false;
}

function matchesSectionKeyword(text: string): boolean {
  // Strip leading parens/punctuation â€” producers often wrap keywords: "(Opener):", "(Figure):"
  const t = text.trim().replace(/^[(\s]+/, "");
  return SECTION_KEYWORD_RE.test(t) || COMBINED_SECTION_RE.test(t);
}

/**
 * Split text that starts with a section keyword into header + body portions.
 * Uses `:` as the primary separator; if no colon, the whole text is header.
 * Example: "(Opener, Break): CIRCLE LEFT" â†’ header "Opener, Break", body "CIRCLE LEFT"
 */
function splitHeaderFromBody(text: string): { header: string; body: string } {
  const trimmed = text.trim();

  const colonIdx = trimmed.indexOf(":");
  if (colonIdx >= 0) {
    const before = trimmed.substring(0, colonIdx).replace(/[()]/g, "").trim();
    const after = trimmed.substring(colonIdx + 1).replace(/^[â€“\-\s]+/, "").trim();
    if (matchesSectionKeyword(before) && after.length > 0) {
      return { header: before, body: after };
    }
  }

  // No colon â€” strip wrapping parens if the text is fully enclosed: "(Opener)" â†’ "Opener"
  let cleaned = trimmed;
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return { header: cleaned, body: "" };
}

function hasUnderline(el: Element): boolean {
  if (el.tagName.toLowerCase() === "u") return true;
  if (el.querySelector("u")) return true;
  const style = (el as HTMLElement).style;
  if (style?.textDecoration?.includes("underline")) return true;
  const spanU = el.querySelector('[style*="underline"]');
  if (spanU) return true;
  return false;
}

function hasRedColor(el: Element): boolean {
  const style = (el as HTMLElement).style;
  const color = style?.color?.toLowerCase() ?? "";
  if (color === "red" || color === "#ff0000" || color === "#cc3300") return true;
  const fontEl = el.querySelector('font[color]');
  if (fontEl) {
    const fc = fontEl.getAttribute("color")?.toLowerCase() ?? "";
    if (fc === "red" || fc === "#ff0000" || fc === "#cc3300" || fc === "#990000") {
      return true;
    }
  }
  return false;
}

function isBold(el: Element): boolean {
  if (el.tagName.toLowerCase() === "b" || el.tagName.toLowerCase() === "strong") return true;
  if (el.querySelector("b, strong")) return true;
  const style = (el as HTMLElement).style;
  if (style?.fontWeight === "bold" || parseInt(style?.fontWeight ?? "") >= 700) return true;
  return false;
}

/** Extract visible text lines from an element, preserving <br> breaks. */
function extractLinesFromElement(el: Element): string[] {
  const lines: string[] = [];
  let current = "";

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = sanitizeText(node.textContent ?? "");
      // Skip MSO empty-para markers
      if (text.trim() === "\u00a0" || text.trim() === "") return;
      current += text;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName.toLowerCase();

      if (tag === "br") {
        const line = collapseSpacedChars(collapseWhitespace(current));
        if (line) lines.push(line);
        current = "";
        return;
      }

      if (tag === "img" || tag === "object" || tag === "embed") return;
      if (tag === "style" || tag === "script") return;

      // Skip MSO conditional comments content
      const className = (node as Element).className;
      if (typeof className === "string" && className.includes("MsoNormal")) {
        // Still process children, these are just styled paragraphs
      }

      for (const child of Array.from(node.childNodes)) {
        walk(child);
      }

      if (isBlockElement(tag) && current.trim()) {
        const line = collapseSpacedChars(collapseWhitespace(current));
        if (line) lines.push(line);
        current = "";
      }
    }
  };

  for (const child of Array.from(el.childNodes)) {
    walk(child);
  }

  const remaining = collapseSpacedChars(collapseWhitespace(current));
  if (remaining) lines.push(remaining);

  // Remove trailing empty lines
  while (lines.length > 0 && !lines[lines.length - 1].trim()) {
    lines.pop();
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Text-based extraction (TXT fallback)
// ---------------------------------------------------------------------------

function extractBlocksFromText(rawText: string): TextBlock[] {
  const lines = rawText.split(/\r?\n/);
  const blocks: TextBlock[] = [];
  let currentLines: string[] = [];

  const flushText = () => {
    if (currentLines.length > 0) {
      blocks.push({ type: "text", content: currentLines.join("<br>\n") });
      currentLines = [];
    }
  };

  for (const line of lines) {
    const trimmed = sanitizeText(line).trim();
    if (!trimmed) {
      flushText();
      continue;
    }

    if (matchesSectionKeyword(trimmed)) {
      flushText();
      const { header, body } = splitHeaderFromBody(trimmed);
      blocks.push({ type: "header", content: normalizeHeaderText(header) });
      if (body) {
        currentLines.push(escapeHtml(body));
      }
    } else {
      currentLines.push(escapeHtml(trimmed));
    }
  }

  flushText();
  return blocks;
}

// ---------------------------------------------------------------------------
// Post-processing: ALL CAPS normalization and call bolding
// ---------------------------------------------------------------------------

function postProcessBlocks(blocks: TextBlock[]): void {
  for (const block of blocks) {
    if (block.type !== "text") continue;

    const lines = block.content.split("<br>\n");
    const processed = lines.map((line) => {
      let result = normalizeAllCapsLine(line);
      CALL_REGEX.lastIndex = 0;
      result = result.replace(CALL_REGEX, (m) => `<b>${m}</b>`);
      return result;
    });
    block.content = processed.join("<br>\n");
  }
}

/**
 * Lowercase any ALL CAPS word longer than 1 character, then ensure
 * the first alpha character of the line is capitalized.
 * Single-char words like "I" are preserved.
 */
function normalizeAllCapsLine(line: string): string {
  let result = line.replace(/[A-Z]{2,}/g, (m) => m.toLowerCase());
  if (result === line) return line;
  // Capitalize the first alpha character of the line
  result = result.replace(/^([^a-zA-Z]*)([a-z])/, (_, pre, ch) => pre + ch.toUpperCase());
  // Preserve standalone pronoun "I"
  result = result.replace(/\bi\b/g, "I");
  return result;
}

function buildCallRegex(callNames: string[]): RegExp {
  const patterns = callNames.map((name) => {
    let escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match both "and" and "&" / "&amp;" interchangeably
    escaped = escaped.replace(/\s+and\s+/gi, "\\s+(?:and|&(?:amp;)?)\\s+");
    return escaped;
  });
  return new RegExp(`\\b(${patterns.join("|")})\\b`, "gi");
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function blocksToHtml(blocks: TextBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "header") {
      parts.push(`\n<h2>${block.content}</h2>`);
    } else {
      parts.push(`<p>\n${block.content}\n</p>`);
    }
  }
  return parts.join("\n");
}

function wrapDocument(title: string, label: string, bodyContent: string): string {
  const safeTitle = escapeHtml(title);
  const safeLabel = escapeHtml(label);
  const infoSpan = safeLabel
    ? `&nbsp;<span class="info">${safeLabel}</span>`
    : "";
  const titleLine = `<p><h1>${safeTitle}</h1>${infoSpan}</p>`;

  return [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    `<title>${safeTitle}</title>`,
    "<style>",
    DEFAULT_LYRICS_STYLE,
    "</style>",
    "</head>",
    "<body>",
    "",
    titleLine,
    bodyContent,
    "",
    "</body>",
    "</html>",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------

/**
 * Replace mangled Windows-1252 bytes (C1 control range U+0080â€“U+009F),
 * Unicode replacement chars, and common "smart" punctuation with plain
 * ASCII equivalents, then strip any remaining non-printable characters.
 */
function sanitizeText(text: string): string {
  return text
    .replace(/[\u201C\u201D\u201E\u201F\u0093\u0094]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u0091\u0092]/g, "'")
    .replace(/[\u2013\u2014\u0096\u0097]/g, "-")
    .replace(/[\u2026\u0085]/g, "...")
    .replace(/\uFFFD/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
}

function collapseWhitespace(text: string): string {
  return text.replace(/[\s\u00a0]+/g, " ").trim();
}

/**
 * Detect and collapse spaced-out characters like "R W H 1 0 5 7".
 * If most "words" in the string are single characters, collapse them.
 */
function collapseSpacedChars(text: string): string {
  const words = text.split(/\s+/);
  if (words.length < 3) return text;

  const singleCharCount = words.filter((w) => w.length === 1).length;
  if (singleCharCount / words.length > 0.7) {
    return words.join("");
  }
  return text;
}

function normalizeHeaderText(text: string): string {
  let t = collapseWhitespace(text);
  // Normalize to Title Case if fully ALL CAPS
  if (t === t.toUpperCase() && t.length > 2) {
    t = toTitleCase(t);
  }
  // Lowercase any remaining ALL CAPS words (>1 char) in mixed-case headers
  const lowered = t.replace(/[A-Z]{2,}/g, (m) => m.toLowerCase());
  if (lowered !== t) {
    t = lowered.replace(/^([^a-zA-Z]*)([a-z])/, (_, pre, ch) => pre + ch.toUpperCase());
  }
  return t;
}

function toTitleCase(text: string): string {
  const minorWords = new Set([
    "a", "an", "the", "and", "but", "or", "for", "nor",
    "at", "by", "in", "of", "on", "to", "up", "with",
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export { toTitleCase, escapeHtml };