import { describe, expect, it } from "vitest";
import { createSongFromFile } from "../models/song.js";
import { lastUsedIsoFromMs } from "./play-history.js";
import {
  SONG_HISTORY_HEADER,
  buildSongHistoryDisplayRows,
  formatLocalPlayedAt,
  formatSongHistoryLine,
  parseSongHistoryCsv,
  songHistoryAppendText,
  sortSongHistoryNewestFirst,
} from "./song-history.js";

describe("formatLocalPlayedAt", () => {
  it("uses local time, a numeric offset, and whole minutes", () => {
    const ms = Date.parse("2026-09-29T21:41:24.889Z");
    const formatted = formatLocalPlayedAt(ms);
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(Date.parse(formatted)).toBe(Math.round(ms / 60_000) * 60_000);
  });

  it("rounds a half minute up and anything under that down", () => {
    const up = Date.parse("2026-03-25T22:02:30.000Z");
    const down = Date.parse("2026-03-25T22:02:29.999Z");
    expect(Date.parse(formatLocalPlayedAt(up))).toBe(Date.parse("2026-03-25T22:03:00.000Z"));
    expect(Date.parse(formatLocalPlayedAt(down))).toBe(Date.parse("2026-03-25T22:02:00.000Z"));
  });
});

describe("songHistoryAppendText", () => {
  const entry = { path: "Christmas/Song.mp3", playedAt: "2026-09-29T21:19:00.000Z" };

  it("writes a header when the file is missing or empty", () => {
    const expected = `${SONG_HISTORY_HEADER}\nChristmas/Song.mp3,2026-09-29T21:19:00.000Z\n`;
    expect(songHistoryAppendText(null, entry)).toBe(expected);
    expect(songHistoryAppendText("", entry)).toBe(expected);
  });

  it("appends a single line when the file already ends with a newline", () => {
    const existing = `${SONG_HISTORY_HEADER}\nOld.mp3,2026-01-01T00:00:00.000Z\n`;
    expect(songHistoryAppendText(existing, entry)).toBe(
      "Christmas/Song.mp3,2026-09-29T21:19:00.000Z\n",
    );
  });

  it("inserts a newline before the new row when the file has none", () => {
    expect(songHistoryAppendText("Old.mp3,2026-01-01T00:00:00.000Z", entry)).toBe(
      "\nChristmas/Song.mp3,2026-09-29T21:19:00.000Z\n",
    );
  });
});

describe("formatSongHistoryLine", () => {
  it("quotes paths that contain commas", () => {
    expect(
      formatSongHistoryLine({
        path: "A, B - Title.mp3",
        playedAt: "2026-09-29T21:19:00.000Z",
      }),
    ).toBe('"A, B - Title.mp3",2026-09-29T21:19:00.000Z');
  });
});

describe("parseSongHistoryCsv", () => {
  it("reads header, quoted paths, and CRLF", () => {
    const text =
      'path,playedAt\r\n"A, B - Title.mp3",2026-09-29T21:19:00.000Z\r\n' +
      "plain.mp3,2026-09-29T22:00:00.000Z\r\n";
    expect(parseSongHistoryCsv(text)).toEqual([
      { path: "A, B - Title.mp3", playedAt: "2026-09-29T21:19:00.000Z" },
      { path: "plain.mp3", playedAt: "2026-09-29T22:00:00.000Z" },
    ]);
  });

  it("keeps data rows when there is no header", () => {
    expect(parseSongHistoryCsv("Song.mp3,2026-09-29T21:19:00.000Z\n")).toEqual([
      { path: "Song.mp3", playedAt: "2026-09-29T21:19:00.000Z" },
    ]);
  });

  it("skips rows that have no path or no timestamp", () => {
    const text = `${SONG_HISTORY_HEADER}\n,2026-09-29T21:19:00.000Z\nSong.mp3,\n`;
    expect(parseSongHistoryCsv(text)).toEqual([]);
  });
});

describe("buildSongHistoryDisplayRows", () => {
  const now = new Date(2026, 8, 29, 15, 0, 0).getTime();

  it("joins catalog fields and falls back to the filename when the song is gone", () => {
    const song = createSongFromFile("RYL 607 - Come Sail Away.mp3");
    song.rank = 80;
    song.playWeight = 1.5;
    song.lyricsFile = "RYL 607 - Come Sail Away.md";
    song.lastUsed = lastUsedIsoFromMs(now);
    const songs = new Map([["christmas/ryl 607 - come sail away.mp3", song]]);
    const rows = buildSongHistoryDisplayRows(
      [
        {
          path: "Christmas/RYL 607 - Come Sail Away.mp3",
          playedAt: "2026-09-29T21:00:00.000Z",
        },
        { path: "Missing.mp3", playedAt: "2026-09-29T22:00:00.000Z" },
        { path: "Bad.mp3", playedAt: "not-a-date" },
      ],
      songs,
      now,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      title: "Come Sail Away",
      rank: 80,
      played: 1.5,
      label: "RYL 607",
      singing: true,
    });
    expect(rows[1]).toMatchObject({
      title: "Missing",
      rank: null,
      played: null,
      label: "",
      singing: null,
    });
  });

  it("sorts the newest play first, with later file rows winning a timestamp tie", () => {
    const rows = buildSongHistoryDisplayRows(
      [
        { path: "a.mp3", playedAt: "2026-09-29T21:00:00.000Z" },
        { path: "b.mp3", playedAt: "2026-09-29T22:00:00.000Z" },
        { path: "c.mp3", playedAt: "2026-09-29T22:00:00.000Z" },
      ],
      new Map(),
      now,
    );
    expect(sortSongHistoryNewestFirst(rows).map((r) => r.path)).toEqual([
      "c.mp3",
      "b.mp3",
      "a.mp3",
    ]);
  });
});
