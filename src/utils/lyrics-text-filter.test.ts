// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  decodeHtmlBytes,
  filterLyricsText,
  plainTextToMarkdownHardBreaks,
} from "../utils/lyrics-text-filter.js";
import { importHtmlToMarkdown } from "../services/lyrics-import.js";

/** Build an ArrayBuffer whose bytes match Latin-1 / windows-1252 code units. */
function bytesFromLatin1(source: string): ArrayBuffer {
  const bytes = new Uint8Array(source.length);
  for (let i = 0; i < source.length; i++) {
    bytes[i] = source.charCodeAt(i) & 0xff;
  }
  return bytes.buffer;
}

describe("filterLyricsText", () => {
  it("preserves Unicode letters and punctuation", () => {
    expect(filterLyricsText("Søren — café")).toBe("Søren — café");
  });

  it("normalizes newlines to LF", () => {
    expect(filterLyricsText("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("maps windows-1252 C1 controls to Unicode", () => {
    // U+0085 / U+0091 / U+0092 as if latin1-misread
    expect(filterLyricsText("Ooo\u0085 diggin\u0092")).toBe("Ooo… diggin’");
  });

  it("strips replacement characters and other controls", () => {
    expect(filterLyricsText("a\uFFFDb\u0000c")).toBe("abc");
  });
});

describe("plainTextToMarkdownHardBreaks", () => {
  it("adds trailing backslashes for significant newlines", () => {
    expect(plainTextToMarkdownHardBreaks("line one\nline two")).toBe(
      "line one\\\nline two\\\n",
    );
  });

  it("keeps blank lines as paragraph breaks", () => {
    expect(plainTextToMarkdownHardBreaks("a\n\nb")).toBe("a\\\n\nb\\\n");
  });

  it("bolds square-dance calls like import conversion", () => {
    expect(plainTextToMarkdownHardBreaks("Heads square thru 4\nPass thru")).toBe(
      "**Heads** **square thru** **4**\\\n**Pass thru**\\\n",
    );
  });

  it("escapes leading # and * so they are not Markdown", () => {
    expect(plainTextToMarkdownHardBreaks("# not a heading\n* not a list")).toBe(
      "\\# not a heading\\\n\\* not a list\\\n",
    );
  });

  it("escapes a run of leading # characters", () => {
    expect(plainTextToMarkdownHardBreaks("## foo")).toBe("\\#\\# foo\\\n");
  });

  it("promotes Opener/Figure/Closer/Tag/Middle Break lines to ## headers", () => {
    expect(
      plainTextToMarkdownHardBreaks("Opener\nCircle left\nFigure\nCloser\nTag\nMiddle Break"),
    ).toBe("## Opener\n**Circle** **left**\\\n## Figure\n## Closer\n## Tag\n## Middle Break\n");
  });

  it("promotes any word starting with Open or Close", () => {
    expect(plainTextToMarkdownHardBreaks("Open\nOpening\nOpener\nClose\nCloser")).toBe(
      "## Open\n## Opening\n## Opener\n## Close\n## Closer\n",
    );
  });

  it("leaves lines that already have ## headers alone", () => {
    expect(plainTextToMarkdownHardBreaks("## Opener\n## Figure (heads)")).toBe(
      "## Opener\n## Figure (heads)\n",
    );
  });

  it("does not promote the call Tag the line", () => {
    expect(plainTextToMarkdownHardBreaks("Tag the line")).toBe("**Tag the line**\\\n");
  });
});

describe("decodeHtmlBytes", () => {
  it("decodes windows-1252 meta charset (ellipsis and curly quotes)", () => {
    // 0x85=…, 0x91=‘, 0x92=’ in windows-1252
    const html =
      '<html><head><meta charset="windows-1252"></head>' +
      "<body><p>Ooo\x85 diggin\x92 \x91round</p></body></html>";
    const decoded = decodeHtmlBytes(bytesFromLatin1(html));
    expect(decoded).toContain("Ooo…");
    expect(decoded).toContain("diggin’");
    expect(decoded).toContain("‘round");
    expect(decoded).not.toContain("\uFFFD");
  });

  it("decodes windows-1252 apostrophe when charset meta is missing", () => {
    // Invalid as UTF-8 (lone 0x92), so decoder falls back to windows-1252
    const html =
      "<html><body><p>there\x92s no need</p><p>I\x92m sure</p></body></html>";
    const decoded = decodeHtmlBytes(bytesFromLatin1(html));
    expect(decoded).toContain("there\u2019s no need");
    expect(decoded).toContain("I\u2019m sure");
    expect(decoded).not.toContain("\uFFFD");
  });
});

describe("importHtmlToMarkdown charset", () => {
  it("keeps curly apostrophe and ellipsis after windows-1252 decode", () => {
    const html =
      '<html><head><meta charset="windows-1252"></head><body>' +
      "<p>Ooo\x85 diggin\x92 \x91round the floor</p>" +
      "</body></html>";
    const decoded = decodeHtmlBytes(bytesFromLatin1(html));
    const { markdown } = importHtmlToMarkdown(decoded, "TST 1", "Charset Sample");
    expect(markdown).toContain("Ooo…");
    expect(markdown).toMatch(/diggin’/);
    expect(markdown).toMatch(/‘round|round/);
  });
});
