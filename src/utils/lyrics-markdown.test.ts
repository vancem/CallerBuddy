import { describe, expect, it } from "vitest";
import { parseLyricsMarkdown, generateLyricsMarkdownTemplate } from "./lyrics-markdown.js";

describe("parseLyricsMarkdown", () => {
  it("renders title, info, heading, bold, and hard breaks", () => {
    const md = [
      "# One Call Away",
      "_(NB 412)_",
      "",
      "## Opener",
      "**Sides** face **grand square**\\",
      "I'm only one call away\\",
      "",
    ].join("\n");
    const html = parseLyricsMarkdown(md);
    expect(html).toContain("<h1>One Call Away</h1>");
    expect(html).toContain('<em class="info">(NB 412)</em>');
    expect(html).toContain("<h2>Opener</h2>");
    expect(html).toContain("<strong>Sides</strong>");
    expect(html).toContain("<br>");
    expect(html).not.toMatch(/\\<\/p>/);
  });

  it("escapes raw HTML", () => {
    const html = parseLyricsMarkdown("Hello <script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("generateLyricsMarkdownTemplate", () => {
  it("includes title, label, figure stub, and markdown examples", () => {
    const md = generateLyricsMarkdownTemplate("Sail Away", "RYL 607");
    expect(md).toContain("# Sail Away");
    expect(md).toContain("_(RYL 607)_");
    expect(md).toContain("## Figure");
    expect(md).toContain("Paste lyrics here\\");
    expect(md).toContain("Lyrics can have **calls** in them\\");
    expect(md.trimEnd().endsWith("\\")).toBe(true);
  });
});
