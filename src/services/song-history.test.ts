import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSongFromFile, songForPersistence } from "../models/song.js";

vi.mock("./file-system-service.js", () => ({
  fileExists: vi.fn(),
  readTextFile: vi.fn(),
  appendTextFile: vi.fn(),
}));

import { fileExists, readTextFile, appendTextFile } from "./file-system-service.js";
import {
  appendSongHistory,
  loadSongHistoryDisplay,
  resetSongHistoryAppendQueueForTests,
} from "./song-history.js";
import { SONG_HISTORY_HEADER } from "../utils/song-history.js";

function fakeDir(
  name: string,
  children: Record<string, FileSystemDirectoryHandle> = {},
): FileSystemDirectoryHandle {
  return {
    name,
    kind: "directory",
    getDirectoryHandle: async (child: string) => {
      const found = children[child];
      if (!found) throw new DOMException("not found", "NotFoundError");
      return found;
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe("song history file", () => {
  const christmas = fakeDir("Christmas");
  const root = fakeDir("CallerBuddySongs", { Christmas: christmas });
  const song = createSongFromFile("RYL 607 - Come Sail Away.mp3");
  song.rank = 80;
  song.playWeight = 2;
  song.lastUsed = new Date(2026, 8, 29, 0, 0, 0).toISOString();

  beforeEach(() => {
    resetSongHistoryAppendQueueForTests();
    vi.mocked(fileExists).mockReset();
    vi.mocked(readTextFile).mockReset();
    vi.mocked(appendTextFile).mockReset();
  });

  it("creates the csv with a header on the first play", async () => {
    vi.mocked(fileExists).mockResolvedValue(false);
    await appendSongHistory(root, {
      path: "Christmas/RYL 607 - Come Sail Away.mp3",
      playedAt: "2026-09-29T21:19:00.000Z",
    });
    expect(appendTextFile).toHaveBeenCalledWith(
      root,
      "CallerBuddyHistory.csv",
      `${SONG_HISTORY_HEADER}\nChristmas/RYL 607 - Come Sail Away.mp3,2026-09-29T21:19:00.000Z\n`,
    );
  });

  it("appends only the new line when the file already exists", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockResolvedValue(
      `${SONG_HISTORY_HEADER}\nOld.mp3,2026-01-01T00:00:00.000Z\n`,
    );
    await appendSongHistory(root, {
      path: "New.mp3",
      playedAt: "2026-09-29T21:19:00.000Z",
    });
    expect(appendTextFile).toHaveBeenCalledWith(
      root,
      "CallerBuddyHistory.csv",
      "New.mp3,2026-09-29T21:19:00.000Z\n",
    );
  });

  it("loads newest first and joins the song in its folder", async () => {
    const csv =
      `${SONG_HISTORY_HEADER}\n` +
      "Christmas/RYL 607 - Come Sail Away.mp3,2026-09-29T20:00:00.000Z\n" +
      "Christmas/RYL 607 - Come Sail Away.mp3,2026-09-29T22:00:00.000Z\n";
    vi.mocked(fileExists).mockImplementation(async (_dir, name) => {
      return name === "CallerBuddyHistory.csv" || name === "CallerBuddySongs.json";
    });
    vi.mocked(readTextFile).mockImplementation(async (dir, name) => {
      if (name === "CallerBuddyHistory.csv") return csv;
      if (name === "CallerBuddySongs.json" && dir === christmas) {
        return JSON.stringify([songForPersistence(song)]);
      }
      return "[]";
    });
    const now = new Date(2026, 8, 29, 15, 0, 0).getTime();
    const rows = await loadSongHistoryDisplay(root, now);
    expect(rows.map((r) => r.playedAtMs)).toEqual([
      Date.parse("2026-09-29T22:00:00.000Z"),
      Date.parse("2026-09-29T20:00:00.000Z"),
    ]);
    expect(rows[0]).toMatchObject({
      title: "Come Sail Away",
      rank: 80,
      label: "RYL 607",
      played: 2,
    });
  });
});
