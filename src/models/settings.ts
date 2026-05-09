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

/** Default lyrics body scale on desktop/wide layout (~viewport &gt; 700px). */
export const DEFAULT_LYRICS_FONT_SCALE_DESKTOP = 1;

/** Default lyrics body scale on phone/narrow layout (≤700px). */
export const DEFAULT_LYRICS_FONT_SCALE_PHONE = 0.85;

/** Min/max lyrics scale multiplier (matches `--cb-lyrics-font-size` clamp). */
export const LYRICS_FONT_SCALE_MIN = 0.5;
export const LYRICS_FONT_SCALE_MAX = 2.5;

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
  /**
   * Lyrics body font scale in the player (0.5–2.5). Used when the layout is
   * wide (viewport &gt; ~700px). Persisted in settings.json.
   */
  lyricsFontScaleDesktop: number;
  /**
   * Lyrics body font scale for narrow/phone-style layout (≤ ~700px).
   * Separate from desktop so each mode keeps its own preference.
   */
  lyricsFontScalePhone: number;
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
    lyricsFontScaleDesktop: DEFAULT_LYRICS_FONT_SCALE_DESKTOP,
    lyricsFontScalePhone: DEFAULT_LYRICS_FONT_SCALE_PHONE,
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
    lyricsFontScaleDesktop: pickNum(
      "lyricsFontScaleDesktop",
      defaults.lyricsFontScaleDesktop,
      LYRICS_FONT_SCALE_MIN,
      LYRICS_FONT_SCALE_MAX,
    ),
    lyricsFontScalePhone: pickNum(
      "lyricsFontScalePhone",
      defaults.lyricsFontScalePhone,
      LYRICS_FONT_SCALE_MIN,
      LYRICS_FONT_SCALE_MAX,
    ),
  };
}
