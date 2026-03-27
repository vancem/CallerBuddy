import { describe, it, expect } from "vitest";
import {
  parseMusicFilename,
  baseName,
  isMusicFile,
  isLyricsFile,
  isSingingCall,
  isPatter,
  songForPersistence,
  createSongFromFile,
  normalizeSongFromJson,
  type Song,
} from "./song.js";

describe("parseMusicFilename", () => {
  it("parses standard 'LABEL - TITLE.ext' format", () => {
    const result = parseMusicFilename("RYL 607 - Come Sail Away.MP3");
    expect(result).toEqual({ label: "RYL 607", title: "Come Sail Away" });
  });

  it("handles no separator — label is empty, title is base name", () => {
    const result = parseMusicFilename("SomeTrack.mp3");
    expect(result).toEqual({ label: "", title: "SomeTrack" });
  });

  it("returns null for filename with no extension", () => {
    expect(parseMusicFilename("noextension")).toBeNull();
  });

  it("trims whitespace around label and title", () => {
    const result = parseMusicFilename("  ABC 123  -  My Song  .wav");
    expect(result).toEqual({ label: "ABC 123", title: "My Song" });
  });

  it("uses first ' - ' as separator when multiple exist", () => {
    const result = parseMusicFilename("A - B - C.mp3");
    expect(result).toEqual({ label: "A", title: "B - C" });
  });
});

describe("baseName", () => {
  it("strips extension and lowercases", () => {
    expect(baseName("RYL 607 - Come Sail Away.MP3")).toBe(
      "ryl 607 - come sail away",
    );
  });

  it("handles no extension", () => {
    expect(baseName("README")).toBe("readme");
  });

  it("handles dotted filenames (uses last dot)", () => {
    expect(baseName("my.song.name.mp3")).toBe("my.song.name");
  });
});

describe("isMusicFile", () => {
  it("recognizes .mp3", () => {
    expect(isMusicFile("song.mp3")).toBe(true);
  });

  it("recognizes .wav", () => {
    expect(isMusicFile("song.wav")).toBe(true);
  });

  it("recognizes .m4a", () => {
    expect(isMusicFile("song.m4a")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isMusicFile("SONG.MP3")).toBe(true);
    expect(isMusicFile("Song.WAV")).toBe(true);
    expect(isMusicFile("Track.M4A")).toBe(true);
  });

  it("rejects non-music extensions", () => {
    expect(isMusicFile("song.ogg")).toBe(false);
    expect(isMusicFile("song.txt")).toBe(false);
    expect(isMusicFile("song.html")).toBe(false);
  });
});

describe("isLyricsFile", () => {
  it("recognizes .html", () => expect(isLyricsFile("lyrics.html")).toBe(true));
  it("recognizes .htm", () => expect(isLyricsFile("lyrics.htm")).toBe(true));
  it("recognizes .md", () => expect(isLyricsFile("lyrics.md")).toBe(true));
  it("recognizes .txt", () => expect(isLyricsFile("lyrics.txt")).toBe(true));

  it("is case-insensitive", () => {
    expect(isLyricsFile("LYRICS.HTML")).toBe(true);
    expect(isLyricsFile("Lyrics.TXT")).toBe(true);
  });

  it("rejects non-lyrics extensions", () => {
    expect(isLyricsFile("file.mp3")).toBe(false);
    expect(isLyricsFile("file.pdf")).toBe(false);
  });
});

describe("isSingingCall / isPatter", () => {
  const withLyrics = { lyricsFile: "song.html" } as Song;
  const noLyrics = { lyricsFile: "" } as Song;

  it("isSingingCall returns true when song has lyrics", () => {
    expect(isSingingCall(withLyrics)).toBe(true);
    expect(isSingingCall(noLyrics)).toBe(false);
  });

  it("isPatter returns true when song has no lyrics", () => {
    expect(isPatter(noLyrics)).toBe(true);
    expect(isPatter(withLyrics)).toBe(false);
  });
});

describe("songForPersistence", () => {
  it("strips dirHandle and preserves all other fields", () => {
    const song: Song = {
      label: "RYL 607",
      title: "Come Sail Away",
      musicFile: "RYL 607 - Come Sail Away.MP3",
      lyricsFile: "RYL 607 - Come Sail Away.html",
      categories: "Pop",
      rank: 30,
      dateAdded: "2025-01-01T00:00:00.000Z",
      lastUsed: "",
      loopStartTime: 0,
      loopEndTime: 0,
      volume: 80,
      pitch: 0,
      originalTempo: 128,
      deltaTempo: 0,
      dirHandle: {} as FileSystemDirectoryHandle,
    };

    const result = songForPersistence(song);
    expect(result).not.toHaveProperty("dirHandle");
    expect(result.label).toBe("RYL 607");
    expect(result.title).toBe("Come Sail Away");
    expect(result.categories).toBe("Pop");
    expect(result.rank).toBe(30);
    expect(JSON.stringify(songForPersistence(song))).toContain('"categories"');
    expect(JSON.stringify(songForPersistence(song))).not.toContain('"category"');
  });
});

describe("normalizeSongFromJson", () => {
  it("maps legacy category to categories", () => {
    const song = normalizeSongFromJson({
      musicFile: "a.mp3",
      category: "Holiday",
    });
    expect(song).not.toBeNull();
    expect(song!.categories).toBe("Holiday");
  });

  it("prefers categories over legacy category", () => {
    const song = normalizeSongFromJson({
      musicFile: "a.mp3",
      categories: "New",
      category: "Old",
    });
    expect(song!.categories).toBe("New");
  });

  it("returns null without musicFile", () => {
    expect(normalizeSongFromJson({ title: "x" })).toBeNull();
  });
});

describe("createSongFromFile", () => {
  it("creates a song with parsed label and title", () => {
    const song = createSongFromFile("RYL 607 - Come Sail Away.MP3");
    expect(song.label).toBe("RYL 607");
    expect(song.title).toBe("Come Sail Away");
    expect(song.musicFile).toBe("RYL 607 - Come Sail Away.MP3");
  });

  it("uses sensible defaults", () => {
    const song = createSongFromFile("Test.mp3");
    expect(song.rank).toBe(50);
    expect(song.volume).toBe(80);
    expect(song.pitch).toBe(0);
    expect(song.originalTempo).toBe(0);
    expect(song.deltaTempo).toBe(0);
    expect(song.loopStartTime).toBe(0);
    expect(song.loopEndTime).toBe(0);
    expect(song.lastUsed).toBe("");
    expect(song.lyricsFile).toBe("");
  });

  it("accepts an optional lyrics file", () => {
    const song = createSongFromFile("Test.mp3", "Test.html");
    expect(song.lyricsFile).toBe("Test.html");
  });

  it("sets dateAdded to an ISO timestamp", () => {
    const song = createSongFromFile("Test.mp3");
    expect(() => new Date(song.dateAdded)).not.toThrow();
    expect(new Date(song.dateAdded).toISOString()).toBe(song.dateAdded);
  });

  it("handles filename with no separator", () => {
    const song = createSongFromFile("TrackOnly.mp3");
    expect(song.label).toBe("");
    expect(song.title).toBe("TrackOnly");
  });
});
