import { describe, expect, it } from "vitest";
import {
  decodePathSegment,
  isEditorSongOnPlaylist,
  normalizePlaylistRelPath,
} from "./playlist-path.js";

describe("decodePathSegment", () => {
  it("decodes URI-encoded segments", () => {
    expect(decodePathSegment("primary%3ACallerBuddy")).toBe("primary:CallerBuddy");
  });

  it("returns the original string when decoding fails", () => {
    expect(decodePathSegment("%E0%A4%A")).toBe("%E0%A4%A");
  });
});

const ROOT = "CallerBuddy";

describe("normalizePlaylistRelPath", () => {
  it("keeps Windows-style subfolder paths unchanged", () => {
    expect(normalizePlaylistRelPath("patter/BS 579 - Candy Girl.mp3", ROOT)).toBe(
      "patter/BS 579 - Candy Girl.mp3",
    );
  });

  it("keeps root-level filenames unchanged", () => {
    expect(normalizePlaylistRelPath("RR 247 - Joy To The World.mp3", ROOT)).toBe(
      "RR 247 - Joy To The World.mp3",
    );
  });

  it("strips Android URI-encoded subfolder paths", () => {
    expect(
      normalizePlaylistRelPath(
        "document/primary%3ACallerBuddy%2Fpatter/ESP 446 - Barbie.mp3",
        ROOT,
      ),
    ).toBe("patter/ESP 446 - Barbie.mp3");
  });

  it("strips decoded Android paths", () => {
    expect(
      normalizePlaylistRelPath(
        "document/primary:CallerBuddy/patter/RWH 1133 - Bare Neccessities.mp3",
        ROOT,
      ),
    ).toBe("patter/RWH 1133 - Bare Neccessities.mp3");
  });

  it("normalizes played-path entries the same way", () => {
    expect(
      normalizePlaylistRelPath(
        "document/primary%3ACallerBuddy%2Fpatter/BS 579 - Candy Girl.mp3",
        ROOT,
      ),
    ).toBe("patter/BS 579 - Candy Girl.mp3");
  });
});

describe("isEditorSongOnPlaylist", () => {
  const playlist = ["patter/BS 579 - Candy Girl.mp3", "RR 247 - Joy To The World.mp3"];

  it("matches a root song by filename", () => {
    expect(
      isEditorSongOnPlaylist(
        { musicFile: "RR 247 - Joy To The World.mp3" },
        "",
        playlist,
      ),
    ).toBe(true);
  });

  it("matches a subfolder song by folder plus filename", () => {
    expect(
      isEditorSongOnPlaylist(
        { musicFile: "BS 579 - Candy Girl.mp3" },
        "patter",
        playlist,
      ),
    ).toBe(true);
  });

  it("does not match the same filename in a different folder", () => {
    expect(
      isEditorSongOnPlaylist(
        { musicFile: "BS 579 - Candy Girl.mp3" },
        "singing",
        playlist,
      ),
    ).toBe(false);
  });

  it("uses playlistRelPath on the row when the folder path is unknown", () => {
    expect(
      isEditorSongOnPlaylist(
        {
          musicFile: "BS 579 - Candy Girl.mp3",
          playlistRelPath: "patter/BS 579 - Candy Girl.mp3",
        },
        null,
        playlist,
      ),
    ).toBe(true);
  });

  it("returns false when the song is not on the playlist", () => {
    expect(
      isEditorSongOnPlaylist(
        { musicFile: "SQD 101 - Sunny Side.mp3" },
        "",
        playlist,
      ),
    ).toBe(false);
  });
});
