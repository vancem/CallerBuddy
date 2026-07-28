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
  maxOrderAdded,
  nextOrderAdded,
  effectiveAudioLoopPoints,
  patterDefaultLoopEndSec,
  clampPatterLoopRegion,
  PATTER_LOOP_TAIL_EPSILON_SEC,
  musicFilenameFromParts,
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

describe("musicFilenameFromParts", () => {
  it("builds LABEL - TITLE.ext", () => {
    expect(musicFilenameFromParts("RYL 607", "Come Sail Away", ".MP3")).toBe(
      "RYL 607 - Come Sail Away.MP3",
    );
  });

  it("uses title only when label is empty", () => {
    expect(musicFilenameFromParts("", "Solo", ".m4a")).toBe("Solo.m4a");
  });

  it("strips illegal filename characters", () => {
    expect(musicFilenameFromParts("A/B", 'C:D?"', ".mp3")).toBe("AB - CD.mp3");
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
    expect(isMusicFile("song.md")).toBe(false);
  });
});

describe("isLyricsFile", () => {
  it("recognizes .md", () => expect(isLyricsFile("lyrics.md")).toBe(true));

  it("is case-insensitive for .md", () => {
    expect(isLyricsFile("Lyrics.MD")).toBe(true);
  });

  it("rejects non-lyrics extensions", () => {
    expect(isLyricsFile("lyrics.html")).toBe(false);
    expect(isLyricsFile("lyrics.txt")).toBe(false);
    expect(isLyricsFile("file.mp3")).toBe(false);
    expect(isLyricsFile("file.pdf")).toBe(false);
  });
});

describe("isSingingCall / isPatter", () => {
  const withLyrics = { lyricsFile: "song.md" } as Song;
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

describe("effectiveAudioLoopPoints / patterDefaultLoopEndSec / clampPatterLoopRegion", () => {
  it("singing call passes through stored loop times", () => {
    const singing = createSongFromFile("S.MP3", "S.md");
    singing.loopStartTime = 1;
    singing.loopEndTime = 0;
    expect(effectiveAudioLoopPoints(singing, 100)).toEqual({ start: 1, end: 0 });
  });

  it("patter with loopEndTime 0 uses start 0 and end slightly before duration", () => {
    const patter = createSongFromFile("P.MP3", "");
    const r = effectiveAudioLoopPoints(patter, 100);
    expect(r.start).toBe(0);
    expect(r.end).toBe(100 - PATTER_LOOP_TAIL_EPSILON_SEC);
  });

  it("patterDefaultLoopEndSec matches implied end for normal durations", () => {
    expect(patterDefaultLoopEndSec(100)).toBe(100 - PATTER_LOOP_TAIL_EPSILON_SEC);
  });

  it("patter with explicit positive loopEndTime is clamped to duration", () => {
    const patter = createSongFromFile("P2.MP3", "");
    patter.loopStartTime = 5;
    patter.loopEndTime = 9999;
    const r = effectiveAudioLoopPoints(patter, 60);
    expect(r.end).toBe(60);
    expect(r.start).toBe(5);
  });

  it("clampPatterLoopRegion keeps a minimal gap when start and end collide", () => {
    const r = clampPatterLoopRegion(10, 10, 30);
    expect(r.end - r.start).toBeGreaterThan(0);
    expect(r.end).toBeLessThanOrEqual(30);
    expect(r.start).toBeGreaterThanOrEqual(0);
  });
});

describe("songForPersistence", () => {
  it("strips dirHandle and preserves all other fields", () => {
    const song: Song = {
      label: "RYL 607",
      title: "Come Sail Away",
      musicFile: "RYL 607 - Come Sail Away.MP3",
      lyricsFile: "RYL 607 - Come Sail Away.md",
      categories: "Pop",
      rank: 30,
      orderAdded: 3,
      lastUsed: "",
      playWeight: 0,
      loopStartTime: 0,
      loopEndTime: 0,
      volume: 80,
      pitch: 0,
      originalTempo: 128,
      deltaTempo: 0,
      dirHandle: {} as FileSystemDirectoryHandle,
      playlistRelPath: "sub/a.mp3",
    };

    const result = songForPersistence(song);
    expect(result).not.toHaveProperty("dirHandle");
    expect(result).not.toHaveProperty("playlistRelPath");
    expect(result).not.toHaveProperty("lyricsFile");
    expect(result.label).toBe("RYL 607");
    expect(result.title).toBe("Come Sail Away");
    expect(result.categories).toBe("Pop");
    expect(result.rank).toBe(30);
    expect(JSON.stringify(songForPersistence(song))).toContain('"categories"');
    expect(JSON.stringify(songForPersistence(song))).not.toContain('"category"');
    expect(JSON.stringify(songForPersistence(song))).not.toContain('"lyricsFile"');
  });
});

describe("maxOrderAdded / nextOrderAdded", () => {
  it("returns 0 / 1 for an empty list", () => {
    expect(maxOrderAdded([])).toBe(0);
    expect(nextOrderAdded([])).toBe(1);
  });

  it("returns max and max+1", () => {
    const songs = [
      { orderAdded: 3 } as Song,
      { orderAdded: 12 } as Song,
      { orderAdded: 7 } as Song,
    ];
    expect(maxOrderAdded(songs)).toBe(12);
    expect(nextOrderAdded(songs)).toBe(13);
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

  it("reads playWeight from JSON", () => {
    const song = normalizeSongFromJson({
      musicFile: "a.mp3",
      playWeight: 1.5,
    });
    expect(song!.playWeight).toBe(1.5);
  });

  it("ignores legacy lyricsFile from JSON (runtime scan supplies it)", () => {
    const song = normalizeSongFromJson({
      musicFile: "a.mp3",
      lyricsFile: "a.md",
    });
    expect(song!.lyricsFile).toBe("");
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
    expect(song.playWeight).toBe(0);
    expect(song.lyricsFile).toBe("");
  });

  it("accepts an optional lyrics file", () => {
    const song = createSongFromFile("Test.mp3", "Test.md");
    expect(song.lyricsFile).toBe("Test.md");
  });

  it("uses a placeholder orderAdded until merge assigns a real value", () => {
    const song = createSongFromFile("Test.mp3");
    expect(song.orderAdded).toBe(0);
  });

  it("handles filename with no separator", () => {
    const song = createSongFromFile("TrackOnly.mp3");
    expect(song.label).toBe("");
    expect(song.title).toBe("TrackOnly");
  });
});
