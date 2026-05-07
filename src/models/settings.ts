/**
 * Application-wide settings persisted to settings.json in CallerBuddyRoot.
 * See CallerBuddySpec.md for descriptions of user-configurable values.
 */

/** Canonical default for break timer duration (minutes). Used by defaultSettings() and UI fallbacks. */
export const DEFAULT_BREAK_TIMER_MINUTES = 5;

/** Default width in px for the playlist panel (shared by editor and play views). */
export const DEFAULT_PLAYLIST_PANEL_WIDTH = 280;

/** Default height in px for the playlist panel in portrait (editor only). */
export const DEFAULT_PLAYLIST_PANEL_HEIGHT = 240;

export interface Settings {
  /** Break timer default duration in minutes (decimal allowed). Default 5. */
  breakTimerMinutes: number;
  /** Patter timer default duration in minutes. Default 5. */
  patterTimerMinutes: number;
  /** Width in px of the playlist panel (resizable). Default 280. */
  playlistPanelWidth: number;
  /** Height in px of the playlist panel when stacked vertically (portrait). Default 240. */
  playlistPanelHeight: number;
  /** Relative musicFile paths for the persisted playlist (from CallerBuddyRoot). */
  playlistPaths: string[];
  /**
   * Subset of playlistPaths (same strings) for songs marked "played" in Now Playing.
   * Persisted so checkbox state survives restart.
   */
  playlistPlayedPaths: string[];
}

/** Returns a Settings object populated with default values. */
export function defaultSettings(): Settings {
  return {
    breakTimerMinutes: DEFAULT_BREAK_TIMER_MINUTES,
    patterTimerMinutes: 6,
    playlistPanelWidth: DEFAULT_PLAYLIST_PANEL_WIDTH,
    playlistPanelHeight: DEFAULT_PLAYLIST_PANEL_HEIGHT,
    playlistPaths: [],
    playlistPlayedPaths: [],
  };
}

/**
 * Validate and normalize a parsed JSON value into a Settings object.
 * Unknown or malformed fields fall back to defaults.
 */
export function normalizeSettings(raw: unknown): Settings {
  const defaults = defaultSettings();
  if (typeof raw !== "object" || raw === null) return defaults;
  const obj = raw as Record<string, unknown>;

  function pickNum(key: string, fallback: number, min?: number, max?: number): number {
    const v = obj[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
    if (min !== undefined && v < min) return fallback;
    if (max !== undefined && v > max) return fallback;
    return v;
  }

  const rawPaths = obj["playlistPaths"];
  const playlistPaths: string[] = [];
  if (Array.isArray(rawPaths)) {
    for (const p of rawPaths) {
      if (typeof p === "string" && p) playlistPaths.push(p);
    }
  }

  const rawPlayed = obj["playlistPlayedPaths"];
  const playlistPlayedPaths: string[] = [];
  if (Array.isArray(rawPlayed)) {
    for (const p of rawPlayed) {
      if (typeof p === "string" && p) playlistPlayedPaths.push(p);
    }
  }

  return {
    breakTimerMinutes: pickNum("breakTimerMinutes", defaults.breakTimerMinutes, 0, 60),
    patterTimerMinutes: pickNum("patterTimerMinutes", defaults.patterTimerMinutes, 0.5, 15),
    playlistPanelWidth: pickNum("playlistPanelWidth", defaults.playlistPanelWidth, 100, 1000),
    playlistPanelHeight: pickNum(
      "playlistPanelHeight",
      defaults.playlistPanelHeight,
      100,
      2000,
    ),
    playlistPaths,
    playlistPlayedPaths,
  };
}
