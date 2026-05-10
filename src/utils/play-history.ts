/**
 * Play history: exponential decay weight (28-day half-life) and qualification
 * threshold for counting a “played” session in songs.json.
 */

import type { Song } from "../models/song.js";

export const PLAY_HISTORY_HALF_LIFE_DAYS = 28;

/** Minimum wall time since lastUsed before another qualifying play bumps lastUsed / playWeight. */
export const PLAY_STATS_UPDATE_MIN_INTERVAL_MS = 3 * 60 * 60 * 1000;

const MS_PER_DAY = 86400000;
const MIN_TEMPO_RATIO = 0.5;
const MAX_TEMPO_RATIO = 2.0;
const DEFAULT_REFERENCE_BPM = 128;

/** Reference BPM when computing tempo ratio, matching WebAudioEngine behavior. */
export function referenceBpmForSong(song: Pick<Song, "originalTempo">): number {
  return song.originalTempo > 0 ? song.originalTempo : DEFAULT_REFERENCE_BPM;
}

/** Tempo ratio (source seconds per wall second), clamped like WebAudioEngine.setTempo. */
export function tempoRatioFromSong(song: Pick<Song, "originalTempo" | "deltaTempo">): number {
  const ref = referenceBpmForSong(song);
  const ratio = (ref + song.deltaTempo) / ref;
  return Math.max(MIN_TEMPO_RATIO, Math.min(MAX_TEMPO_RATIO, ratio));
}

/** Minimum accumulated playing wall time (seconds) to count as a full play (90% of one pass at current tempo). */
export function qualifyingPlayWallSeconds(
  durationSec: number,
  tempoRatio: number,
): number {
  if (!(durationSec > 0) || !Number.isFinite(durationSec)) return Number.POSITIVE_INFINITY;
  const r = Math.max(tempoRatio, 1e-6);
  return (0.9 * durationSec) / r;
}

/** Fractional days from lastUsed ISO to nowMs; 0 if lastUsed empty or invalid. */
export function daysSinceLastUsedMs(lastUsedIso: string, nowMs: number): number {
  if (!lastUsedIso.trim()) return 0;
  const t = Date.parse(lastUsedIso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (nowMs - t) / MS_PER_DAY);
}

/**
 * Whether to persist a new lastUsed and playWeight after a qualifying play.
 * Always true when lastUsed is missing or invalid; otherwise requires the
 * interval in {@link PLAY_STATS_UPDATE_MIN_INTERVAL_MS}.
 */
export function shouldRefreshPlayStats(
  lastUsedIso: string,
  nowMs: number,
  minIntervalMs: number = PLAY_STATS_UPDATE_MIN_INTERVAL_MS,
): boolean {
  if (!lastUsedIso.trim()) return true;
  const t = Date.parse(lastUsedIso);
  if (!Number.isFinite(t)) return true;
  const elapsedMs = Math.max(0, nowMs - t);
  return elapsedMs >= minIntervalMs;
}

export function nextPlayWeight(wOld: number, deltaDays: number): number {
  return 1 + Math.pow(2, -deltaDays / PLAY_HISTORY_HALF_LIFE_DAYS) * wOld;
}

/** Scaled display weight; 0 if never played (no lastUsed) or non-finite inputs. */
export function displayPlayWeight(
  w: number,
  lastUsedIso: string,
  nowMs: number,
): number {
  if (!lastUsedIso.trim()) return 0;
  const wSafe = typeof w === "number" && Number.isFinite(w) ? w : 0;
  if (!Number.isFinite(nowMs)) return 0;
  const deltaDays = daysSinceLastUsedMs(lastUsedIso, nowMs);
  const decay = Math.pow(2, -deltaDays / PLAY_HISTORY_HALF_LIFE_DAYS);
  const out = wSafe * decay;
  return Number.isFinite(out) ? out : 0;
}
