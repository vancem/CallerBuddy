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
}));

import { mergeSongs, scanDirectory, loadSongsJson, saveSongsJson } from "./song-library.js";
import { listDirectory, readTextFile, writeTextFile, fileExists } from "./file-system-service.js";

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
    loopStartTime: 0,
    loopEndTime: 0,
    volume: 80,
    pitch: 0,
    originalTempo: 0,
    deltaTempo: 0,
    ...overrides,
  };
}

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

  it("retains persisted songs when scanned is empty (file may be temporarily missing)", () => {
    const persisted = [makeSong({ musicFile: "a.mp3", rank: 10 })];
    const result = mergeSongs([], persisted);
    expect(result).toHaveLength(1);
    expect(result[0].rank).toBe(10);
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
    const scanned = [makeSong({ musicFile: "a.mp3", lyricsFile: "a.html" })];
    const persisted = [makeSong({ musicFile: "a.mp3", lyricsFile: "" })];
    const result = mergeSongs(scanned, persisted);
    expect(result[0].lyricsFile).toBe("a.html");
  });

  it("matches musicFile case-insensitively", () => {
    const scanned = [makeSong({ musicFile: "Song.MP3" })];
    const persisted = [makeSong({ musicFile: "song.mp3", rank: 5 })];
    const result = mergeSongs(scanned, persisted);
    expect(result).toHaveLength(1);
    expect(result[0].rank).toBe(5);
  });

  it("combines new scanned + missing persisted songs", () => {
    const scanned = [makeSong({ musicFile: "new.mp3" })];
    const persisted = [makeSong({ musicFile: "old.mp3", orderAdded: 20 })];
    const result = mergeSongs(scanned, persisted);
    expect(result).toHaveLength(2);
    const files = result.map((s) => s.musicFile);
    expect(files).toContain("new.mp3");
    expect(files).toContain("old.mp3");
    expect(result.find((s) => s.musicFile === "new.mp3")!.orderAdded).toBe(21);
    expect(result.find((s) => s.musicFile === "old.mp3")!.orderAdded).toBe(20);
  });

  it("assigns sequential orderAdded for multiple new songs in one merge", () => {
    const scanned = [
      makeSong({ musicFile: "a.mp3" }),
      makeSong({ musicFile: "b.mp3" }),
    ];
    const persisted = [makeSong({ musicFile: "x.mp3", orderAdded: 100 })];
    const result = mergeSongs(scanned, persisted);
    expect(result.find((s) => s.musicFile === "a.mp3")!.orderAdded).toBe(101);
    expect(result.find((s) => s.musicFile === "b.mp3")!.orderAdded).toBe(102);
  });
});

// ---------------------------------------------------------------------------
// Tier 3: scanDirectory (mocked file-system-service)
// ---------------------------------------------------------------------------

const fakeDirHandle = { name: "test-folder" } as FileSystemDirectoryHandle;

describe("scanDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates songs from music files and pairs lyrics by base name", async () => {
    vi.mocked(listDirectory).mockResolvedValue([
      { name: "RYL 607 - Come Sail Away.MP3", kind: "file" },
      { name: "RYL 607 - Come Sail Away.html", kind: "file" },
      { name: "Another Track.wav", kind: "file" },
    ]);

    const songs = await scanDirectory(fakeDirHandle);
    expect(songs).toHaveLength(2);

    const sail = songs.find((s) => s.musicFile === "RYL 607 - Come Sail Away.MP3")!;
    expect(sail.lyricsFile).toBe("RYL 607 - Come Sail Away.html");
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
  });

  it("returns [] when songs.json does not exist", async () => {
    vi.mocked(fileExists).mockResolvedValue(false);
    const songs = await loadSongsJson(fakeDirHandle);
    expect(songs).toEqual([]);
  });

  it("parses songs.json and returns array", async () => {
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

  it("returns [] on parse error", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockResolvedValue("not json");

    const songs = await loadSongsJson(fakeDirHandle);
    expect(songs).toEqual([]);
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
    expect(filename).toBe("songs.json");
    const parsed = JSON.parse(content);
    expect(parsed[0]).not.toHaveProperty("dirHandle");
    expect(parsed[0].musicFile).toBe("a.mp3");
    expect(parsed[0]).toHaveProperty("categories");
    expect(parsed[0]).not.toHaveProperty("category");
  });
});
