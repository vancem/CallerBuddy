import { describe, it, expect } from "vitest";
import {
  defaultSettings,
  DEFAULT_BREAK_TIMER_MINUTES,
  DEFAULT_LYRICS_FONT_SCALE_DESKTOP,
  DEFAULT_LYRICS_FONT_SCALE_PHONE,
  DEFAULT_PLAYLIST_PANEL_HEIGHT,
  DEFAULT_PLAYLIST_PANEL_WIDTH,
  normalizeSettings,
} from "./settings.js";

describe("defaultSettings", () => {
  it("returns correct default values", () => {
    const s = defaultSettings();
    expect(s.breakTimerMinutes).toBe(DEFAULT_BREAK_TIMER_MINUTES);
    expect(s.patterTimerMinutes).toBe(6);
    expect(s.playlistPanelWidth).toBe(DEFAULT_PLAYLIST_PANEL_WIDTH);
    expect(s.playlistPanelHeight).toBe(DEFAULT_PLAYLIST_PANEL_HEIGHT);
    expect(s.playlistPaths).toEqual([]);
    expect(s.playlistPlayedPaths).toEqual([]);
    expect(s.lyricsFontScaleDesktop).toBe(DEFAULT_LYRICS_FONT_SCALE_DESKTOP);
    expect(s.lyricsFontScalePhone).toBe(DEFAULT_LYRICS_FONT_SCALE_PHONE);
  });

  it("returns a new object each call (no shared reference)", () => {
    const a = defaultSettings();
    const b = defaultSettings();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe("normalizeSettings", () => {
  it("defaults playlistPlayedPaths when missing", () => {
    const s = normalizeSettings({ playlistPaths: ["a.mp3"] });
    expect(s.playlistPlayedPaths).toEqual([]);
  });

  it("reads playlistPlayedPaths", () => {
    const s = normalizeSettings({
      playlistPaths: ["a.mp3", "b.mp3"],
      playlistPlayedPaths: ["a.mp3"],
    });
    expect(s.playlistPlayedPaths).toEqual(["a.mp3"]);
  });
});
