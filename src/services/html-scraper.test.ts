// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { scrapeAndNormalizeLyrics, scrapeTxtLyrics } from "./html-scraper.js";

describe("scrapeAndNormalizeLyrics", () => {
  it("produces normalized output from cuesheet2-style HTML", () => {
    const input = `<HTML><HEAD><TITLE>Love Grows (Royal 145)</TITLE>
      <LINK rel="STYLESHEET" type="text/css" HREF="cuesheet2.css">
      </HEAD><BODY>
      <FONT CLASS="title">Love Grows</FONT>
      <FONT CLASS="label">(Royal 145)</FONT>
      <P CLASS="hdr">OPENER - BREAK - CLOSER</P><br>
      Circle to the left<br>
      <FONT CLASS="lyrics"><L>She ain't got no money</L></FONT><br>
      <P CLASS="hdr">FIGURE</P><br>
      Head couples promenade go 1/2 way<br>
      </BODY></HTML>`;

    const result = scrapeAndNormalizeLyrics(input, "RYL 145", "Love Grows");

    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<h1>Love Grows <span");
    expect(result).toContain("RYL 145");
    expect(result).toContain("<h2>");
  });

  it("produces output from Word-exported HTML (BS/RWH style)", () => {
    const input = `<html xmlns:o="urn:schemas-microsoft-com:office:office">
      <head><title>BS 2493</title></head>
      <body>
      <div class=Section1>
        <p align=center><b><span style='font-size:13.5pt;color:#CC3300'>BS 2469</span></b></p>
        <p align=center><b><span style='font-size:13.5pt'>"WITCH DOCTOR"</span></b></p>
        <p align=center><u><span style='font-size:13.5pt'>Opener, Breaks</span></u></p>
        <p>You've been keeping love from me</p>
        <p><u><span>Figure</span></u></p>
        <p>Heads Lead Right and Smile</p>
      </div>
      </body></html>`;

    const result = scrapeAndNormalizeLyrics(input, "BS 2469", "Witch Doctor");

    expect(result).toContain("<h1>Witch Doctor");
    expect(result).toContain("BS 2469");
    expect(result).toContain("Opener");
    expect(result).toContain("Figure");
    expect(result).toContain("keeping love");
    expect(result).toContain("Lead Right");
  });

  it("strips images and noise elements", () => {
    const input = `<html><body>
      <img src="logo.png" />
      <script>alert('hi')</script>
      <style>.foo{}</style>
      <h2>Opener</h2>
      <p>Circle Left</p>
    </body></html>`;

    const result = scrapeAndNormalizeLyrics(input, "TEST 1", "Test");

    expect(result).not.toContain("logo.png");
    expect(result).not.toContain("alert");
    expect(result).not.toContain(".foo");
    expect(result).toContain("Circle");
    expect(result).toContain("Left");
  });

  it("handles HTML with no section headers", () => {
    const input = `<html><body>
      <p>Some text without any headers</p>
      <p>More text here</p>
    </body></html>`;

    const result = scrapeAndNormalizeLyrics(input, "X 1", "Test");

    expect(result).toContain("Some text without any headers");
    expect(result).toContain("More text here");
  });

  it("preserves br line breaks within paragraphs", () => {
    const input = `<html><body>
      <h2>Opener</h2>
      <p>Line one<br>Line two<br>Line three</p>
    </body></html>`;

    const result = scrapeAndNormalizeLyrics(input, "X 1", "Test");

    expect(result).toContain("Line one<br>");
    expect(result).toContain("Line two<br>");
  });

  it("wraps with correct document structure", () => {
    const input = `<html><body>
      <h2>Opener</h2>
      <p>Hello world</p>
    </body></html>`;

    const result = scrapeAndNormalizeLyrics(input, "ABC 123", "My Song");

    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain('<meta charset="utf-8">');
    expect(result).toContain("<title>My Song</title>");
    expect(result).toContain("lightyellow");
    expect(result).toContain("Comic Sans MS");
  });
});

describe("scrapeTxtLyrics", () => {
  it("converts plain text with section headers to HTML", () => {
    const input = `Opener
Circle Left
She ain't got no money
Her clothes look kind of funny

Figure
Head couples promenade go 1/2 way`;

    const result = scrapeTxtLyrics(input, "RYL 145", "Love Grows");

    expect(result).toContain("<h1>Love Grows");
    expect(result).toContain("<h2>Opener</h2>");
    expect(result).toContain("<h2>Figure</h2>");
    expect(result).toContain("Circle");
    expect(result).toContain("<b>promenade</b>");
  });

  it("handles text with no section headers", () => {
    const input = "Just some plain lyrics\nWith no sections";
    const result = scrapeTxtLyrics(input, "X 1", "Test");

    expect(result).toContain("Just some plain lyrics");
    expect(result).toContain("With no sections");
  });

  it("escapes HTML entities in text content", () => {
    const input = "Opener\nRight & Left Thru <all>";
    const result = scrapeTxtLyrics(input, "X 1", "Test");

    expect(result).toContain("<b>Right &amp; Left Thru</b> &lt;all&gt;");
  });
});
