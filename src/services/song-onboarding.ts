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

import { scrapeAndNormalizeLyrics, scrapeTxtLyrics, toTitleCase } from "./html-scraper.js";
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
  /** Scraped + normalized lyrics HTML (full document), or empty */
  normalizedHtml: string;
  /** All entries in the ZIP for reference display */
  allEntries: string[];
  destMp3Name: string;
  destHtmlName: string;
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
 */
export async function analyzeZipForOnboarding(
  zipName: string,
  entryPaths: string[],
  readEntry: (path: string) => Promise<string>,
): Promise<OnboardingProposal> {
  const mp3Paths = entryPaths.filter((p) => isMusicExt(p));
  const htmlPaths = entryPaths.filter((p) => isHtmlExt(p));
  const txtPaths = entryPaths.filter((p) => p.toLowerCase().endsWith(".txt"));

  // 1. Extract label
  const label = extractLabel(zipName, mp3Paths);

  // 2. Extract title
  const title = extractTitle(zipName, mp3Paths, label);

  // 3. Score and rank MP3 candidates
  const mp3Candidates = scoreMp3Candidates(mp3Paths, label, title);

  const selectedMp3 = mp3Candidates.length > 0 ? mp3Candidates[0].path : "";

  // 4. Select best HTML
  const htmlCandidates: HtmlCandidate[] = htmlPaths.map((p) => ({
    path: p,
    filename: basename(p),
  }));
  const selectedHtml = selectBestHtml(htmlPaths, label, title);

  // 5. Scrape lyrics
  let normalizedHtml = "";
  if (selectedHtml) {
    try {
      const raw = await readEntry(selectedHtml);
      normalizedHtml = scrapeAndNormalizeLyrics(raw, label, title);
    } catch {
      // HTML read failed; try TXT fallback below
    }
  }

  if (!normalizedHtml && txtPaths.length > 0) {
    const bestTxt = selectBestTxt(txtPaths, label, title);
    if (bestTxt) {
      try {
        const raw = await readEntry(bestTxt);
        normalizedHtml = scrapeTxtLyrics(raw, label, title);
      } catch {
        // TXT read also failed
      }
    }
  }

  // 6. Generate destination filenames
  const destBase = label && title ? `${label} - ${title}` : title || label || "Untitled";
  const destMp3Name = `${destBase}.mp3`;
  const destHtmlName = normalizedHtml ? `${destBase}.html` : "";

  return {
    label,
    title,
    mp3Candidates,
    selectedMp3,
    htmlCandidates,
    selectedHtml,
    normalizedHtml,
    allEntries: entryPaths,
    destMp3Name,
    destHtmlName,
  };
}

/** Regenerate destination filenames when the user edits label/title. */
export function computeDestNames(
  label: string,
  title: string,
  hasHtml: boolean,
): { destMp3Name: string; destHtmlName: string } {
  const destBase = label && title ? `${label} - ${title}` : title || label || "Untitled";
  return {
    destMp3Name: `${destBase}.mp3`,
    destHtmlName: hasHtml ? `${destBase}.html` : "",
  };
}

/** Re-scrape when user selects a different HTML source. */
export async function rescrapeHtml(
  htmlPath: string,
  readEntry: (path: string) => Promise<string>,
  label: string,
  title: string,
): Promise<string> {
  const raw = await readEntry(htmlPath);
  return scrapeAndNormalizeLyrics(raw, label, title);
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

function extractTitle(zipName: string, mp3Paths: string[], label: string): string {
  // Priority 1: ZIP filename after label removal
  const zipBase = stripExtension(zipName);
  let fromZip = removeLabelFromString(zipBase, label);
  fromZip = cleanTitle(fromZip);
  if (fromZip) return fromZip;

  // Priority 2: Best MP3 filename
  if (mp3Paths.length > 0) {
    const candidates = mp3Paths
      .map((p) => cleanTitle(removeLabelFromString(stripExtension(basename(p)), label)))
      .filter((t) => t.length > 0);
    if (candidates.length > 0) {
      // Prefer the shortest clean name (fewest variant descriptors)
      candidates.sort((a, b) => a.length - b.length);
      return candidates[0];
    }
  }

  // Priority 3: ZIP name verbatim
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

// Exported for unit testing only
export const _testOnly = {
  extractLabel,
  extractTitle,
  scoreMp3Candidates,
  selectBestHtml,
  cleanTitle,
  normalizeTitle,
};
