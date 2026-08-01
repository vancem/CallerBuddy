/**
 * Song Onboarding heuristics engine.
 *
 * Analyzes ZIP contents (filenames and entry data) to produce an
 * OnboardingProposal: best-guess label, title, ranked MP3 list,
 * scraped/normalized lyrics HTML, and proposed destination filenames.
 *
 * Pure logic — no I/O. ZIP reading and file writing are handled by callers.
 *
 * See the plan's "Heuristics" section for the analysis that produced these
 * rules, derived from 90+ real-world square-dance song archives.
 */

import { toTitleCase } from "./html-scraper.js";
import { importHtmlToMarkdown, importTextToMarkdown, replaceLyricsHeader } from "./lyrics-import.js";
import { decodeHtmlBytes, filterLyricsText } from "../utils/lyrics-text-filter.js";
import { scoreMp3Candidates, type Mp3Candidate } from "./mp3-candidate-scoring.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type { Mp3Candidate };
export { scoreMp3Candidates };

export interface HtmlCandidate {
  path: string;
  filename: string;
}

export interface OnboardingProposal {
  label: string;
  title: string;
  mp3Candidates: Mp3Candidate[];
  selectedMp3: string;
  htmlCandidates: HtmlCandidate[];
  selectedHtml: string;
  /** Normalized lyrics Markdown, or empty */
  lyricsMarkdown: string;
  /** All entries in the ZIP for reference display */
  allEntries: string[];
  destMp3Name: string;
  /** Destination lyrics filename (.md), or empty */
  destLyricsName: string;
  /**
   * Hint when auto-convert found nothing useful (e.g. PDF/Word-only archive).
   * Shown in the onboard UI so the user can paste lyrics.
   */
  lyricsHint: string;
}

// ---------------------------------------------------------------------------
// Main analysis entry point
// ---------------------------------------------------------------------------

/**
 * Analyze a ZIP's contents and produce an onboarding proposal.
 *
 * @param zipName     Original ZIP filename (e.g. "BS 2469 - WITCH DOCTOR.zip")
 * @param entryPaths  All paths in the ZIP (files only, no directories)
 * @param readEntry   Async callback to read a specific entry's text content
 * @param readBinary  Optional binary reader — preferred for HTML (charset decode)
 */
export async function analyzeZipForOnboarding(
  zipName: string,
  entryPaths: string[],
  readEntry: (path: string) => Promise<string>,
  readBinary?: (path: string) => Promise<ArrayBuffer>,
): Promise<OnboardingProposal> {
  const sortedPaths = sortPaths(entryPaths);
  const mp3Paths = sortedPaths.filter((p) => isMusicExt(p));
  const htmlPaths = sortedPaths.filter((p) => isHtmlExt(p));
  const mdPaths = sortedPaths.filter((p) => p.toLowerCase().endsWith(".md"));
  const txtPaths = sortedPaths.filter((p) => p.toLowerCase().endsWith(".txt"));

  // 1. Extract label
  const label = extractLabel(zipName, mp3Paths);

  // 2. Title from source name only when it embeds a label (not container folders like "patter")
  const titleFromSource = titleFromSourceName(zipName, label);

  // 3. Score MP3s (title hint only helps exact-match bonus when source had a real title)
  const mp3Candidates = scoreMp3Candidates(mp3Paths, label, titleFromSource);
  const selectedMp3 = mp3Candidates.length > 0 ? mp3Candidates[0].path : "";

  // 4. Final title: source name, else selected MP3 filename, else source verbatim
  const title = extractTitle(zipName, mp3Paths, label, selectedMp3);

  // 5. Select best lyrics source (prefer .md, then HTML, then TXT)
  const htmlCandidates: HtmlCandidate[] = sortPaths([
    ...mdPaths,
    ...htmlPaths,
  ]).map((p) => ({ path: p, filename: basename(p) }));
  const selectedMd = selectBestMd(mdPaths, label, title);
  const selectedHtml = selectedMd || selectBestHtml(htmlPaths, label, title);

  // 6. Load / convert lyrics to Markdown (MD → HTML → TXT; PDF/Word = paste hint)
  let lyricsMarkdown = "";
  if (selectedMd) {
    try {
      lyricsMarkdown = filterLyricsText(await readEntry(selectedMd));
    } catch {
      // fall through
    }
  } else if (selectedHtml) {
    try {
      const raw = await readHtmlSource(selectedHtml, readEntry, readBinary);
      lyricsMarkdown = importHtmlToMarkdown(raw, label, title).markdown;
    } catch {
      // HTML read failed; try TXT fallback below
    }
  }

  if (!lyricsMarkdown && txtPaths.length > 0) {
    const bestTxt = selectBestTxt(txtPaths, label, title);
    if (bestTxt) {
      try {
        const raw = await readEntry(bestTxt);
        lyricsMarkdown = importTextToMarkdown(raw, label, title).markdown;
      } catch {
        // TXT read also failed
      }
    }
  }

  const pdfPaths = sortedPaths.filter((p) => p.toLowerCase().endsWith(".pdf"));
  const wordPaths = sortedPaths.filter((p) => /\.docx?$/i.test(p));
  let lyricsHint = "";
  if (!lyricsMarkdown && (pdfPaths.length > 0 || wordPaths.length > 0)) {
    lyricsHint = pasteLyricsHint(pdfPaths.length > 0, wordPaths.length > 0);
  }

  // 7. Generate destination filenames
  const destBase = label && title ? `${label} - ${title}` : title || label || "Untitled";
  const destMp3Name = `${destBase}.mp3`;
  const destLyricsName = lyricsMarkdown ? `${destBase}.md` : "";

  return {
    label,
    title,
    mp3Candidates,
    selectedMp3,
    htmlCandidates,
    selectedHtml,
    lyricsMarkdown,
    allEntries: sortedPaths,
    destMp3Name,
    destLyricsName,
    lyricsHint,
  };
}

