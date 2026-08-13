import { describe, it, expect } from "vitest";
import {
  defaultSettings,
  defaultPlaylistEditorView,
  DEFAULT_BREAK_TIMER_MINUTES,
  DEFAULT_LYRICS_FONT_SCALE_DESKTOP,
  DEFAULT_LYRICS_FONT_SCALE_PHONE,
  DEFAULT_PLAYLIST_PANEL_HEIGHT,
  DEFAULT_PLAYLIST_PANEL_WIDTH,
  normalizePlaylistEditorView,
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
    expect(s.lastBackupTime).toBe(0);
    expect(s.playlistEditorView).toEqual(defaultPlaylistEditorView());
  });

  it("returns a new object each call (no shared reference)", () => {
    const a = defaultSettings();
    const b = defaultSettings();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.playlistEditorView).not.toBe(b.playlistEditorView);
    expect(a.playlistEditorView.sortKeys).not.toBe(b.playlistEditorView.sortKeys);
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

  it("reads lastBackupTime", () => {
    const s = normalizeSettings({ lastBackupTime: 1_700_000_000_000 });
    expect(s.lastBackupTime).toBe(1_700_000_000_000);
  });

  it("defaults lastBackupTime when missing", () => {
    const s = normalizeSettings({});
    expect(s.lastBackupTime).toBe(0);
  });

  it("defaults playlistEditorView when missing", () => {
    const s = normalizeSettings({});
    expect(s.playlistEditorView).toEqual(defaultPlaylistEditorView());
  });

  it("reads playlistEditorView", () => {
    const s = normalizeSettings({
      playlistEditorView: {
        filterText: "hello",
        rankFilterInput: "80",
        rankCompareGte: false,
        sortKeys: [{ field: "title", dir: "desc" }],
      },
    });
    expect(s.playlistEditorView).toEqual({
      filterText: "hello",
      rankFilterInput: "80",
      rankCompareGte: false,
      sortKeys: [{ field: "title", dir: "desc" }],
    });
  });
});

describe("normalizePlaylistEditorView", () => {
  it("drops invalid sort keys and falls back when empty", () => {
    expect(
      normalizePlaylistEditorView({
        filterText: "x",
        sortKeys: [{ field: "nope", dir: "asc" }, { field: "rank", dir: "up" }],
      }).sortKeys,
    ).toEqual(defaultPlaylistEditorView().sortKeys);
  });
});
