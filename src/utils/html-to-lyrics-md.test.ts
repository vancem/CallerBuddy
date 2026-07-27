import { describe, expect, it } from "vitest";
import { htmlToLyricsMarkdown } from "./html-to-lyrics-md.js";

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
