/**
 * Song data model.
 * See CallerBuddySpec.md "The Playlist Workflow" for field definitions.
 *
 * Filenames follow the convention: LABEL - TITLE.MP3
 * e.g., "RYL 607 - Come Sail Away.MP3"
 * Lyrics use the same base name with .HTML, .MD, or .TXT extension.
 */

/** All per-song metadata persisted to songs.json. */
export interface Song {
  /** Short recording-company label + number, e.g. "RYL 607" */
  label: string;
  /** Human-readable song title, e.g. "Come Sail Away" */
  title: string;
  /** Relative path to the music file within CallerBuddyRoot */
  musicFile: string;
  /** Relative path to lyrics file (HTML/MD/TXT) within CallerBuddyRoot, empty if none */
  lyricsFile: string;
  /** User-defined category tags (e.g. semicolon-separated: "Christmas; Patriotic") */
  categories: string;
  /** User preference rank; lower is better. Default 50 */
  rank: number;
  /**
   * Order in which the song was added to the library (larger = added later).
   * New entries use {@link nextOrderAdded} so each addition increments (per folder list).
   */
  orderAdded: number;
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

  /**
   * Runtime-only: the directory handle containing this song's files.
   * Set when songs are loaded by a playlist editor instance.
   * NOT persisted to songs.json — stripped by saveSongsJson().
   */
  dirHandle?: FileSystemDirectoryHandle;
}

/**
 * Strip runtime-only fields (dirHandle) from a Song for JSON serialization.
 * Returns a shallow copy without non-persistable properties.
 */
export function songForPersistence(song: Song): Omit<Song, "dirHandle"> {
  const { dirHandle: _, ...persistable } = song;
  return persistable;
}

function pickStr(o: Record<string, unknown>, key: string, fallback: string): string {
  const v = o[key];
  return typeof v === "string" ? v : fallback;
}

function pickNum(o: Record<string, unknown>, key: string, fallback: number): number {
  const v = o[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Overwritten when a new song is merged from a folder scan (see song-library `mergeSongs`). */
const PLACEHOLDER_ORDER_ADDED = 0;

/**
 * Parse one songs.json entry. Accepts legacy `category`; maps to `categories`.
 * Returns null if `musicFile` is missing or invalid.
 */
export function normalizeSongFromJson(raw: unknown): Song | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.musicFile !== "string" || !o.musicFile) return null;

  const lyricsFile =
    typeof o.lyricsFile === "string" ? o.lyricsFile : "";
  const base = createSongFromFile(o.musicFile, lyricsFile);

  const categories =
    typeof o.categories === "string"
      ? o.categories
      : typeof o.category === "string"
        ? o.category
        : base.categories;

  return {
    ...base,
    label: pickStr(o, "label", base.label),
    title: pickStr(o, "title", base.title),
    lyricsFile: pickStr(o, "lyricsFile", base.lyricsFile),
    categories,
    rank: pickNum(o, "rank", base.rank),
    orderAdded: pickNum(o, "orderAdded", PLACEHOLDER_ORDER_ADDED),
    lastUsed: pickStr(o, "lastUsed", base.lastUsed),
    loopStartTime: pickNum(o, "loopStartTime", base.loopStartTime),
    loopEndTime: pickNum(o, "loopEndTime", base.loopEndTime),
    volume: pickNum(o, "volume", base.volume),
    pitch: pickNum(o, "pitch", base.pitch),
    originalTempo: pickNum(o, "originalTempo", base.originalTempo),
    deltaTempo: pickNum(o, "deltaTempo", base.deltaTempo),
  };
}

/**
 * Largest `orderAdded` in the list (0 if none or all invalid).
 * Used when assigning sequential order to newly discovered songs.
 */
export function maxOrderAdded(songs: Song[]): number {
  let m = 0;
  for (const s of songs) {
    if (
      typeof s.orderAdded === "number" &&
      Number.isFinite(s.orderAdded) &&
      s.orderAdded > m
    ) {
      m = s.orderAdded;
    }
  }
  return m;
}

/** Next `orderAdded` for a new song: one greater than the current maximum in `songs`. */
export function nextOrderAdded(songs: Song[]): number {
  return maxOrderAdded(songs) + 1;
}

/** Supported music file extensions (lower-case, with dot). */
const MUSIC_EXTENSIONS = [".mp3", ".m4a", ".wav"];

/** Supported lyrics file extensions (lower-case, with dot). */
const LYRICS_EXTENSIONS = [".html", ".htm", ".md", ".txt"];

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

/** Derive a lyrics HTML filename from a music filename (same basename + ".html"). */
export function lyricsFilenameFor(musicFile: string): string {
  const dotIdx = musicFile.lastIndexOf(".");
  const base = dotIdx >= 0 ? musicFile.substring(0, dotIdx) : musicFile;
  return base + ".html";
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
    categories: "",
    rank: 50,
    orderAdded: PLACEHOLDER_ORDER_ADDED,
    lastUsed: "",
    loopStartTime: 0,
    loopEndTime: 0,
    volume: 80,
    pitch: 0,
    originalTempo: 0,
    deltaTempo: 0,
  };
}
