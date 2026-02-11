/**
 * Application-wide settings persisted to settings.json in CallerBuddyRoot.
 * See CallerBuddySpec.md for descriptions of user-configurable values.
 */

/** Canonical default for break timer duration (minutes). Used by defaultSettings() and UI fallbacks. */
export const DEFAULT_BREAK_TIMER_MINUTES = 0.1;

export interface Settings {
  /** Break timer default duration in minutes (decimal allowed). Default 0.1 for testing. */
  breakTimerMinutes: number;
  /** Patter timer default duration in minutes. Default 5. */
  patterTimerMinutes: number;
}

/** Returns a Settings object populated with default values. */
export function defaultSettings(): Settings {
  return {
    breakTimerMinutes: DEFAULT_BREAK_TIMER_MINUTES,
    patterTimerMinutes: 5,
  };
}
