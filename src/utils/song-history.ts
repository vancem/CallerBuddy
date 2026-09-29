/**
 * CallerBuddyHistory.csv: one row per qualifying play.
 * Column 1 is the CallerBuddyRoot-relative music path; column 2 is an ISO date-time.
 * Display fields (title, rank, weight, label) are joined from the song catalog.
 */

import { isSingingCall, parseMusicFilename, type Song } from "../models/song.js";
import { displayPlayWeight } from "./play-history.js";

export const SONG_HISTORY_CSV = "CallerBuddyHistory.csv";
export const SONG_HISTORY_HEADER = "path,playedAt";

export interface SongHistoryEntry {
  /** CallerBuddyRoot-relative music path, using "/" separators. */
  path: string;
  /** ISO-8601 date-time when the play was recorded. */
  playedAt: string;
}

export interface SongHistoryDisplayRow {
  path: string;
  playedAtMs: number;
  /** Position in the file; later rows win ties on the same timestamp. */
  seq: number;
  title: string;
  /** Null when the path is no longer in the song catalog. */
  rank: number | null;
  /** Current weighted play metric, or null when the song is not in the catalog. */
  played: number | null;
  label: string;
  /** True for a singing call, false for patter, null when the song is not in the catalog. */
  singing: boolean | null;
}

/** RFC 4180 field quoting. */
export function csvEscapeField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatSongHistoryLine(entry: SongHistoryEntry): string {
  const path = entry.path.replace(/\\/g, "/");
  return `${csvEscapeField(path)},${csvEscapeField(entry.playedAt)}`;
}

/**
 * Bytes to append. A missing or empty file gets the header row first.
 * A file that does not already end in a newline gets one before the new row.
 */
export function songHistoryAppendText(
  existing: string | null,
  entry: SongHistoryEntry,
): string {
  const line = `${formatSongHistoryLine(entry)}\n`;
  if (existing === null || existing.length === 0) {
    return `${SONG_HISTORY_HEADER}\n${line}`;
  }
  if (!existing.endsWith("\n")) return `\n${line}`;
  return line;
}

/** Parse CSV text into records. Supports quoted fields and CRLF. */
export function parseCsvRecords(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (!(row.length === 1 && row[0] === "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
  }
  return rows;
}

function isHistoryHeader(record: string[]): boolean {
  return (
    (record[0] ?? "").trim().toLowerCase() === "path" &&
    (record[1] ?? "").trim().toLowerCase() === "playedat"
  );
}

/** Parse CallerBuddyHistory.csv. Skips the header, blank lines, and rows with no path. */
export function parseSongHistoryCsv(text: string): SongHistoryEntry[] {
  const entries: SongHistoryEntry[] = [];
  for (const record of parseCsvRecords(text)) {
    if (isHistoryHeader(record)) continue;
    const path = (record[0] ?? "").trim().replace(/\\/g, "/");
    const playedAt = (record[1] ?? "").trim();
    if (!path || !playedAt) continue;
    entries.push({ path, playedAt });
  }
  return entries;
}

/** Split a CallerBuddyRoot-relative music path into folder + file name. */
export function splitRootRelativeMusicPath(path: string): {
  folder: string;
  musicFile: string;
} {
  const norm = path.replace(/\\/g, "/");
  const slash = norm.lastIndexOf("/");
  if (slash < 0) return { folder: "", musicFile: norm };
  return { folder: norm.slice(0, slash), musicFile: norm.slice(slash + 1) };
}

export function historyPathKey(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

/**
 * Join history rows to current song metadata.
 * `songsByPath` keys are lowercased CallerBuddyRoot-relative paths.
 */
export function buildSongHistoryDisplayRows(
  entries: SongHistoryEntry[],
  songsByPath: Map<string, Song>,
  nowMs: number,
): SongHistoryDisplayRow[] {
  const rows: SongHistoryDisplayRow[] = [];
  entries.forEach((entry, seq) => {
    const playedAtMs = Date.parse(entry.playedAt);
    if (!entry.path.trim() || !Number.isFinite(playedAtMs)) return;
    const song = songsByPath.get(historyPathKey(entry.path));
    const { musicFile } = splitRootRelativeMusicPath(entry.path);
    const parsed = parseMusicFilename(musicFile);
    if (song) {
      rows.push({
        path: entry.path,
        playedAtMs,
        seq,
        title: song.title,
        rank: song.rank,
        played: displayPlayWeight(song.playWeight, song.lastUsed, nowMs),
        label: song.label,
        singing: isSingingCall(song),
      });
    } else {
      rows.push({
        path: entry.path,
        playedAtMs,
        seq,
        title: parsed?.title || musicFile || entry.path,
        rank: null,
        played: null,
        label: parsed?.label ?? "",
        singing: null,
      });
    }
  });
  return rows;
}

/** Newest play first. Equal timestamps keep the later file row first. */
export function sortSongHistoryNewestFirst(
  rows: SongHistoryDisplayRow[],
): SongHistoryDisplayRow[] {
  return [...rows].sort((a, b) => b.playedAtMs - a.playedAtMs || b.seq - a.seq);
}