/** Stable path order for ZIP/folder file lists and lyrics-source dropdowns. */
export function sortPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

/** Regenerate destination filenames when the user edits label/title. */
export function computeDestNames(
  label: string,
  title: string,
  hasLyrics: boolean,
): { destMp3Name: string; destLyricsName: string } {
  const destBase = label && title ? `${label} - ${title}` : title || label || "Untitled";
  return {
    destMp3Name: `${destBase}.mp3`,
    destLyricsName: hasLyrics ? `${destBase}.md` : "",
  };
}

/** Re-scrape when user selects a different HTML/MD source. */
export async function rescrapeHtml(
  htmlPath: string,
  readEntry: (path: string) => Promise<string>,
  label: string,
  title: string,
  readBinary?: (path: string) => Promise<ArrayBuffer>,
): Promise<string> {
  if (htmlPath.toLowerCase().endsWith(".md")) {
    return replaceLyricsHeader(await readEntry(htmlPath), label, title);
  }
  if (htmlPath.toLowerCase().endsWith(".txt")) {
    return importTextToMarkdown(await readEntry(htmlPath), label, title).markdown;
  }
  const raw = await readHtmlSource(htmlPath, readEntry, readBinary);
  return importHtmlToMarkdown(raw, label, title).markdown;
}

async function readHtmlSource(
  path: string,
  readEntry: (path: string) => Promise<string>,
  readBinary?: (path: string) => Promise<ArrayBuffer>,
): Promise<string> {
  if (readBinary) {
    try {
      return decodeHtmlBytes(await readBinary(path));
    } catch {
      // fall through to text
    }
  }
  return readEntry(path);
}

// ---------------------------------------------------------------------------
// Label extraction
// ---------------------------------------------------------------------------

/**
 * Core label regex: 2-5 uppercase letters, then a space or dash, then 2-5 digits.
 * Captures the full label string (e.g. "BS 2469", "NB-412", "STING 21301").
 */
const LABEL_RE = /([A-Z]{2,5})([\s-])(\d{2,5})/i;

