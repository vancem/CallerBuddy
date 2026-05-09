/**
 * Lyrics font scaling via `--cb-lyrics-font-size` on `:root`.
 *
 * Two persisted scales in settings.json: desktop (wide viewport) and phone
 * (narrow ≤ ~700px), matching song-play split layout. The active scale follows
 * window size (resize updates which multiplier applies).
 */

import { callerBuddy } from "../caller-buddy.js";
import type { Settings } from "../models/settings.js";
import { LYRICS_FONT_SCALE_MAX, LYRICS_FONT_SCALE_MIN } from "../models/settings.js";

const BASE_PT = 13;

const LEGACY_LS_SINGLE = "cbLyricsScale";
const LEGACY_MIGRATION_FLAG = "callerbuddy.lyricsScaleLegacyMigrated";
const LS_DESKTOP = "cbLyricsFontScaleDesktop";
const LS_PHONE = "cbLyricsFontScalePhone";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Narrow vs wide breakpoint aligned with `song-play` mobile split (~700px).
 * Uses window metrics so lyrics scale stays consistent outside song-play.
 */
export function isLyricsScalePhoneLayout(): boolean {
  const inner = window.innerWidth;
  if (inner >= 16) {
    return inner <= 700;
  }
  const short = Math.min(screen.width, screen.height);
  if (inner > short * 1.2 && window.matchMedia("(orientation: portrait)").matches) {
    return true;
  }
  return window.matchMedia("(max-width: 700px)").matches;
}

function pickScaleForLayout(settings: Settings): number {
  return isLyricsScalePhoneLayout()
    ? settings.lyricsFontScalePhone
    : settings.lyricsFontScaleDesktop;
}

function applyScaleToDocument(scale: number): void {
  const pt = BASE_PT * scale;
  document.documentElement.style.setProperty("--cb-lyrics-font-size", `${pt}pt`);
}

/** Apply the scale that matches current layout from in-memory settings. */
export function applyLyricsFontScaleFromSettings(): void {
  const scale = pickScaleForLayout(callerBuddy.state.settings);
  applyScaleToDocument(scale);
}

export function persistLyricsScaleMirror(): void {
  mirrorLyricsScalesToLocalStorage(callerBuddy.state.settings);
}

function mirrorLyricsScalesToLocalStorage(settings: Settings): void {
  try {
    localStorage.setItem(LS_DESKTOP, String(settings.lyricsFontScaleDesktop));
    localStorage.setItem(LS_PHONE, String(settings.lyricsFontScalePhone));
  } catch {
    /* ignore */
  }
}

/** Merge optional localStorage mirrors before settings.json exists (welcome screen). */
function mergeLyricsScalesFromLocalStorage(): void {
  try {
    const d = localStorage.getItem(LS_DESKTOP);
    const p = localStorage.getItem(LS_PHONE);
    if (d === null && p === null) return;
    const cur = callerBuddy.state.settings;
    let next = cur;
    if (d !== null) {
      const n = clamp(Number(d), LYRICS_FONT_SCALE_MIN, LYRICS_FONT_SCALE_MAX);
      if (Number.isFinite(n)) next = { ...next, lyricsFontScaleDesktop: n };
    }
    if (p !== null) {
      const n = clamp(Number(p), LYRICS_FONT_SCALE_MIN, LYRICS_FONT_SCALE_MAX);
      if (Number.isFinite(n)) next = { ...next, lyricsFontScalePhone: n };
    }
    if (next !== cur) callerBuddy.state.setSettings(next);
  } catch {
    /* ignore */
  }
}

function migrateLegacySingleLocalStorageScale(): void {
  try {
    if (localStorage.getItem(LEGACY_MIGRATION_FLAG)) return;
    const raw = localStorage.getItem(LEGACY_LS_SINGLE);
    if (!raw) return;
    const n = clamp(Number(raw), LYRICS_FONT_SCALE_MIN, LYRICS_FONT_SCALE_MAX);
    if (!Number.isFinite(n)) return;
    localStorage.setItem(LEGACY_MIGRATION_FLAG, "1");
    localStorage.removeItem(LEGACY_LS_SINGLE);
    const cur = callerBuddy.state.settings;
    callerBuddy.state.setSettings({
      ...cur,
      lyricsFontScaleDesktop: n,
      lyricsFontScalePhone: n,
    });
    mirrorLyricsScalesToLocalStorage(callerBuddy.state.settings);
  } catch {
    /* ignore */
  }
}

/**
 * One-time merge when loading settings.json from disk: if the file predates the
 * dual-scale fields and legacy `cbLyricsScale` exists, apply it to both scales.
 */
export function mergeLegacyLyricsScaleFromDisk(
  normalized: Settings,
  rawFile: Record<string, unknown>,
): Settings {
  try {
    if (localStorage.getItem(LEGACY_MIGRATION_FLAG)) return normalized;
    const hadDesktop = Object.prototype.hasOwnProperty.call(rawFile, "lyricsFontScaleDesktop");
    const hadPhone = Object.prototype.hasOwnProperty.call(rawFile, "lyricsFontScalePhone");
    if (hadDesktop && hadPhone) return normalized;

    const legacy = localStorage.getItem(LEGACY_LS_SINGLE);
    if (!legacy) return normalized;
    const n = clamp(Number(legacy), LYRICS_FONT_SCALE_MIN, LYRICS_FONT_SCALE_MAX);
    if (!Number.isFinite(n)) return normalized;

    localStorage.setItem(LEGACY_MIGRATION_FLAG, "1");
    localStorage.removeItem(LEGACY_LS_SINGLE);

    return {
      ...normalized,
      lyricsFontScaleDesktop: hadDesktop ? normalized.lyricsFontScaleDesktop : n,
      lyricsFontScalePhone: hadPhone ? normalized.lyricsFontScalePhone : n,
    };
  } catch {
    return normalized;
  }
}

export function initLyricsScale(): void {
  mergeLyricsScalesFromLocalStorage();
  migrateLegacySingleLocalStorageScale();
  applyLyricsFontScaleFromSettings();
  window.addEventListener("resize", () => applyLyricsFontScaleFromSettings());
}

export function getLyricsScale(): number {
  return pickScaleForLayout(callerBuddy.state.settings);
}

/** Step lyrics size up/down (~10%) for the current layout bucket; persists settings + local mirror. */
export async function bumpLyricsScale(multiplier: number): Promise<number> {
  const phone = isLyricsScalePhoneLayout();
  const key = phone ? "lyricsFontScalePhone" : "lyricsFontScaleDesktop";
  const cur = callerBuddy.state.settings[key];
  const next = clamp(cur * multiplier, LYRICS_FONT_SCALE_MIN, LYRICS_FONT_SCALE_MAX);
  await callerBuddy.updateSetting(key, next);
  mirrorLyricsScalesToLocalStorage(callerBuddy.state.settings);
  applyLyricsFontScaleFromSettings();
  return next;
}
