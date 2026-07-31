import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Song } from "../models/song.js";

// ---------------------------------------------------------------------------
// Mock file-system-service for integration tests (Tier 3)
// ---------------------------------------------------------------------------

vi.mock("./file-system-service.js", () => ({
  listDirectory: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  fileExists: vi.fn(),
  getFileLastModified: vi.fn(),
}));

import {
  mergeSongs,
  scanDirectory,
  loadSongsJson,
  saveSongsJson,
  loadAndMergeSongs,
  isSuspiciousScan,
  applyConservativeOrphanCleanup,
  resetOrphanRemovalPendingForTests,
  persistedSongsEqual,
  maybeRefreshSongsJsonBackup,
} from "./song-library.js";
import {
  listDirectory,
  readTextFile,
  writeTextFile,
  fileExists,
  getFileLastModified,
} from "./file-system-service.js";

/** Fresh .bak so loadSongsJson / merge tests do not write backup copies. */
function mockFreshSongsBak(): void {
  vi.mocked(getFileLastModified).mockResolvedValue(Date.now());
}

// ---------------------------------------------------------------------------
// Helper: create a minimal Song for merge tests
// ---------------------------------------------------------------------------

function makeSong(overrides: Partial<Song> = {}): Song {
  return {
    label: "",
    title: "Test",
    musicFile: "test.mp3",
    lyricsFile: "",
    categories: "",
    rank: 50,
    orderAdded: 15,
    lastUsed: "",
    playWeight: 0,
    loopStartTime: 0,
    loopEndTime: 0,
    volume: 80,
    pitch: 0,
    originalTempo: 0,
    deltaTempo: 0,
    ...overrides,
  };
}

const fakeDirHandle = { name: "test-folder" } as FileSystemDirectoryHandle;

// ---------------------------------------------------------------------------
// Tier 1: mergeSongs (pure function)
// ---------------------------------------------------------------------------

describe("mergeSongs", () => {
  it("returns empty when both lists are empty", () => {
    expect(mergeSongs([], [])).toEqual([]);
  });

  it("returns scanned songs when persisted is empty", () => {
    const scanned = [makeSong({ musicFile: "a.mp3" })];
    const result = mergeSongs(scanned, []);
    expect(result).toHaveLength(1);
    expect(result[0].musicFile).toBe("a.mp3");
    expect(result[0].orderAdded).toBe(1);
  });

  it("omits persisted songs when scanned is empty (orphans handled separately)", () => {
    const persisted = [makeSong({ musicFile: "a.mp3", rank: 10 })];
    const result = mergeSongs([], persisted);
    expect(result).toHaveLength(0);
  });

  it("preserves persisted metadata on overlap", () => {
    const scanned = [makeSong({ musicFile: "a.mp3", rank: 50 })];
    const persisted = [
      makeSong({ musicFile: "a.mp3", rank: 10, categories: "Classic", orderAdded: 42 }),
    ];
    const result = mergeSongs(scanned, persisted);
    expect(result).toHaveLength(1);
    expect(result[0].rank).toBe(10);
    expect(result[0].categories).toBe("Classic");
    expect(result[0].orderAdded).toBe(42);
  });

  it("refreshes lyricsFile from scan on overlap", () => {
    const scanned = [makeSong({ musicFile: "a.mp3", lyricsFile: "a.md" })];
    const persisted = [makeSong({ musicFile: "a.mp3", lyricsFile: "" })];
    const result = mergeSongs(scanned, persisted);
    expect(result[0].lyricsFile).toBe("a.md");
  });

  it("reconciles persisted metadata by label when musicFile differs", () => {
    const scanned = [makeSong({ musicFile: "Song.MP3", label: "ABC 123" })];
    const persisted = [makeSong({ musicFile: "song.mp3", label: "ABC 123", rank: 5 })];
    const result = mergeSongs(scanned, persisted);
    expect(result).toHaveLength(1);
    expect(result[0].rank).toBe(5);
    expect(result[0].musicFile).toBe("Song.MP3");
  });

  it("uses on-disk filenames from scan on overlap", () => {
    const scanned = [
      makeSong({
        musicFile: "BS 579 - CANDY GIRL.mp3",
        lyricsFile: "BS 579 - CANDY GIRL.md",
        label: "BS 579",
      }),
    ];
    const persisted = [
      makeSong({
        musicFile: "BS 579 - Candy Girl.mp3",
        lyricsFile: "BS 579 - Candy Girl.md",
        label: "BS 579",
        rank: 10,
      }),
    ];
    const result = mergeSongs(scanned, persisted);
    expect(result).toHaveLength(1);
    expect(result[0].rank).toBe(10);
    expect(result[0].musicFile).toBe("BS 579 - CANDY GIRL.mp3");
    expect(result[0].lyricsFile).toBe("BS 579 - CANDY GIRL.md");
  });

  it("adds new scanned songs and omits persisted songs missing from scan", () => {
    const scanned = [makeSong({ musicFile: "new.mp3" })];
    const persisted = [makeSong({ musicFile: "old.mp3", orderAdded: 20 })];
    const result = mergeSongs(scanned, persisted);
    expect(result).toHaveLength(1);
    expect(result[0].musicFile).toBe("new.mp3");
    expect(result[0].orderAdded).toBe(21);
  });

  it("assigns sequential orderAdded for multiple new songs in one merge", () => {
    const scanned = [
      makeSong({ musicFile: "a.mp3" }),
      makeSong({ musicFile: "b.mp3" }),
    ];
    const persisted = [makeSong({ musicFile: "x.mp3", orderAdded: 100 })];
    const result = mergeSongs(scanned, persisted);
    expect(result).toHaveLength(2);
    expect(result.find((s) => s.musicFile === "a.mp3")!.orderAdded).toBe(101);
    expect(result.find((s) => s.musicFile === "b.mp3")!.orderAdded).toBe(102);
  });
});

