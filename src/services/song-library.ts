/**
 * Song library: scanning folders for music/lyrics and reading/writing songs.json.
 *
 * When CallerBuddyRoot is set, this module scans for MP3, M4A, and WAV files, pairs
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
  normalizeSongFromJson,
  maxOrderAdded,
} from "../models/song.js";
import {
  listDirectory,
  readTextFile,
  writeTextFile,
  fileExists,
} from "./file-system-service.js";
import { log, assert } from "./logger.js";

const SONGS_JSON = "songs.json";

/** Max fraction of persisted entries removable in one pass before scan is treated as suspicious. */
const MAX_ORPHAN_DROP_FRACTION = 0.5;

/** musicFile values seen missing once; removed after a second consecutive miss. */
const pendingOrphanRemovals = new Map<string, Set<string>>();

/** Reset in-memory orphan confirmation state (for tests). */
export function resetOrphanRemovalPendingForTests(): void {
  pendingOrphanRemovals.clear();
}

function folderKey(dirHandle: FileSystemDirectoryHandle): string {
  return dirHandle.name;
}

/** True when scan results are too incomplete to trust orphan removal. */
export function isSuspiciousScan(
  scannedCount: number,
  persistedCount: number,
  orphanCount: number,
): boolean {
  if (persistedCount === 0 || orphanCount === 0) return false;
  if (scannedCount === 0) return true;
  return orphanCount / persistedCount > MAX_ORPHAN_DROP_FRACTION;
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

/**
 * Scan a directory for music and lyrics files and produce a Song list.
 * Filenames come verbatim from the directory listing. Lyrics are paired by
 * base name (see {@link baseName}) so ".MP3" / ".html" extension case can differ.
 *
 * Does NOT recurse into subdirectories (playlist editor handles folder
 * navigation; scanner operates on one folder at a time).
 */
export async function scanDirectory(
  dirHandle: FileSystemDirectoryHandle,
): Promise<Song[]> {
  const entries = await listDirectory(dirHandle);

  const musicFiles: string[] = [];
  const lyricsMap = new Map<string, string>(); // baseName → filename on disk

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
  const text = await readTextFile(dirHandle, SONGS_JSON);
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch (err) {
    log.error("Failed to parse songs.json:", err);
    throw new Error("songs.json is not valid JSON");
  }
  assert(Array.isArray(data), "songs.json must contain an array");
  const songs: Song[] = [];
  let skipped = 0;
  for (const raw of data) {
    const song = normalizeSongFromJson(raw);
    if (song) songs.push(song);
    else skipped++;
  }
  if (skipped > 0) {
    log.warn(`loadSongsJson: skipped ${skipped} invalid entr${skipped === 1 ? "y" : "ies"}`);
  }
  log.info(`Loaded ${songs.length} songs from songs.json`);
  return songs;
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
 *  - Match by exact musicFile, else by label (e.g. after a Windows → Android move).
 *  - musicFile and lyricsFile always come from the scan (verbatim directory names).
 *  - New songs (on disk but not matched) get sequential orderAdded.
 *  - Unmatched persisted entries are handled by {@link applyConservativeOrphanCleanup}.
 */
export function mergeSongs(scanned: Song[], persisted: Song[]): Song[] {
  const persistedByFile = new Map<string, Song>();
  const persistedByLabel = new Map<string, Song>();
  for (const song of persisted) {
    persistedByFile.set(song.musicFile, song);
    if (song.label) persistedByLabel.set(song.label, song);
  }

  const merged: Song[] = [];
  let nextOrder = maxOrderAdded(persisted) + 1;

  for (const fresh of scanned) {
    const existing =
      persistedByFile.get(fresh.musicFile) ??
      (fresh.label ? persistedByLabel.get(fresh.label) : undefined);
    if (existing) {
      merged.push({
        ...existing,
        musicFile: fresh.musicFile,
        lyricsFile: fresh.lyricsFile,
      });
    } else {
      merged.push({ ...fresh, orderAdded: nextOrder });
      nextOrder += 1;
    }
  }

  return merged;
}

/**
 * Reconcile persisted entries missing from the scan with conservative cleanup:
 * verify each orphan with fileExists, skip removal on suspicious scans, and
 * require two consecutive missed scans before deleting from songs.json.
 */
export async function applyConservativeOrphanCleanup(
  merged: Song[],
  scanned: Song[],
  persisted: Song[],
  dirHandle: FileSystemDirectoryHandle,
): Promise<Song[]> {
  const scannedNames = new Set(scanned.map((s) => s.musicFile));
  // Base result is scan-derived entries only; orphans are re-added only when kept.
  const result = merged.filter((s) => scannedNames.has(s.musicFile));
  const resultNames = new Set(result.map((s) => s.musicFile));
  const orphans = persisted.filter((s) => !scannedNames.has(s.musicFile));

  const recovered: Song[] = [];
  const stillMissing: Song[] = [];
  for (const song of orphans) {
    if (await fileExists(dirHandle, song.musicFile)) {
      recovered.push(song);
    } else {
      stillMissing.push(song);
    }
  }

  const key = folderKey(dirHandle);
  const pending = pendingOrphanRemovals.get(key) ?? new Set<string>();
  for (const song of scanned) {
    pending.delete(song.musicFile);
  }
  for (const song of recovered) {
    pending.delete(song.musicFile);
  }

  const suspicious = isSuspiciousScan(
    scanned.length,
    persisted.length,
    stillMissing.length,
  );

  const kept: Song[] = [...recovered];
  const removed: Song[] = [];

  if (suspicious) {
    kept.push(...stillMissing);
    if (stillMissing.length > 0) {
      log.info(
        `Skipped orphan removal for ${stillMissing.length} song(s): suspicious scan ` +
          `(scanned=${scanned.length}, persisted=${persisted.length})`,
      );
    }
  } else {
    for (const song of stillMissing) {
      if (pending.has(song.musicFile)) {
        removed.push(song);
        pending.delete(song.musicFile);
      } else {
        pending.add(song.musicFile);
        kept.push(song);
      }
    }
  }

  pendingOrphanRemovals.set(key, pending);

  if (removed.length > 0) {
    log.info(
      `Removed ${removed.length} song(s) from songs.json with no audio file on disk: ` +
        removed.map((s) => s.musicFile).join(", "),
    );
  }

  const awaitingConfirm = stillMissing.filter((s) => pending.has(s.musicFile));
  if (awaitingConfirm.length > 0 && !suspicious) {
    log.info(
      `Orphan removal pending confirmation (${awaitingConfirm.length}): ` +
        awaitingConfirm.map((s) => s.musicFile).join(", "),
    );
  }

  for (const song of kept) {
    if (!resultNames.has(song.musicFile)) {
      result.push(song);
      resultNames.add(song.musicFile);
    }
  }

  return result;
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
  const finalSongs = await applyConservativeOrphanCleanup(
    merged,
    scanned,
    persisted,
    dirHandle,
  );
  log.info(`loadAndMergeSongs: merged=${finalSongs.length}, saving songs.json…`);

  // Persist the merged result so new songs are saved
  try {
    await saveSongsJson(dirHandle, finalSongs);
    log.info("loadAndMergeSongs: songs.json saved");
  } catch (err) {
    log.warn("loadAndMergeSongs: could not save songs.json:", err);
  }
  return finalSongs;
}