function extractLabel(zipName: string, mp3Paths: string[]): string {
  // Priority 1: ZIP filename
  const zipBase = stripExtension(zipName);
  const fromZip = extractLabelFromString(zipBase);
  if (fromZip) return fromZip;

  // Priority 2: Consensus across MP3 filenames
  const labels = new Map<string, number>();
  for (const p of mp3Paths) {
    const lbl = extractLabelFromString(basename(p));
    if (lbl) {
      labels.set(lbl, (labels.get(lbl) ?? 0) + 1);
    }
  }
  if (labels.size > 0) {
    return [...labels.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  // Priority 3: Reversed convention (TITLE - LABEL)
  for (const p of mp3Paths) {
    const name = basename(p);
    const dashIdx = name.indexOf(" - ");
    if (dashIdx < 0) continue;
    const right = stripExtension(name.substring(dashIdx + 3)).trim();
    // Strip variant suffixes from right side
    const rightClean = right.replace(/\s*(BGV|V|H|M|F)\s*$/i, "").trim();
    const lbl = extractLabelFromString(rightClean);
    if (lbl) return lbl;
  }

  return "";
}

function extractLabelFromString(s: string): string {
  const m = s.match(LABEL_RE);
  if (!m) return "";
  const letters = m[1].toUpperCase();
  const sep = m[2] === "-" ? "-" : " ";
  const digits = m[3];
  return `${letters}${sep}${digits}`;
}

// ---------------------------------------------------------------------------
// Title extraction
// ---------------------------------------------------------------------------

/**
 * Parse catalog label and song title from a music file path (e.g. when the user
 * changes the selected MP3 during onboarding).
 */
export function labelAndTitleFromMusicPath(path: string): { label: string; title: string } {
  const name = stripExtension(basename(path));
  const label = extractLabelFromString(name);
  const title = label
    ? cleanTitle(removeLabelFromString(name, label))
    : cleanTitle(name);
  return { label, title };
}

/**
 * Find a music file that matches a lyrics path by basename (case-insensitive),
 * e.g. "BS 2469 - Witch Doctor.html" → "BS 2469 - Witch Doctor.mp3".
 */
export function findMatchingMusicForLyrics(
  lyricsPath: string,
  musicPaths: string[],
): string {
  const lyricsBase = stripExtension(basename(lyricsPath)).toLowerCase();
  if (!lyricsBase || musicPaths.length === 0) return "";

  const exact = musicPaths.find(
    (p) => stripExtension(basename(p)).toLowerCase() === lyricsBase,
  );
  if (exact) return exact;

  // Lyrics basename may differ slightly from raw MP3 casing/punctuation after
  // cleanTitle; compare using the same label/title parse used elsewhere.
  const fromLyrics = labelAndTitleFromMusicPath(lyricsPath);
  if (!fromLyrics.label || !fromLyrics.title) return "";
  const ideal = `${fromLyrics.label} - ${fromLyrics.title}`.toLowerCase();
  return (
    musicPaths.find((p) => {
      const { label, title } = labelAndTitleFromMusicPath(p);
      return label && title && `${label} - ${title}`.toLowerCase() === ideal;
    }) ?? ""
  );
}

/**
 * Title embedded in the ZIP/folder name when that name contains a catalog label.
 * Returns "" for container names like "patter" so callers can use the selected MP3.
 */
function titleFromSourceName(zipName: string, label: string): string {
  const zipBase = stripExtension(zipName);
  const labelFromSource = extractLabelFromString(zipBase);
  if (!labelFromSource) return "";
  return cleanTitle(removeLabelFromString(zipBase, label || labelFromSource));
}

function extractTitle(
  zipName: string,
  mp3Paths: string[],
  label: string,
  preferredMp3Path = "",
): string {
  const zipBase = stripExtension(zipName);

  // Priority 1: source name only when it embeds a catalog label
  const fromSource = titleFromSourceName(zipName, label);
  if (fromSource) return fromSource;

  // Priority 2: preferred (selected) MP3 first, then other music files — not "shortest title"
  const pathsToTry = preferredMp3Path
    ? [preferredMp3Path, ...mp3Paths.filter((p) => p !== preferredMp3Path)]
    : mp3Paths;
  for (const p of pathsToTry) {
    const t = cleanTitle(removeLabelFromString(stripExtension(basename(p)), label));
    if (t) return t;
  }

  // Priority 3: source name verbatim
  return normalizeTitle(zipBase);
}

function removeLabelFromString(s: string, label: string): string {
  if (!label) return s;

  // Try removing "LABEL - " prefix (standard convention)
  const dashIdx = s.indexOf(" - ");
  if (dashIdx >= 0) {
    const left = s.substring(0, dashIdx);
    const right = s.substring(dashIdx + 3);
    if (extractLabelFromString(left)) return right.trim();
    // Reversed: "TITLE - LABEL"
    if (extractLabelFromString(right)) return left.trim();
  }

  // Try removing label from start (no dash: "BS 2469 WITCH DOCTOR")
  // Returns "" when the entire string IS the label — callers treat empty as
  // "no title found in this source, try the next priority."
  const labelEscaped = label.replace(/[-\s]/g, "[-\\s]");
  const re = new RegExp(`^${labelEscaped}\\s*`, "i");
  const stripped = s.replace(re, "").trim();
  if (stripped !== s) return stripped;

  return s;
}

/** Strip variant descriptors from a title string. */
function cleanTitle(raw: string): string {
  let t = raw;

  // Remove parenthetical descriptors
  t = t.replace(/\s*\([^)]*\)\s*/g, " ");

  // Remove "by CallerName" suffix
  t = t.replace(/\s+by\s+.+$/i, "");

  // Remove trailing pitch markers like ".-2", ".-4"
  t = t.replace(/\.\s*-\d+\s*$/, "");

  // Remove leading variant labels like "Original", "Vocal -"
  t = t.replace(/^(Original|Vocal)\s*[-:]?\s*/i, "");

  t = t.replace(/_/g, " ");
  t = t.trim();

  return normalizeTitle(t);
}

function normalizeTitle(raw: string): string {
  let t = raw.trim();
  if (!t) return t;

  // Convert ALL CAPS to Title Case
  if (t === t.toUpperCase() && t.length > 2) {
    t = toTitleCase(t);
  }

  return t;
}

// ---------------------------------------------------------------------------
// HTML / TXT selection
// ---------------------------------------------------------------------------

function selectBestMd(mdPaths: string[], label: string, title: string): string {
  if (mdPaths.length === 0) return "";
  if (mdPaths.length === 1) return mdPaths[0];
  const scored = mdPaths.map((p) => {
    const name = basename(p).toLowerCase();
    let score = 0;
    if (label && name.includes(label.toLowerCase())) score -= 10;
    if (title && name.includes(title.toLowerCase())) score -= 5;
    return { path: p, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0].path;
}

function selectBestHtml(htmlPaths: string[], label: string, title: string): string {
  if (htmlPaths.length === 0) return "";
  if (htmlPaths.length === 1) return htmlPaths[0];

  // Score each HTML file
  const scored = htmlPaths.map((p) => {
    const name = basename(p).toLowerCase();
    let score = 0;

    // Prefer files matching the label
    if (label && name.includes(label.toLowerCase())) score -= 10;

    // Prefer files matching the title
    if (title && name.includes(title.toLowerCase())) score -= 5;

    // Penalize variant descriptors in name
    if (/christmas|lyrics\s*only/i.test(name)) score += 20;

    // Prefer .html over .htm
    if (name.endsWith(".html")) score -= 2;

    return { path: p, score };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored[0].path;
}

function selectBestTxt(txtPaths: string[], label: string, title: string): string {
  if (txtPaths.length === 0) return "";
  if (txtPaths.length === 1) return txtPaths[0];

  // Prefer TXT files that look like lyrics (not receipts, etc.)
  const scored = txtPaths.map((p) => {
    const name = basename(p).toLowerCase();
    let score = 0;
    if (/receipt|order|read\s*me/i.test(name)) score += 100;
    if (/lyric/i.test(name)) score -= 10;
    if (label && name.includes(label.toLowerCase())) score -= 5;
    if (title && name.includes(title.toLowerCase())) score -= 5;
    return { path: p, score };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored[0].score < 50 ? scored[0].path : "";
}

// ---------------------------------------------------------------------------
// Filename utilities
// ---------------------------------------------------------------------------

function basename(path: string): string {
  const sep = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return sep >= 0 ? path.substring(sep + 1) : path;
}

function stripExtension(filename: string): string {
  const dotIdx = filename.lastIndexOf(".");
  return dotIdx >= 0 ? filename.substring(0, dotIdx) : filename;
}

function getExtension(filename: string): string {
  const dotIdx = filename.lastIndexOf(".");
  return dotIdx >= 0 ? filename.substring(dotIdx).toLowerCase() : "";
}

const MUSIC_EXTENSIONS = new Set([".mp3", ".m4a", ".wav"]);
const HTML_EXTENSIONS = new Set([".html", ".htm"]);

function isMusicExt(path: string): boolean {
  return MUSIC_EXTENSIONS.has(getExtension(basename(path)));
}

function isHtmlExt(path: string): boolean {
  return HTML_EXTENSIONS.has(getExtension(basename(path)));
}

/** Paste nudge when lyrics exist only as PDF and/or Word files. */
function pasteLyricsHint(hasPdf: boolean, hasWord: boolean): string {
  const kinds: string[] = [];
  if (hasPdf) kinds.push("PDF");
  if (hasWord) kinds.push("Word (.doc/.docx)");
  const kindList =
    kinds.length === 1 ? kinds[0]! : `${kinds[0]} and ${kinds[1]}`;
  return (
    `No HTML/Markdown lyrics found, but this archive has a ${kindList}. ` +
    "Open that file from the list, copy the text, and paste it into the lyrics editor."
  );
}

// Exported for unit testing only
export const _testOnly = {
  extractLabel,
  extractTitle,
  scoreMp3Candidates,
  selectBestHtml,
  cleanTitle,
  normalizeTitle,
  pasteLyricsHint,
};
