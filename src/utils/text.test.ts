import { describe, expect, it } from "vitest";
import { escapeHtml, toTitleCase } from "./text.js";

describe("toTitleCase", () => {
  it("capitalizes the first letter of each major word", () => {
    expect(toTitleCase("WITCH DOCTOR")).toBe("Witch Doctor");
  });

  it("keeps minor words lowercase after the first word", () => {
    expect(toTitleCase("LOVE GROWS WHERE MY ROSEMARY GOES")).toBe(
      "Love Grows Where My Rosemary Goes",
    );
  });

  it("capitalizes a leading minor word", () => {
    expect(toTitleCase("THE WITCH DOCTOR")).toBe("The Witch Doctor");
  });
});

describe("escapeHtml", () => {
  it("escapes markup characters", () => {
    expect(escapeHtml(`a & b <c> "d"`)).toBe("a &amp; b &lt;c&gt; &quot;d&quot;");
  });
});
