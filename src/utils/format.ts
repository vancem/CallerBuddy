/**
 * Shared formatting utilities for time display.
 */

/** Format seconds as "M:SS" (unsigned). */
export function formatTime(seconds: number): string {
  const abs = Math.abs(Math.floor(seconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Format seconds as a signed countdown: "M:SS" or "-M:SS". */
export function formatCountdown(totalSeconds: number): string {
  const abs = Math.abs(totalSeconds);
  const sign = totalSeconds < 0 ? "-" : "";
  const min = Math.floor(abs / 60);
  const sec = abs % 60;
  return `${sign}${min}:${sec.toString().padStart(2, "0")}`;
}

/** Return the current time as a localized "HH:MM" string. */
export function formatClock(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
