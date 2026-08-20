import { describe, expect, it } from "vitest";
import { decodePathSegment, normalizePlaylistRelPath } from "./playlist-path.js";

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
