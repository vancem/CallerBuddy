import { HELP_TOC } from "../help-toc.js";

/**
 * Public help deep links use the hash so GitHub Pages can keep serving the
 * single `index.html` (no 404.html or per-section files):
 *
 *   https://vancem.github.io/CallerBuddy/#help/callerbuddy-security
 *
 * The slug is the GFM heading id (lowercase, hyphens). Title Case is accepted.
 */

const HELP_PREFIX = "help";

/** First help section — used for `#help` with no slug. */
export const DEFAULT_HELP_SECTION_ID = "welcome-to-callerbuddy";

/**
 * Parse `location.hash` for a help deep link.
 * Returns the section slug (possibly empty for `#help`), or `null` if this
 * hash is not a help link.
 */
export function parseHelpHash(hash: string): string | null {
  if (!hash) return null;
  let raw = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  raw = raw.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!raw) return null;

  const parts = raw.split("/").filter((p) => p.length > 0);
  if (parts[0]?.toLowerCase() !== HELP_PREFIX) return null;
  if (parts.length === 1) return "";

  return parts
    .slice(1)
    .join("/")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/** Map a parsed slug onto a known TOC id when possible (case already folded). */
export function resolveHelpSectionId(slug: string): string {
  if (!slug) return DEFAULT_HELP_SECTION_ID;
  const match = HELP_TOC.find((e) => e.id === slug);
  return match?.id ?? slug;
}
