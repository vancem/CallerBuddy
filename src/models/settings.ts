/**
 * Application-wide settings persisted to settings.json in CallerBuddyRoot.
 * See CallerBuddySpec.md for descriptions of user-configurable values.
 */

/** Canonical default for break timer duration (minutes). Used by defaultSettings() and UI fallbacks. */
export const DEFAULT_BREAK_TIMER_MINUTES = 5;

/** Default width in px for the playlist panel (shared by editor and play views). */
export const DEFAULT_PLAYLIST_PANEL_WIDTH = 280;

export interface Settings {
  /** Break timer default duration in minutes (decimal allowed). Default 5. */
  breakTimerMinutes: number;
  /** Patter timer default duration in minutes. Default 5. */
  patterTimerMinutes: number;
  /** Width in px of the playlist panel (resizable). Default 280. */
  playlistPanelWidth: number;
}

/** Returns a Settings object populated with default values. */
export function defaultSettings(): Settings {
  return {
    breakTimerMinutes: DEFAULT_BREAK_TIMER_MINUTES,
    patterTimerMinutes: 5,
    playlistPanelWidth: DEFAULT_PLAYLIST_PANEL_WIDTH,
  };
}
