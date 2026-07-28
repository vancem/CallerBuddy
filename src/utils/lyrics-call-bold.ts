/**
 * Square dance call bolding shared by HTML/TXT import and paste conversion.
 * Sorted longest-first so the regex prefers multi-word matches.
 */

export const CALL_NAMES: string[] = [
  "right and left thru",
  "chain down the line",
  "double pass thru",
  "touch a quarter",
  "touch one quarter",
  "touch 1/4",
  "walk and dodge",
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
  "grand square",
  "half sashay",
  "sides face",
  "star right",
  "men sashay",
  "square thru",
  "eight chain",
  "lead right",
  "scoot back",
  "swing thru",
  "pass thru",
  "do sa do",
  "do-sa-do",
  "flutterwheel",
  "flutter wheel",
  "ferris wheel",
  "slide thru",
  "star thru",
  "veer left",
  "allemande",
  "circulate",
  "cloverleaf",
  "cross run",
  "cross fold",
  "promenade",
  "dive thru",
  "dixie style",
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
  "three",
  "four",
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
  "4",
  "3",
];

export function buildCallRegex(callNames: string[] = CALL_NAMES): RegExp {
  return new RegExp(
    `\\b(${callNames
      .map((n) =>
        n
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          // Match "and", "&", and HTML "&amp;" interchangeably
          .replace(/\s+and\s+/gi, "\\s+(?:and|&(?:amp;)?)\\s+"),
      )
      .join("|")})\\b`,
    "gi",
  );
}

const CALL_REGEX = buildCallRegex();

/**
 * Lowercase ALL CAPS runs, capitalize first letter, keep standalone "I".
 */
export function normalizeAllCapsLine(line: string): string {
  let result = line.replace(/[A-Z]{2,}/g, (m) => m.toLowerCase());
  if (result === line) return line;
  result = result.replace(/^([^a-zA-Z]*)([a-z])/, (_, pre, ch) => pre + ch.toUpperCase());
  result = result.replace(/\bi\b/g, "I");
  return result;
}

/** Wrap matched calls in Markdown `**…**` (skips lines that already use bold). */
export function emphasizeCallsAsMarkdown(line: string): string {
  if (line.includes("**")) return line;
  let result = normalizeAllCapsLine(line);
  CALL_REGEX.lastIndex = 0;
  return result.replace(CALL_REGEX, (m) => `**${m}**`);
}

/** Wrap matched calls in HTML `<b>…</b>`. */
export function emphasizeCallsAsHtml(line: string): string {
  let result = normalizeAllCapsLine(line);
  CALL_REGEX.lastIndex = 0;
  return result.replace(CALL_REGEX, (m) => `<b>${m}</b>`);
}
