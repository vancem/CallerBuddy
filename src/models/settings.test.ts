import { describe, it, expect } from "vitest";
import { defaultSettings, DEFAULT_BREAK_TIMER_MINUTES } from "./settings.js";

describe("defaultSettings", () => {
  it("returns correct default values", () => {
    const s = defaultSettings();
    expect(s.breakTimerMinutes).toBe(DEFAULT_BREAK_TIMER_MINUTES);
    expect(s.patterTimerMinutes).toBe(5);
  });

  it("returns a new object each call (no shared reference)", () => {
    const a = defaultSettings();
    const b = defaultSettings();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