describe("isSuspiciousScan", () => {
  it("flags empty scan with persisted songs", () => {
    expect(isSuspiciousScan(0, 5, 5)).toBe(true);
  });

  it("flags when most persisted songs would be removed", () => {
    expect(isSuspiciousScan(1, 4, 3)).toBe(true);
  });

  it("allows modest orphan cleanup", () => {
    expect(isSuspiciousScan(9, 10, 1)).toBe(false);
  });
});

describe("applyConservativeOrphanCleanup", () => {
  beforeEach(() => {
    resetOrphanRemovalPendingForTests();
    vi.clearAllMocks();
  });

  it("keeps orphan on first miss and removes on second consecutive miss", async () => {
    const orphan = makeSong({ musicFile: "old.mp3", rank: 10 });
    const scanned = [makeSong({ musicFile: "keep.mp3" })];
    const persisted = [makeSong({ musicFile: "keep.mp3" }), orphan];
    const merged = mergeSongs(scanned, persisted);
    vi.mocked(fileExists).mockResolvedValue(false);

    const first = await applyConservativeOrphanCleanup(
      merged,
      scanned,
      persisted,
      fakeDirHandle,
    );
    expect(first.some((s) => s.musicFile === "old.mp3")).toBe(true);

    const second = await applyConservativeOrphanCleanup(
      merged,
      scanned,
      persisted,
      fakeDirHandle,
    );
    expect(second.some((s) => s.musicFile === "old.mp3")).toBe(false);
  });

  it("keeps orphan when fileExists succeeds even if scan missed it", async () => {
    const orphan = makeSong({ musicFile: "old.mp3", rank: 10 });
    vi.mocked(fileExists).mockResolvedValue(true);

    const result = await applyConservativeOrphanCleanup([], [], [orphan], fakeDirHandle);
    expect(result).toHaveLength(1);
    expect(result[0].musicFile).toBe("old.mp3");
    expect(result[0].rank).toBe(10);
  });

  it("skips removal on suspicious scan even when orphan was pending", async () => {
    const orphan = makeSong({ musicFile: "old.mp3" });
    vi.mocked(fileExists).mockResolvedValue(false);

    await applyConservativeOrphanCleanup([], [], [orphan], fakeDirHandle);
    const result = await applyConservativeOrphanCleanup([], [], [orphan], fakeDirHandle);
    expect(result).toHaveLength(1);
  });
});

