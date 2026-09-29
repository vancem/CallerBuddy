/**
 * Read and append CallerBuddyHistory.csv in CallerBuddyRoot, and join rows
 * to CallerBuddySongs.json for the Song History view.
 */

import { log } from "./logger.js";
import { loadSongsJson } from "./song-library.js";
import {
  appendTextFile,
  fileExists,
  readTextFile,
} from "./file-system-service.js";
import type { Song } from "../models/song.js";
import {
  SONG_HISTORY_CSV,
  buildSongHistoryDisplayRows,
  historyPathKey,
  parseSongHistoryCsv,
  songHistoryAppendText,
  sortSongHistoryNewestFirst,
  splitRootRelativeMusicPath,
  type SongHistoryDisplayRow,
  type SongHistoryEntry,
} from "../utils/song-history.js";

export type { SongHistoryDisplayRow, SongHistoryEntry };

let appendQueue: Promise<unknown> = Promise.resolve();

/** Test hook so a failed append in one test cannot block the next. */
export function resetSongHistoryAppendQueueForTests(): void {
  appendQueue = Promise.resolve();
}

async function resolveSubdir(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const part of relativePath.split("/")) {
    if (!part) continue;
    dir = await dir.getDirectoryHandle(part);
  }
  return dir;
}

async function appendSongHistoryNow(
  root: FileSystemDirectoryHandle,
  entry: SongHistoryEntry,
): Promise<void> {
  const path = entry.path.replace(/\\/g, "/").trim();
  if (!path) {
    log.warn("song history: empty path; skipped");
    return;
  }
  const exists = await fileExists(root, SONG_HISTORY_CSV);
  const existing = exists ? await readTextFile(root, SONG_HISTORY_CSV) : null;
  const chunk = songHistoryAppendText(existing, { path, playedAt: entry.playedAt });
  await appendTextFile(root, SONG_HISTORY_CSV, chunk);
}

/** Append one play. Calls are serialized so two closes cannot interleave. */
export function appendSongHistory(
  root: FileSystemDirectoryHandle,
  entry: SongHistoryEntry,
): Promise<void> {
  const run = appendQueue.then(() => appendSongHistoryNow(root, entry));
  appendQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function indexSongsForHistory(
  root: FileSystemDirectoryHandle,
  entries: SongHistoryEntry[],
): Promise<Map<string, Song>> {
  const folders = new Set<string>();
  for (const entry of entries) {
    folders.add(splitRootRelativeMusicPath(entry.path).folder);
  }
  const songsByPath = new Map<string, Song>();
  for (const folder of folders) {
    try {
      const dir = folder ? await resolveSubdir(root, folder) : root;
      const songs = await loadSongsJson(dir);
      for (const song of songs) {
        const full = folder ? `${folder}/${song.musicFile}` : song.musicFile;
        songsByPath.set(historyPathKey(full), song);
      }
    } catch (err) {
      log.warn(`song history: could not load songs in "${folder || "(root)"}":`, err);
    }
  }
  return songsByPath;
}

/**
 * History rows for display, newest play first.
 * Returns [] when CallerBuddyHistory.csv does not exist yet.
 */
export async function loadSongHistoryDisplay(
  root: FileSystemDirectoryHandle,
  nowMs: number = Date.now(),
): Promise<SongHistoryDisplayRow[]> {
  if (!(await fileExists(root, SONG_HISTORY_CSV))) return [];
  const text = await readTextFile(root, SONG_HISTORY_CSV);
  const entries = parseSongHistoryCsv(text);
  const songsByPath = await indexSongsForHistory(root, entries);
  return sortSongHistoryNewestFirst(
    buildSongHistoryDisplayRows(entries, songsByPath, nowMs),
  );
}
