import { describe, expect, it } from "vitest";
import { htmlToLyricsMarkdown } from "./html-to-lyrics-md.js";
import { parseLyricsMarkdown } from "./lyrics-markdown.js";

describe("htmlToLyricsMarkdown", () => {
  it("converts title, info, headings, bold, and br", () => {
    const html = `<!DOCTYPE html><html><body>
<p><h1>Witch Doctor</h1>&nbsp;<span class="info">(BS 2469)</span></p>
<h2>Figure</h2>
<p><b>Heads</b> lead right<br>
Swing and promenade</p>
</body></html>`;
    const { markdown } = htmlToLyricsMarkdown(html);
    expect(markdown).toContain("# Witch Doctor");
    expect(markdown).toContain("_(BS 2469)_");
    expect(markdown).toContain("## Figure");
    expect(markdown).toContain("**Heads** lead right\\");
    expect(markdown).toContain("Swing and promenade\\");
  });
});

describe("lyrics Markdown ↔ HTML round-trip (editor bridge)", () => {
  it("preserves title, info, section, bold, and hard breaks", () => {
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
    const { markdown } = htmlToLyricsMarkdown(html);
    expect(markdown).toContain("# One Call Away");
    expect(markdown).toContain("_(NB 412)_");
    expect(markdown).toContain("## Opener");
    expect(markdown).toContain("**Sides**");
    expect(markdown).toContain("**grand square**");
    expect(markdown).toMatch(/face .*grand square.*\\/s);
    expect(markdown).toContain("I'm only one call away\\");
  });

  it("round-trips a second time without losing structure", () => {
    const md = [
      "# Sail Away",
      "_(RYL 607)_",
      "",
      "## Figure",
      "**Heads** promenade\\",
      "half way\\",
      "",
    ].join("\n");
    const once = htmlToLyricsMarkdown(parseLyricsMarkdown(md)).markdown;
    const twice = htmlToLyricsMarkdown(parseLyricsMarkdown(once)).markdown;
    expect(twice).toContain("# Sail Away");
    expect(twice).toContain("_(RYL 607)_");
    expect(twice).toContain("## Figure");
    expect(twice).toContain("**Heads** promenade\\");
    expect(twice).toContain("half way\\");
    expect(twice.trim()).toBe(once.trim());
  });
});
