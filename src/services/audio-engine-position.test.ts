import { describe, expect, it } from "vitest";
import { songPositionSeconds } from "./audio-engine.js";

describe("songPositionSeconds", () => {
  it("returns absolute time when looping is disabled", () => {
    expect(songPositionSeconds(42, 0, 0)).toBe(42);
  });

  it("returns 0 at song start with a default patter loop (0 to end)", () => {
    expect(songPositionSeconds(0, 0, 199.98)).toBe(0);
  });

  it("does not jump to loop end when playback starts before loopStart", () => {
    expect(songPositionSeconds(0, 30, 180)).toBe(0);
    expect(songPositionSeconds(15, 30, 180)).toBe(15);
  });

  it("wraps within the loop region after loopStart", () => {
    expect(songPositionSeconds(50, 30, 180)).toBe(50);
    expect(songPositionSeconds(180, 30, 180)).toBe(30);
    expect(songPositionSeconds(210, 30, 180)).toBe(60);
  });
});
