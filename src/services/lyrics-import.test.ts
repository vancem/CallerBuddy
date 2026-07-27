// @vitest-environment jsdom
import { readFileSync } from "fs";
import { describe, it, expect } from "vitest";
import { importHtmlToMarkdown, importTextToMarkdown } from "./lyrics-import.js";

describe("importHtmlToMarkdown", () => {
  it("keeps cuesheet2 body text (One Call Away)", () => {
    const raw = readFileSync(
      "demoMusic/tests/singingCalls/NB-412 One_Call_Away/One Call Away - NB-412 BGV.htm",
      "utf8",
    );
    const { markdown } = importHtmlToMarkdown(raw, "NB-412", "One Call Away");

    expect(markdown).toContain("# One Call Away");
    expect(markdown).toContain("_(NB-412)_");
    expect(markdown).toContain("## Opener");
    expect(markdown).toMatch(/grand square/i);
    expect(markdown).toContain("Superman");
    expect(markdown).toContain("## Figure");
    expect(markdown).toContain("## Middle Break");
    expect(markdown).toContain("## Closer");
    expect(markdown).toContain("## Tag");
  });

  it("keeps cuesheet2 mini fixture body", () => {
    const input = `<HTML><BODY>
      <FONT CLASS="title">Love Grows</FONT>
      <P CLASS="hdr">OPENER - BREAK - CLOSER</P><br>
      Circle to the left<br>
      <FONT CLASS="lyrics"><L>She ain't got no money</L></FONT><br>
      <P CLASS="hdr">FIGURE</P><br>
      Head couples promenade go 1/2 way<br>
      </BODY></HTML>`;

    const { markdown } = importHtmlToMarkdown(input, "RYL 145", "Love Grows");
    expect(markdown).toMatch(/\*\*Circle\*\* to the \*\*left\*\*/);
    expect(markdown).toContain("She ain't got no money");
    expect(markdown).toContain("promenade");
  });

  it("handles Word-style underlined sections", () => {
    const input = `<html><body>
      <p><u>Opener, Breaks</u></p>
      <p>You've been keeping love from me</p>
      <p><u>Figure</u></p>
      <p>Heads Lead Right and Smile</p>
    </body></html>`;

    const { markdown } = importHtmlToMarkdown(input, "BS 2469", "Witch Doctor");
    expect(markdown).toContain("Opener");
    expect(markdown).toContain("keeping love");
    expect(markdown).toContain("Lead Right");
  });
});

describe("importTextToMarkdown", () => {
  it("converts plain text sections", () => {
    const { markdown } = importTextToMarkdown(
      "Opener\nCircle Left\nHello\n\nFigure\nHeads Promenade",
      "X 1",
      "Test",
    );
    expect(markdown).toContain("## Opener");
    expect(markdown).toContain("Circle");
    expect(markdown).toContain("## Figure");
  });
});