describe("loadAndMergeSongs orphan cleanup", () => {
  beforeEach(() => {
    resetOrphanRemovalPendingForTests();
    vi.clearAllMocks();
    vi.mocked(fileExists).mockImplementation(async (_dir, filename) => filename === "CallerBuddySongs.json");
    vi.mocked(readTextFile).mockResolvedValue(JSON.stringify([]));
    vi.mocked(writeTextFile).mockResolvedValue(undefined);
    mockFreshSongsBak();
  });

  it("requires two scans before removing a missing orphan", async () => {
    const orphan = makeSong({ musicFile: "old.mp3" });
    const keep = makeSong({ musicFile: "keep.mp3" });
    vi.mocked(readTextFile).mockResolvedValue(JSON.stringify([keep, orphan]));
    vi.mocked(listDirectory).mockResolvedValue([{ name: "keep.mp3", kind: "file" }]);
    vi.mocked(fileExists).mockImplementation(async (_dir, filename) => filename === "CallerBuddySongs.json");

    const first = await loadAndMergeSongs(fakeDirHandle);
    expect(first.some((s) => s.musicFile === "old.mp3")).toBe(true);

    const second = await loadAndMergeSongs(fakeDirHandle);
    expect(second.some((s) => s.musicFile === "old.mp3")).toBe(false);
  });

  it("skips writing CallerBuddySongs.json when merge is a no-op", async () => {
    const keep = makeSong({ musicFile: "keep.mp3", rank: 5 });
    vi.mocked(readTextFile).mockResolvedValue(JSON.stringify([keep]));
    vi.mocked(listDirectory).mockResolvedValue([{ name: "keep.mp3", kind: "file" }]);

    await loadAndMergeSongs(fakeDirHandle);

    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it("writes when scan discovers lyricsFile missing from the catalog", async () => {
    const keep = makeSong({ musicFile: "keep.mp3", lyricsFile: "" });
    vi.mocked(readTextFile).mockResolvedValue(JSON.stringify([keep]));
    vi.mocked(listDirectory).mockResolvedValue([
      { name: "keep.mp3", kind: "file" },
      { name: "keep.md", kind: "file" },
    ]);

    await loadAndMergeSongs(fakeDirHandle);

    const songsWrites = vi
      .mocked(writeTextFile)
      .mock.calls.filter(([, name]) => name === "CallerBuddySongs.json");
    expect(songsWrites).toHaveLength(1);
    expect(JSON.parse(songsWrites[0][2])[0].lyricsFile).toBe("keep.md");
  });
});

describe("persistedSongsEqual", () => {
  it("ignores runtime-only fields", () => {
    const a = makeSong({ musicFile: "a.mp3", rank: 3, lyricsFile: "a.md" });
    const b = makeSong({ musicFile: "a.mp3", rank: 3, lyricsFile: "a.md" });
    (a as Song).dirHandle = {} as FileSystemDirectoryHandle;
    (a as Song).playlistRelPath = "folder/a.mp3";
    expect(persistedSongsEqual([a], [b])).toBe(true);
  });

  it("treats lyricsFile as persisted (singing vs patter)", () => {
    const a = makeSong({ musicFile: "a.mp3", lyricsFile: "" });
    const b = makeSong({ musicFile: "a.mp3", lyricsFile: "a.md" });
    expect(persistedSongsEqual([a], [b])).toBe(false);
  });

  it("detects metadata differences", () => {
    const a = makeSong({ musicFile: "a.mp3", rank: 3 });
    const b = makeSong({ musicFile: "a.mp3", rank: 4 });
    expect(persistedSongsEqual([a], [b])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tier 3: scanDirectory (mocked file-system-service)
// ---------------------------------------------------------------------------

describe("scanDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates songs from music files and pairs lyrics by base name", async () => {
    vi.mocked(listDirectory).mockResolvedValue([
      { name: "RYL 607 - Come Sail Away.MP3", kind: "file" },
      { name: "RYL 607 - Come Sail Away.md", kind: "file" },
      { name: "Another Track.wav", kind: "file" },
    ]);

    const songs = await scanDirectory(fakeDirHandle);
    expect(songs).toHaveLength(2);

    const sail = songs.find((s) => s.musicFile === "RYL 607 - Come Sail Away.MP3")!;
    expect(sail.lyricsFile).toBe("RYL 607 - Come Sail Away.md");
    expect(sail.label).toBe("RYL 607");
    expect(sail.title).toBe("Come Sail Away");
    expect(sail.orderAdded).toBe(0);

    const another = songs.find((s) => s.musicFile === "Another Track.wav")!;
    expect(another.lyricsFile).toBe("");
    expect(another.orderAdded).toBe(0);
  });

  it("includes .m4a files", async () => {
    vi.mocked(listDirectory).mockResolvedValue([
      { name: "RR 275 - Boogie Shoes.m4a", kind: "file" },
    ]);

    const songs = await scanDirectory(fakeDirHandle);
    expect(songs).toHaveLength(1);
    expect(songs[0].musicFile).toBe("RR 275 - Boogie Shoes.m4a");
  });

  it("ignores directories", async () => {
    vi.mocked(listDirectory).mockResolvedValue([
      { name: "subfolder", kind: "directory" },
      { name: "song.mp3", kind: "file" },
    ]);

    const songs = await scanDirectory(fakeDirHandle);
    expect(songs).toHaveLength(1);
  });

  it("returns empty array when no music files found", async () => {
    vi.mocked(listDirectory).mockResolvedValue([
      { name: "readme.txt", kind: "file" },
    ]);

    const songs = await scanDirectory(fakeDirHandle);
    expect(songs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tier 3: loadSongsJson / saveSongsJson (mocked file-system-service)
// ---------------------------------------------------------------------------

describe("loadSongsJson", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFreshSongsBak();
  });

  it("returns [] when CallerBuddySongs.json does not exist", async () => {
    vi.mocked(fileExists).mockResolvedValue(false);
    const songs = await loadSongsJson(fakeDirHandle);
    expect(songs).toEqual([]);
  });

  it("parses CallerBuddySongs.json and returns array", async () => {
    const stored = [makeSong({ musicFile: "a.mp3" })];
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(stored));

    const songs = await loadSongsJson(fakeDirHandle);
    expect(songs).toHaveLength(1);
    expect(songs[0].musicFile).toBe("a.mp3");
  });

  it("migrates legacy category field to categories", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockResolvedValue(
      JSON.stringify([
        { musicFile: "a.mp3", category: "X", rank: 7 },
      ]),
    );

    const songs = await loadSongsJson(fakeDirHandle);
    expect(songs).toHaveLength(1);
    expect(songs[0].categories).toBe("X");
    expect(songs[0].rank).toBe(7);
  });

  it("throws when file exists but JSON is invalid", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockResolvedValue("not json");

    await expect(loadSongsJson(fakeDirHandle)).rejects.toThrow(/valid JSON/);
  });

  it("does not refresh .bak when JSON is corrupt", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockResolvedValue("not json");
    vi.mocked(getFileLastModified).mockResolvedValue(null);

    await expect(loadSongsJson(fakeDirHandle)).rejects.toThrow(/valid JSON/);
    expect(writeTextFile).not.toHaveBeenCalled();
  });
});

describe("maybeRefreshSongsJsonBackup", () => {
  const sampleJson = JSON.stringify([{ musicFile: "a.mp3" }]);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(writeTextFile).mockResolvedValue(undefined);
  });

  it("creates .bak when missing", async () => {
    vi.mocked(getFileLastModified).mockResolvedValue(null);

    await maybeRefreshSongsJsonBackup(fakeDirHandle, sampleJson);

    expect(writeTextFile).toHaveBeenCalledWith(
      fakeDirHandle,
      "CallerBuddySongs.json.bak",
      sampleJson,
    );
  });

  it("refreshes .bak when older than 72 hours", async () => {
    const now = Date.UTC(2026, 6, 30);
    vi.mocked(getFileLastModified).mockResolvedValue(now - 73 * 60 * 60 * 1000);

    await maybeRefreshSongsJsonBackup(fakeDirHandle, sampleJson, now);

    expect(writeTextFile).toHaveBeenCalledWith(
      fakeDirHandle,
      "CallerBuddySongs.json.bak",
      sampleJson,
    );
  });

  it("skips .bak write when fresher than 72 hours", async () => {
    const now = Date.UTC(2026, 6, 30);
    vi.mocked(getFileLastModified).mockResolvedValue(now - 24 * 60 * 60 * 1000);

    await maybeRefreshSongsJsonBackup(fakeDirHandle, sampleJson, now);

    expect(writeTextFile).not.toHaveBeenCalled();
  });
});

describe("saveSongsJson", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes JSON without dirHandle", async () => {
    const song = makeSong({ musicFile: "a.mp3" });
    (song as Song).dirHandle = {} as FileSystemDirectoryHandle;

    await saveSongsJson(fakeDirHandle, [song]);

    expect(writeTextFile).toHaveBeenCalledOnce();
    const [, filename, content] = vi.mocked(writeTextFile).mock.calls[0];
    expect(filename).toBe("CallerBuddySongs.json");
    const parsed = JSON.parse(content);
    expect(parsed[0]).not.toHaveProperty("dirHandle");
    expect(parsed[0].lyricsFile).toBe("");
    expect(parsed[0].musicFile).toBe("a.mp3");
    expect(parsed[0]).toHaveProperty("categories");
    expect(parsed[0]).not.toHaveProperty("category");
  });

  it("persists lyricsFile for singing calls", async () => {
    const song = makeSong({
      musicFile: "a.mp3",
      lyricsFile: "a.md",
    });

    await saveSongsJson(fakeDirHandle, [song]);

    const content = vi.mocked(writeTextFile).mock.calls[0][2];
    expect(JSON.parse(content)[0].lyricsFile).toBe("a.md");
  });
});
