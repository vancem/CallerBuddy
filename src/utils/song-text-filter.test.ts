import { describe, expect, it } from "vitest";
import { songMatchesTextFilter } from "./song-text-filter.js";

const song = (title: string, label = "", categories = "") => ({
  title,
  label,
  categories,
});

describe("songMatchesTextFilter", () => {
  it("matches empty / whitespace-only filter", () => {
    expect(songMatchesTextFilter(song("Hello"), "")).toBe(true);
    expect(songMatchesTextFilter(song("Hello"), "   ")).toBe(true);
  });

  it("matches a single term case-insensitively across fields", () => {
    expect(songMatchesTextFilter(song("Hello World"), "hello")).toBe(true);
    expect(songMatchesTextFilter(song("x", "RYL 1"), "ryl")).toBe(true);
    expect(songMatchesTextFilter(song("x", "", "Christmas"), "christmas")).toBe(
      true,
    );
    expect(songMatchesTextFilter(song("Hello"), "goodbye")).toBe(false);
  });

  it("requires every space-separated term (AND)", () => {
    const s = song("Hello There Friend");
    expect(songMatchesTextFilter(s, "Hello There")).toBe(true);
    expect(songMatchesTextFilter(s, "hello friend")).toBe(true);
    expect(songMatchesTextFilter(s, "Hello Missing")).toBe(false);
  });

  it("allows terms to match different fields", () => {
    const s = song("Hello", "RYL", "Christmas");
    expect(songMatchesTextFilter(s, "Hello Christmas")).toBe(true);
    expect(songMatchesTextFilter(s, "ryl christmas")).toBe(true);
  });

  it("treats !term as exclusion", () => {
    const s = song("Hello There");
    expect(songMatchesTextFilter(s, "!Hello")).toBe(false);
    expect(songMatchesTextFilter(s, "!Missing")).toBe(true);
    expect(songMatchesTextFilter(s, "!Hello !There")).toBe(false);
    expect(songMatchesTextFilter(song("Other Song"), "!Hello !There")).toBe(
      true,
    );
  });

  it("combines required and excluded terms", () => {
    expect(
      songMatchesTextFilter(song("Hello World"), "Hello !There"),
    ).toBe(true);
    expect(
      songMatchesTextFilter(song("Hello There"), "Hello !There"),
    ).toBe(false);
  });

  it("ignores bare ! tokens", () => {
    expect(songMatchesTextFilter(song("Hello"), "!")).toBe(true);
    expect(songMatchesTextFilter(song("Hello"), "! Hello")).toBe(true);
  });

  it("collapses extra whitespace between terms", () => {
    expect(songMatchesTextFilter(song("Hello There"), "  Hello   There  ")).toBe(
      true,
    );
  });
});
