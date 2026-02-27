/**
 * Song library: scanning folders for music/lyrics and reading/writing songs.json.
 *
 * When CallerBuddyRoot is set, this module scans for MP3 (and WAV) files, pairs
 * them with matching lyrics files, and builds or updates the songs.json catalog.
 *
 * File naming convention: "LABEL - TITLE.ext"
 * See CallerBuddySpec.md §"The Playlist Workflow" and models/song.ts.
 */

import {
  type Song,
  isMusicFile,
  isLyricsFile,
  baseName,
  createSongFromFile,
  songForPersistence,
} from "../models/song.js";
import {
  listDirectory,
  readTextFile,
  writeTextFile,
  fileExists,
} from "./file-system-service.js";
import { log, assert } from "./logger.js";

const SONGS_JSON = "songs.json";

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

/**
 * Scan a directory for music and lyrics files and produce a Song list.
 * Music and lyrics are matched by base name (case-insensitive).
 *
 * Does NOT recurse into subdirectories (playlist editor handles folder
 * navigation; scanner operates on one folder at a time).
 */
export async function scanDirectory(
  dirHandle: FileSystemDirectoryHandle,
): Promise<Song[]> {
  const entries = await listDirectory(dirHandle);

  const musicFiles: string[] = [];
  const lyricsMap = new Map<string, string>(); // lower-base → filename

  for (const entry of entries) {
    if (entry.kind !== "file") continue;
    if (isMusicFile(entry.name)) {
      musicFiles.push(entry.name);
    } else if (isLyricsFile(entry.name)) {
      lyricsMap.set(baseName(entry.name), entry.name);
    }
  }

  const songs: Song[] = [];
  for (const file of musicFiles) {
    const base = baseName(file);
    const lyricsFile = lyricsMap.get(base) ?? "";
    songs.push(createSongFromFile(file, lyricsFile));
  }

  log.info(`Scanned directory: found ${songs.length} songs`);
  return songs;
}

// ---------------------------------------------------------------------------
// Persistence (songs.json)
// ---------------------------------------------------------------------------

/** Load songs.json from the directory. Returns [] if the file doesn't exist. */
export async function loadSongsJson(
  dirHandle: FileSystemDirectoryHandle,
): Promise<Song[]> {
  const exists = await fileExists(dirHandle, SONGS_JSON);
  if (!exists) {
    log.info("No songs.json found; starting fresh.");
    return [];
  }
  try {
    const text = await readTextFile(dirHandle, SONGS_JSON);
    const data = JSON.parse(text) as unknown;
    assert(Array.isArray(data), "songs.json must contain an array");
    log.info(`Loaded ${(data as Song[]).length} songs from songs.json`);
    return data as Song[];
  } catch (err) {
    log.error("Failed to load songs.json:", err);
    return [];
  }
}

/** Save songs array to songs.json in the directory. Strips runtime-only fields. */
export async function saveSongsJson(
  dirHandle: FileSystemDirectoryHandle,
  songs: Song[],
): Promise<void> {
  const clean = songs.map(songForPersistence);
  const json = JSON.stringify(clean, null, 2);
  await writeTextFile(dirHandle, SONGS_JSON, json);
  log.info(`Saved ${songs.length} songs to songs.json`);
}

// ---------------------------------------------------------------------------
// Merging scanned results with persisted data
// ---------------------------------------------------------------------------

/**
 * Merge freshly scanned songs with previously persisted songs.
 *
 * Strategy:
 *  - Songs present in both (matched by musicFile) keep the persisted metadata
 *    but update the lyricsFile if a matching lyrics file was found on disk.
 *  - New songs (on disk but not in persisted) are added with defaults.
 *  - Songs in persisted but missing on disk are kept (the file might be
 *    temporarily unavailable, e.g. cloud sync lag).
 */
export function mergeSongs(scanned: Song[], persisted: Song[]): Song[] {
  const persistedMap = new Map<string, Song>();
  for (const song of persisted) {
    persistedMap.set(song.musicFile.toLowerCase(), song);
  }

  const merged: Song[] = [];
  const seen = new Set<string>();

  for (const fresh of scanned) {
    const key = fresh.musicFile.toLowerCase();
    seen.add(key);
    const existing = persistedMap.get(key);
    if (existing) {
      // Keep persisted metadata, refresh lyrics in case a new lyrics file appeared
      merged.push({ ...existing, lyricsFile: fresh.lyricsFile });
    } else {
      merged.push(fresh);
    }
  }

  // Retain songs that were persisted but not found on disk this time
  for (const song of persisted) {
    if (!seen.has(song.musicFile.toLowerCase())) {
      merged.push(song);
    }
  }

  return merged;
}

/**
 * Full load sequence: scan the directory, load persisted songs.json, merge,
 * and persist the result. Returns the merged song list.
 */
export async function loadAndMergeSongs(
  dirHandle: FileSystemDirectoryHandle,
): Promise<Song[]> {
  log.info(`loadAndMergeSongs: scanning "${dirHandle.name}"…`);
  // Run sequentially to avoid concurrent use of the same directory handle, which
  // can hang in some environments (e.g. handle.values() and getFileHandle).
  const persisted = await loadSongsJson(dirHandle);
  const scanned = await scanDirectory(dirHandle);
  log.info(
    `loadAndMergeSongs: scanned=${scanned.length}, persisted=${persisted.length}`,
  );
  const merged = mergeSongs(scanned, persisted);
  log.info(`loadAndMergeSongs: merged=${merged.length}, saving songs.json…`);

  // Persist the merged result so new songs are saved
  try {
    await saveSongsJson(dirHandle, merged);
    log.info("loadAndMergeSongs: songs.json saved");
  } catch (err) {
    log.warn("loadAndMergeSongs: could not save songs.json:", err);
  }
  return merged;
}
