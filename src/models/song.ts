/**
 * Song data model.
 * See CallerBuddySpec.md "The Playlist Workflow" for field definitions.
 *
 * Filenames follow the convention: LABEL - TITLE.MP3
 * e.g., "RYL 607 - Come Sail Away.MP3"
 * Lyrics use the same base name with .HTML or .MD extension.
 */

/** All per-song metadata persisted to songs.json. */
export interface Song {
  /** Short recording-company label + number, e.g. "RYL 607" */
  label: string;
  /** Human-readable song title, e.g. "Come Sail Away" */
  title: string;
  /** Relative path to the music file within CallerBuddyRoot */
  musicFile: string;
  /** Relative path to lyrics file (HTML/MD) within CallerBuddyRoot, empty if none */
  lyricsFile: string;
  /** User-defined category string (e.g., "Christmas", "Patriotic") */
  category: string;
  /** User preference rank; lower is better. Default 50 */
  rank: number;
  /** ISO timestamp when first seen by CallerBuddy */
  dateAdded: string;
  /** ISO timestamp of last time played. Empty string if never played */
  lastUsed: string;
  /** Time in seconds from start where looping jumps to. Default 0 */
  loopStartTime: number;
  /** Time in seconds where song loops back to loopStartTime. 0 = no looping */
  loopEndTime: number;
  /** Volume 0-100. Default 80 */
  volume: number;
  /** Pitch adjustment in half-steps (signed integer). Default 0 */
  pitch: number;
  /** Original tempo in BPM. 0 = unknown */
  originalTempo: number;
  /** Tempo adjustment in BPM (signed). Default 0 */
  deltaTempo: number;
}

/** Supported music file extensions (lower-case, with dot). */
const MUSIC_EXTENSIONS = [".mp3", ".wav"];

/** Supported lyrics file extensions (lower-case, with dot). */
const LYRICS_EXTENSIONS = [".html", ".htm", ".md"];

/** True if song has lyrics (and is therefore a singing call, not patter). */
export function isSingingCall(song: Song): boolean {
  return song.lyricsFile !== "";
}

/** True if song is a patter call (no lyrics). */
export function isPatter(song: Song): boolean {
  return song.lyricsFile === "";
}

/** True if the filename (lower-cased) has a recognized music extension. */
export function isMusicFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return MUSIC_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** True if the filename (lower-cased) has a recognized lyrics extension. */
export function isLyricsFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return LYRICS_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Parses a music filename into label and title components.
 * Expected format: "LABEL - TITLE.ext"
 *
 * Returns { label, title } or null if the filename has no extension.
 * If no " - " separator is found, label is empty and title is the base name.
 */
export function parseMusicFilename(
  filename: string,
): { label: string; title: string } | null {
  const dotIdx = filename.lastIndexOf(".");
  if (dotIdx < 0) return null;
  const base = filename.substring(0, dotIdx);

  const sepIdx = base.indexOf(" - ");
  if (sepIdx < 0) {
    return { label: "", title: base.trim() };
  }
  return {
    label: base.substring(0, sepIdx).trim(),
    title: base.substring(sepIdx + 3).trim(),
  };
}

/**
 * Returns the base name (without extension) for matching music ↔ lyrics files.
 * e.g., "RYL 607 - Come Sail Away.MP3" → "ryl 607 - come sail away" (lower-cased).
 */
export function baseName(filename: string): string {
  const dotIdx = filename.lastIndexOf(".");
  const base = dotIdx >= 0 ? filename.substring(0, dotIdx) : filename;
  return base.toLowerCase();
}

/** Create a Song with sensible defaults from a music filename and optional lyrics path. */
export function createSongFromFile(
  musicFile: string,
  lyricsFile: string = "",
): Song {
  const parsed = parseMusicFilename(musicFile) ?? {
    label: "",
    title: musicFile,
  };
  return {
    label: parsed.label,
    title: parsed.title,
    musicFile,
    lyricsFile,
    category: "",
    rank: 50,
    dateAdded: new Date().toISOString(),
    lastUsed: "",
    loopStartTime: 0,
    loopEndTime: 0,
    volume: 80,
    pitch: 0,
    originalTempo: 0,
    deltaTempo: 0,
  };
}
