// @vitest-environment jsdom
import { readFileSync } from "fs";
import { describe, it, expect } from "vitest";
import {
  decodeHtmlBytes,
  filterLyricsText,
  plainTextToMarkdownHardBreaks,
} from "../utils/lyrics-text-filter.js";
import { importHtmlToMarkdown } from "../services/lyrics-import.js";

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
  it("decodes windows-1252 meta charset (Dancing Queen)", () => {
    const buf = readFileSync(
      "demoMusic/tests/singingCalls/RIV 675 - Dancing Queen/RIV 675 - Dancing Queen.html",
    );
    const html = decodeHtmlBytes(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(html).toContain("Ooo…");
    expect(html).toContain("diggin’");
    expect(html).toContain("‘round");
    expect(html).not.toContain("\uFFFD");
  });

  it("decodes windows-1252 apostrophe when charset meta is missing (YMCA)", () => {
    const buf = readFileSync("demoMusic/tests/singingCalls/RIV 250 - YMCA/RIV 250 - YMCA.html");
    const html = decodeHtmlBytes(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(html).toContain("there\u2019s no need");
    expect(html).toContain("I\u2019m sure");
    expect(html).not.toContain("\uFFFD");
  });
});

describe("importHtmlToMarkdown charset", () => {
  it("keeps curly apostrophe and ellipsis from Dancing Queen", () => {
    const buf = readFileSync(
      "demoMusic/tests/singingCalls/RIV 675 - Dancing Queen/RIV 675 - Dancing Queen.html",
    );
    const html = decodeHtmlBytes(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const { markdown } = importHtmlToMarkdown(html, "RIV 675", "Dancing Queen");
    expect(markdown).toContain("Ooo…");
    expect(markdown).toMatch(/diggin’/);
    expect(markdown).toMatch(/‘round|round/);
  });
});
