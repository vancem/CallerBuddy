// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  analyzeZipForOnboarding,
  computeDestNames,
  _testOnly,
} from "./song-onboarding.js";

const {
  extractLabel,
  extractTitle,
  scoreMp3Candidates,
  selectBestHtml,
  cleanTitle,
  normalizeTitle,
} = _testOnly;

// ---------------------------------------------------------------------------
// Label extraction
// ---------------------------------------------------------------------------

describe("extractLabel", () => {
  it("extracts label from standard ZIP name", () => {
    expect(extractLabel("BS 2469 - WITCH DOCTOR.zip", [])).toBe("BS 2469");
  });

  it("extracts label with dash separator (NB-412)", () => {
    expect(extractLabel("NB-412 One_Call_Away.zip", [])).toBe("NB-412");
  });

  it("extracts 5-letter label (STING 21301)", () => {
    expect(extractLabel("STING 21301 - Forever in Blue Jeans.zip", [])).toBe(
      "STING 21301",
    );
  });

  it("falls back to MP3 filenames when ZIP name has no label", () => {
    const mp3s = [
      "Singing Calls/Daydream Believer - SIR 1203.mp3",
      "Vocals/Vocal - Daydream Believer - SIR 1203.mp3",
    ];
    expect(extractLabel("Daydream Believer.zip", mp3s)).toBe("SIR 1203");
  });

  it("handles reversed TITLE - LABEL convention", () => {
    const mp3s = [
      "Wonderful Tonight - SIR 804.mp3",
      "Vocal - Wonderful Tonight - SIR 804.mp3",
    ];
    expect(extractLabel("SIR 804 - Wonderful Tonight.zip", mp3s)).toBe(
      "SIR 804",
    );
  });

  it("returns empty string when no label found", () => {
    const mp3s = ["Devil Went Down To Georgia.mp3"];
    expect(extractLabel("Devil Went down to Georga.zip", mp3s)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Title extraction
// ---------------------------------------------------------------------------

describe("extractTitle", () => {
  it("extracts title from standard ZIP name", () => {
    expect(
      extractTitle(
        "BS 2469 - WITCH DOCTOR.zip",
        [],
        "BS 2469",
      ),
    ).toBe("Witch Doctor");
  });

  it("extracts title when ZIP name has no label", () => {
    expect(
      extractTitle("Daydream Believer.zip", [], ""),
    ).toBe("Daydream Believer");
  });

  it("replaces underscores with spaces", () => {
    expect(
      extractTitle(
        "NB-412 One_Call_Away.zip",
        [],
        "NB-412",
      ),
    ).toBe("One Call Away");
  });

  it("converts ALL CAPS to Title Case", () => {
    expect(
      extractTitle(
        "RR 275  BOOGIE SHOES.zip",
        [],
        "RR 275",
      ),
    ).toBe("Boogie Shoes");
  });

  it("preserves mixed case titles", () => {
    expect(
      extractTitle(
        "RIV 1155 - Part Of Your World.zip",
        [],
        "RIV 1155",
      ),
    ).toBe("Part Of Your World");
  });

  it("falls through to MP3 names when ZIP name is just the label (STING 21301 case)", () => {
    const mp3s = [
      "STING 21301 - Forever in Blue Jeans/Singing Calls/Forever In Blue Jeans - STING 21301.mp3",
      "STING 21301 - Forever in Blue Jeans/Vocals/Forever In Blue Jeans (Vocal) - STING 21301.mp3",
    ];
    expect(
      extractTitle("STING 21301.zip", mp3s, "STING 21301"),
    ).toBe("Forever In Blue Jeans");
  });

  it("falls through to MP3 names when ZIP name is label without extension", () => {
    const mp3s = [
      "Wonderful Tonight - SIR 804.mp3",
    ];
    expect(
      extractTitle("SIR 804.zip", mp3s, "SIR 804"),
    ).toBe("Wonderful Tonight");
  });
});

describe("cleanTitle", () => {
  it("strips parenthetical descriptors", () => {
    expect(cleanTitle("Sweet Caroline (Extended NO Leads)")).toBe(
      "Sweet Caroline",
    );
  });

  it("strips 'by CallerName' suffix", () => {
    expect(cleanTitle("Witch Doctor by Mike Seastrom")).toBe("Witch Doctor");
  });

  it("strips trailing pitch markers", () => {
    expect(cleanTitle("ROCKY TOP.-2")).toBe("Rocky Top");
  });

  it("strips Original prefix", () => {
    expect(cleanTitle("Original Mama Mia")).toBe("Mama Mia");
  });
});

describe("normalizeTitle", () => {
  it("converts ALL CAPS to Title Case", () => {
    expect(normalizeTitle("BEAUTIFUL SUNDAY")).toBe("Beautiful Sunday");
  });

  it("preserves Title Case text", () => {
    expect(normalizeTitle("Come Sail Away")).toBe("Come Sail Away");
  });

  it("handles empty string", () => {
    expect(normalizeTitle("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// MP3 scoring
// ---------------------------------------------------------------------------

describe("scoreMp3Candidates", () => {
  it("ranks base instrumental highest (lowest score)", () => {
    const paths = [
      "BS 2634 - SINGING IN THE RAIN.mp3",
      "BS 2634 - SINGING IN THE RAIN by Eric Henerlau.mp3",
    ];
    const results = scoreMp3Candidates(paths, "BS 2634", "Singing in the Rain");
    expect(results[0].filename).toBe("BS 2634 - SINGING IN THE RAIN.mp3");
    expect(results[0].score).toBeLessThan(results[1].score);
  });

  it("penalizes vocal versions heavily", () => {
    const paths = [
      "COY 847 - Jingle Bell Rock.mp3",
      "COY 847v - Jingle Bell Rock by Don Coy.mp3",
    ];
    const results = scoreMp3Candidates(paths, "COY 847", "Jingle Bell Rock");
    expect(results[0].filename).toBe("COY 847 - Jingle Bell Rock.mp3");
  });

  it("prefers (m) / (music) / (Instrumental) markers", () => {
    const paths = [
      "RWH 1082 HEY LOOK ME OVER (m).mp3",
      "RWH 1082 HEY LOOK ME OVER by Buddy Weaver.mp3",
    ];
    const results = scoreMp3Candidates(paths, "RWH 1082", "Hey Look Me Over");
    expect(results[0].filename).toContain("(m)");
  });

  it("penalizes harmony versions", () => {
    const paths = [
      "BS 2573 SUGAR SUGAR (m).mp3",
      "BS 2573 SUGAR SUGAR (harmony).mp3",
      "BS 2573 SUGAR SUGAR by Eric Henerlau.mp3",
    ];
    const results = scoreMp3Candidates(paths, "BS 2573", "Sugar Sugar");
    expect(results[0].filename).toContain("(m)");
    expect(results[1].filename).toContain("(harmony)");
  });

  it("handles archives with only vocal versions", () => {
    const paths = [
      "One Call Away - NB-412 BGV.mp3",
      "One Call Away - NB-412V.mp3",
    ];
    const results = scoreMp3Candidates(paths, "NB-412", "One Call Away");
    expect(results.length).toBe(2);
    // BGV should rank before V (full vocal)
    expect(results[0].filename).toContain("BGV");
  });

  it("penalizes 'Original' prefix (non-square-dance)", () => {
    const paths = [
      "RR 357M - MAMA MIA.mp3",
      "Original Mama Mia.mp3",
    ];
    const results = scoreMp3Candidates(paths, "RR 357", "Mama Mia");
    expect(results[0].filename).toContain("357M");
  });

  it("ranks alternate suffixes (A, B) in the middle", () => {
    const paths = [
      "RR 104 - Rocky Top.html",  // not mp3, should be filtered by caller
      "RR 104A - Rocky Top.mp3",
      "RR 104B - ROCKY TOP.mp3",
    ].filter((p) => p.endsWith(".mp3"));
    const results = scoreMp3Candidates(paths, "RR 104", "Rocky Top");
    // Both should have moderate scores
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThan(100);
    }
  });
});

// ---------------------------------------------------------------------------
// HTML selection
// ---------------------------------------------------------------------------

describe("selectBestHtml", () => {
  it("prefers HTML matching the label", () => {
    const htmls = [
      "AEGO 201 - Hallelujah (from Shrek).html",
      "AEGO 201c - Hallelujah (Christmas Lyrics).htm",
      "Hallelujah (Shrek).htm",
    ];
    const result = selectBestHtml(htmls, "AEGO 201", "Hallelujah");
    expect(result).toBe("AEGO 201 - Hallelujah (from Shrek).html");
  });

  it("returns single HTML file when only one exists", () => {
    expect(selectBestHtml(["BS 2469.html"], "BS 2469", "Witch Doctor")).toBe(
      "BS 2469.html",
    );
  });

  it("returns empty for no HTML files", () => {
    expect(selectBestHtml([], "BS 2469", "Witch Doctor")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// computeDestNames
// ---------------------------------------------------------------------------

describe("computeDestNames", () => {
  it("generates standard LABEL - Title names", () => {
    const { destMp3Name, destHtmlName } = computeDestNames(
      "BS 2469",
      "Witch Doctor",
      true,
    );
    expect(destMp3Name).toBe("BS 2469 - Witch Doctor.mp3");
    expect(destHtmlName).toBe("BS 2469 - Witch Doctor.html");
  });

  it("omits HTML name when no lyrics", () => {
    const { destHtmlName } = computeDestNames("RR 104", "Rocky Top", false);
    expect(destHtmlName).toBe("");
  });

  it("handles missing label", () => {
    const { destMp3Name } = computeDestNames("", "Some Song", true);
    expect(destMp3Name).toBe("Some Song.mp3");
  });
});

// ---------------------------------------------------------------------------
// Full analyzeZipForOnboarding
// ---------------------------------------------------------------------------

describe("analyzeZipForOnboarding", () => {
  it("produces a complete proposal for a standard archive", async () => {
    const entries = [
      "BS 2634 - SINGING IN THE RAIN by Eric Henerlau.mp3",
      "BS 2634 - SINGING IN THE RAIN.html",
      "BS 2634 - SINGING IN THE RAIN.mp3",
      "BS 2634.pdf",
    ];

    const mockRead = async (path: string): Promise<string> => {
      if (path.endsWith(".html")) {
        return `<html><body>
          <h1>Singing In The Rain</h1>
          <h2>Opener</h2>
          <p>Circle Left<br>Singin in the rain</p>
          <h2>Figure</h2>
          <p>Heads Promenade<br>Halfway round</p>
        </body></html>`;
      }
      return "";
    };

    const proposal = await analyzeZipForOnboarding(
      "BS 2634 - SINGING IN THE RAIN.zip",
      entries,
      mockRead,
    );

    expect(proposal.label).toBe("BS 2634");
    expect(proposal.title).toBe("Singing in the Rain");
    expect(proposal.mp3Candidates.length).toBe(2);
    expect(proposal.selectedMp3).toBe("BS 2634 - SINGING IN THE RAIN.mp3");
    expect(proposal.normalizedHtml).toContain("Opener");
    expect(proposal.normalizedHtml).toContain("Figure");
    expect(proposal.destMp3Name).toBe("BS 2634 - Singing in the Rain.mp3");
  });

  it("handles archive with no HTML (TXT fallback)", async () => {
    const entries = [
      "RR 104A - Rocky Top.mp3",
      "RR 104 - Rocky Top.txt",
    ];

    const mockRead = async (path: string): Promise<string> => {
      if (path.endsWith(".txt")) {
        return "Opener\nCircle Left\nRocky Top Tennessee\n\nFigure\nHeads Promenade";
      }
      return "";
    };

    const proposal = await analyzeZipForOnboarding(
      "RR 104 - ROCKY TOP.zip",
      entries,
      mockRead,
    );

    expect(proposal.label).toBe("RR 104");
    expect(proposal.normalizedHtml).toContain("Opener");
    expect(proposal.normalizedHtml).toContain("Rocky Top Tennessee");
  });
});
