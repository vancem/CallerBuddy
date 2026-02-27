import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppState, StateEvents, TabType } from "./app-state.js";
import type { Song } from "../models/song.js";

function makeSong(musicFile: string): Song {
  return {
    label: "",
    title: musicFile,
    musicFile,
    lyricsFile: "",
    category: "",
    rank: 50,
    dateAdded: "",
    lastUsed: "",
    loopStartTime: 0,
    loopEndTime: 0,
    volume: 80,
    pitch: 0,
    originalTempo: 0,
    deltaTempo: 0,
  };
}

/** Helper: attach a spy listener to an AppState event and return it. */
function spyOn(state: AppState, event: string) {
  const handler = vi.fn();
  state.addEventListener(event, handler);
  return handler;
}

describe("AppState", () => {
  let state: AppState;

  beforeEach(() => {
    state = new AppState();
  });

  // -----------------------------------------------------------------------
  // Event emission
  // -----------------------------------------------------------------------

  describe("emit", () => {
    it("fires the named event and CHANGED", () => {
      const specific = spyOn(state, StateEvents.PLAYLIST_CHANGED);
      const changed = spyOn(state, StateEvents.CHANGED);

      state.emit(StateEvents.PLAYLIST_CHANGED);

      expect(specific).toHaveBeenCalledOnce();
      expect(changed).toHaveBeenCalledOnce();
    });

    it("fires CHANGED only once when emitting CHANGED directly", () => {
      const changed = spyOn(state, StateEvents.CHANGED);
      state.emit(StateEvents.CHANGED);
      expect(changed).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // Settings
  // -----------------------------------------------------------------------

  describe("setSettings", () => {
    it("updates settings and fires SETTINGS_CHANGED", () => {
      const handler = spyOn(state, StateEvents.SETTINGS_CHANGED);
      state.setSettings({ breakTimerMinutes: 10, patterTimerMinutes: 7 });
      expect(state.settings.breakTimerMinutes).toBe(10);
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // Playlist operations
  // -----------------------------------------------------------------------

  describe("playlist operations", () => {
    const a = makeSong("a.mp3");
    const b = makeSong("b.mp3");
    const c = makeSong("c.mp3");

    it("addToPlaylist appends and fires event", () => {
      const handler = spyOn(state, StateEvents.PLAYLIST_CHANGED);
      state.addToPlaylist(a);
      state.addToPlaylist(b);
      expect(state.playlist).toEqual([a, b]);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("insertAtStartOfPlaylist prepends", () => {
      state.addToPlaylist(a);
      state.insertAtStartOfPlaylist(b);
      expect(state.playlist[0]).toBe(b);
      expect(state.playlist[1]).toBe(a);
    });

    it("insertInPlaylist inserts at given index", () => {
      state.addToPlaylist(a);
      state.addToPlaylist(c);
      state.insertInPlaylist(b, 1);
      expect(state.playlist).toEqual([a, b, c]);
    });

    it("insertInPlaylist clamps index to valid range", () => {
      state.addToPlaylist(a);
      state.insertInPlaylist(b, 999);
      expect(state.playlist).toEqual([a, b]);

      state.insertInPlaylist(c, -5);
      expect(state.playlist[0]).toBe(c);
    });

    it("removeFromPlaylist removes at index", () => {
      state.addToPlaylist(a);
      state.addToPlaylist(b);
      state.addToPlaylist(c);
      state.removeFromPlaylist(1);
      expect(state.playlist).toEqual([a, c]);
    });

    it("removeFromPlaylist ignores out-of-range index", () => {
      state.addToPlaylist(a);
      const handler = spyOn(state, StateEvents.PLAYLIST_CHANGED);
      state.removeFromPlaylist(5);
      state.removeFromPlaylist(-1);
      expect(handler).not.toHaveBeenCalled();
      expect(state.playlist).toEqual([a]);
    });

    it("moveInPlaylist swaps items", () => {
      state.addToPlaylist(a);
      state.addToPlaylist(b);
      state.addToPlaylist(c);
      state.moveInPlaylist(0, 2);
      expect(state.playlist).toEqual([b, c, a]);
    });

    it("moveInPlaylist ignores out-of-range indices", () => {
      state.addToPlaylist(a);
      state.moveInPlaylist(-1, 0);
      state.moveInPlaylist(0, 5);
      expect(state.playlist).toEqual([a]);
    });

    it("clearPlaylist empties list and clears played paths", () => {
      state.addToPlaylist(a);
      state.markSongPlayed("a.mp3");
      state.clearPlaylist();
      expect(state.playlist).toEqual([]);
      expect(state.getPlayedSongPaths().size).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Played-song tracking
  // -----------------------------------------------------------------------

  describe("played-song tracking", () => {
    it("markSongPlayed adds to played set", () => {
      state.markSongPlayed("a.mp3");
      expect(state.getPlayedSongPaths().has("a.mp3")).toBe(true);
    });

    it("setSongPlayed can add and remove", () => {
      state.setSongPlayed("a.mp3", true);
      expect(state.getPlayedSongPaths().has("a.mp3")).toBe(true);
      state.setSongPlayed("a.mp3", false);
      expect(state.getPlayedSongPaths().has("a.mp3")).toBe(false);
    });

    it("resetPlayedSongs clears all", () => {
      state.markSongPlayed("a.mp3");
      state.markSongPlayed("b.mp3");
      state.resetPlayedSongs();
      expect(state.getPlayedSongPaths().size).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Tab management
  // -----------------------------------------------------------------------

  describe("tab management", () => {
    it("openTab creates a tab and activates it", () => {
      const id = state.openTab(TabType.PlaylistEditor, "Editor");
      expect(state.tabs).toHaveLength(1);
      expect(state.activeTabId).toBe(id);
      expect(state.tabs[0].type).toBe(TabType.PlaylistEditor);
    });

    it("activateTab switches the active tab", () => {
      const id1 = state.openTab(TabType.PlaylistEditor, "Editor");
      const id2 = state.openTab(TabType.PlaylistPlay, "Play");
      expect(state.activeTabId).toBe(id2);

      state.activateTab(id1);
      expect(state.activeTabId).toBe(id1);
    });

    it("activateTab ignores unknown tab id", () => {
      const id = state.openTab(TabType.Welcome, "Welcome");
      state.activateTab("nonexistent");
      expect(state.activeTabId).toBe(id);
    });

    it("closeTab removes the tab", () => {
      const id = state.openTab(TabType.PlaylistEditor, "Editor", true);
      state.closeTab(id);
      expect(state.tabs).toHaveLength(0);
    });

    it("closeTab does nothing for non-closable tabs", () => {
      const id = state.openTab(TabType.Welcome, "Welcome", false);
      state.closeTab(id);
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0].id).toBe(id);
    });

    it("closeTab activates a neighbor when active tab is closed", () => {
      const id1 = state.openTab(TabType.PlaylistEditor, "A");
      const id2 = state.openTab(TabType.PlaylistPlay, "B");
      expect(state.activeTabId).toBe(id2);

      state.closeTab(id2);
      expect(state.activeTabId).toBe(id1);
    });

    it("getActiveTab returns the active tab info", () => {
      state.openTab(TabType.PlaylistEditor, "Editor");
      const tab = state.getActiveTab();
      expect(tab?.title).toBe("Editor");
    });

    it("openSingletonTab reuses existing tab of same type", () => {
      const id1 = state.openSingletonTab(TabType.PlaylistPlay, "Play");
      const id2 = state.openSingletonTab(TabType.PlaylistPlay, "Play2");
      expect(id1).toBe(id2);
      expect(state.tabs).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Back/forward navigation
  // -----------------------------------------------------------------------

  describe("back/forward navigation", () => {
    it("goBack returns to previously active tab", () => {
      const id1 = state.openTab(TabType.PlaylistEditor, "A");
      state.openTab(TabType.PlaylistPlay, "B");
      const went = state.goBack();
      expect(went).toBe(true);
      expect(state.activeTabId).toBe(id1);
    });

    it("goBack returns false when stack is empty", () => {
      state.openTab(TabType.PlaylistEditor, "A");
      expect(state.goBack()).toBe(false);
    });

    it("goForward reverses a goBack", () => {
      state.openTab(TabType.PlaylistEditor, "A");
      const id2 = state.openTab(TabType.PlaylistPlay, "B");
      state.goBack();
      const went = state.goForward();
      expect(went).toBe(true);
      expect(state.activeTabId).toBe(id2);
    });

    it("goForward returns false when stack is empty", () => {
      state.openTab(TabType.PlaylistEditor, "A");
      expect(state.goForward()).toBe(false);
    });

    it("activateTab clears forward stack", () => {
      state.openTab(TabType.PlaylistEditor, "A");
      state.openTab(TabType.PlaylistPlay, "B");
      const id3 = state.openTab(TabType.SongPlay, "C");
      state.goBack(); // back to B, forward has C
      state.activateTab(id3); // switching to a different tab clears forward
      expect(state.goForward()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Current song state
  // -----------------------------------------------------------------------

  describe("setCurrentSong", () => {
    it("fires SONG_PLAYING when song is set", () => {
      const handler = spyOn(state, StateEvents.SONG_PLAYING);
      state.setCurrentSong(makeSong("a.mp3"));
      expect(state.currentSong).not.toBeNull();
      expect(handler).toHaveBeenCalledOnce();
    });

    it("fires SONG_ENDED when song is cleared", () => {
      const handler = spyOn(state, StateEvents.SONG_ENDED);
      state.setCurrentSong(makeSong("a.mp3"));
      state.setCurrentSong(null);
      expect(state.currentSong).toBeNull();
      expect(handler).toHaveBeenCalledOnce();
    });
  });
});
