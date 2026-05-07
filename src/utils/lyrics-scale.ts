import { isPhoneLikeTouchDevice } from "./device-traits.js";

const LYRICS_SCALE_KEY = "cbLyricsScale";

const DEFAULT_DESKTOP_SCALE = 1.0;
const DEFAULT_PHONE_SCALE = 0.85; // ~15% smaller

const MIN_SCALE = 0.7;
const MAX_SCALE = 1.3;

const BASE_PT = 13;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function readStoredScale(): number | null {
  try {
    const raw = localStorage.getItem(LYRICS_SCALE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? clamp(n, MIN_SCALE, MAX_SCALE) : null;
  } catch {
    return null;
  }
}

function writeStoredScale(n: number): void {
  try {
    localStorage.setItem(LYRICS_SCALE_KEY, String(n));
  } catch {
    /* ignore */
  }
}

function defaultScale(): number {
  return isPhoneLikeTouchDevice() ? DEFAULT_PHONE_SCALE : DEFAULT_DESKTOP_SCALE;
}

function applyScaleToDocument(scale: number): void {
  const pt = BASE_PT * scale;
  document.documentElement.style.setProperty("--cb-lyrics-font-size", `${pt}pt`);
}

export function initLyricsScale(): number {
  const stored = readStoredScale();
  const scale = stored ?? defaultScale();
  applyScaleToDocument(scale);
  return scale;
}

export function getLyricsScale(): number {
  return readStoredScale() ?? defaultScale();
}

export function bumpLyricsScale(multiplier: number): number {
  const next = clamp(getLyricsScale() * multiplier, MIN_SCALE, MAX_SCALE);
  writeStoredScale(next);
  applyScaleToDocument(next);
  return next;
}
