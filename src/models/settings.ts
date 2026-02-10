/**
 * Application-wide settings persisted to settings.json in CallerBuddyRoot.
 * See CallerBuddySpec.md for descriptions of user-configurable values.
 */

export interface Settings {
  /** Break timer default duration in minutes. Default 5. */
  breakTimerMinutes: number;
  /** Patter timer default duration in minutes. Default 5. */
  patterTimerMinutes: number;
}

/** Returns a Settings object populated with default values. */
export function defaultSettings(): Settings {
  return {
    breakTimerMinutes: 5,
    patterTimerMinutes: 5,
  };
}
