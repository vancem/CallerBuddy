/**
 * Heuristic scoring for MP3 (and .m4a/.wav) candidates during ZIP onboarding.
 * Lower score = more preferred. Rules are data-driven tables plus small helpers
 * for label-suffix and parenthetical parsing.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Mp3Candidate {
  /** Path within the ZIP (may include subdirectory) */
  path: string;
  /** Bare filename */
  filename: string;
  /** Lower score = more preferred */
  score: number;
  /** Human-readable reason for the score */
  reason: string;
}

// ---------------------------------------------------------------------------
// Filename utilities (local — keep module self-contained)
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

// ---------------------------------------------------------------------------
// Rule tables (delta added to score; lower total = better)
// ---------------------------------------------------------------------------

const FORMAT_BY_EXT: Record<string, { delta: number; reason: string }> = {
  ".m4a": { delta: 5, reason: "m4a format (+5)" },
  ".wav": { delta: 10, reason: "wav format (+10)" },
};

/** Filename substring / regex penalties (vocal-ish names). */
const VOCAL_FILENAME_RULES: { pattern: RegExp; delta: number; reason: string }[] =
  [
    { pattern: /\bby\s+\w/i, delta: 100, reason: "called/vocal version (+100)" },
    { pattern: /\bvocal\b/i, delta: 100, reason: "vocal version (+100)" },
    { pattern: /\bcalled\b/i, delta: 100, reason: "called version (+100)" },
  ];

function scoreLabelSuffix(labelSuffix: string): { delta: number; reason: string } {
  const sl = labelSuffix.toUpperCase();
  if (sl === "V" || sl.startsWith("V")) {
    return { delta: 100, reason: `vocal suffix '${labelSuffix}' (+100)` };
  }
  if (sl === "H") {
    return { delta: 50, reason: `harmony suffix '${labelSuffix}' (+50)` };
  }
  if (sl === "M") {
    return { delta: 15, reason: `music suffix '${labelSuffix}' (+15)` };
  }
  if (sl === "A" || sl === "B" || sl === "F") {
    return { delta: 35, reason: `alternate suffix '${labelSuffix}' (+35)` };
  }
  return { delta: 40, reason: `unknown suffix '${labelSuffix}' (+40)` };
}

/**
 * Parenthetical content rules — first match wins (same order as original
 * if/else chain).
 */
const PAREN_INNER_RULES: { pattern: RegExp; delta: number; reason: string }[] = [
  { pattern: /^(m|music|instrumental)$/, delta: 10, reason: "instrumental marker (+10)" },
  { pattern: /instrumental\s*sample/, delta: 80, reason: "instrumental sample (+80)" },
  { pattern: /harmony|harm/, delta: 50, reason: "harmony version (+50)" },
  { pattern: /no\s*(leads|mel|fills)/, delta: 20, reason: "stripped version (+20)" },
  { pattern: /extended|long\s*intro/, delta: 30, reason: "extended version (+30)" },
  { pattern: /high\s*key|low\s*key/, delta: 40, reason: "key variant (+40)" },
  { pattern: /keychange|half\s*step/, delta: 90, reason: "key change variant (+90)" },
  { pattern: /vocal|called/, delta: 100, reason: "vocal/called (+100)" },
  { pattern: /bgv/, delta: 60, reason: "background vocal (+60)" },
  { pattern: /\d{4}\s*(music\s*)?mix|re-?mix/, delta: 45, reason: "remix/remaster (+45)" },
];

/** Find a variant suffix letter(s) appended directly to the label number. */
function extractLabelSuffix(filename: string, label: string): string {
  if (!label) return "";
  const labelEscaped = label.replace(/[-\s]/g, "[-\\s]?");
  const re = new RegExp(`${labelEscaped}([A-Za-z]{1,3})\\b`, "i");
  const m = filename.match(re);
  return m?.[1] ?? "";
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function scoreMp3Candidates(
  mp3Paths: string[],
  label: string,
  title: string,
): Mp3Candidate[] {
  const candidates = mp3Paths.map((p) => scoreSingleMp3(p, label, title));
  candidates.sort((a, b) => a.score - b.score);
  return candidates;
}

export function scoreSingleMp3(path: string, label: string, title: string): Mp3Candidate {
  const filename = basename(path);
  const lower = filename.toLowerCase();
  const nameNoExt = stripExtension(filename);
  const ext = getExtension(filename);

  let score = 0;
  const reasons: string[] = [];

  const formatRule = FORMAT_BY_EXT[ext];
  if (formatRule) {
    score += formatRule.delta;
    reasons.push(formatRule.reason);
  }

  if (label && title) {
    const idealName = `${label} - ${title}`.toLowerCase();
    const idealNoCase = stripExtension(lower);
    if (idealNoCase === idealName) {
      score -= 20;
      reasons.push("exact label-title match (-20)");
    }
  }

  if (nameNoExt.includes(" - ")) {
    score -= 10;
    reasons.push("standard naming (-10)");
  }

  for (const rule of VOCAL_FILENAME_RULES) {
    if (rule.pattern.test(nameNoExt)) {
      score += rule.delta;
      reasons.push(rule.reason);
    }
  }

  const labelSuffix = extractLabelSuffix(nameNoExt, label);
  if (labelSuffix) {
    const adj = scoreLabelSuffix(labelSuffix);
    score += adj.delta;
    reasons.push(adj.reason);
  }

  const parens = nameNoExt.match(/\(([^)]+)\)/g) ?? [];
  for (const paren of parens) {
    const inner = paren.slice(1, -1).toLowerCase();
    for (const rule of PAREN_INNER_RULES) {
      if (rule.pattern.test(inner)) {
        score += rule.delta;
        reasons.push(rule.reason);
        break;
      }
    }
  }

  if (/\bBGV\b/i.test(nameNoExt) && !parens.some((p) => /bgv/i.test(p))) {
    score += 60;
    reasons.push("BGV marker (+60)");
  }

  if (/^original\b/i.test(nameNoExt)) {
    score += 110;
    reasons.push("original recording (+110)");
  }

  if (/\.-\d+$/.test(nameNoExt)) {
    score += 40;
    reasons.push("pitch-shifted (+40)");
  }

  if (/strong\s*melody/i.test(nameNoExt)) {
    score += 25;
    reasons.push("strong melody variant (+25)");
  }

  return {
    path,
    filename,
    score,
    reason: reasons.length > 0 ? reasons.join("; ") : "base instrumental",
  };
}
