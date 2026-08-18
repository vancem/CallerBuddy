import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppState, StateEvents, TabType } from "./app-state.js";
import { defaultSettings } from "../models/settings.js";
import type { Song } from "../models/song.js";

function makeSong(musicFile: string): Song {
  return {
    label: "",
    title: musicFile,
    musicFile,
    lyricsFile: "",
    categories: "",
    rank: 50,
    orderAdded: 15,
    lastUsed: "",
    playWeight: 0,
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
      state.setSettings({
        ...defaultSettings(),
        breakTimerMinutes: 10,
        patterTimerMinutes: 7,
        playlistPanelWidth: 300,
      });
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

    it("addToPlaylist ignores duplicate songs", () => {
      state.addToPlaylist(a);
      const handler = spyOn(state, StateEvents.PLAYLIST_CHANGED);
      state.addToPlaylist(a);
      expect(state.playlist).toEqual([a]);
      expect(handler).not.toHaveBeenCalled();
    });

    it("insertAtStartOfPlaylist prepends", () => {
      state.addToPlaylist(a);
      state.insertAtStartOfPlaylist(b);
      expect(state.playlist[0]).toBe(b);
      expect(state.playlist[1]).toBe(a);
    });

    it("insertAtStartOfPlaylist ignores duplicate songs", () => {
      state.addToPlaylist(a);
      const handler = spyOn(state, StateEvents.PLAYLIST_CHANGED);
      state.insertAtStartOfPlaylist(a);
      expect(state.playlist).toEqual([a]);
      expect(handler).not.toHaveBeenCalled();
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

    it("insertInPlaylist ignores duplicate songs", () => {
      state.addToPlaylist(a);
      state.addToPlaylist(b);
      const handler = spyOn(state, StateEvents.PLAYLIST_CHANGED);
      state.insertInPlaylist(a, 1);
      expect(state.playlist).toEqual([a, b]);
      expect(handler).not.toHaveBeenCalled();
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
      state.markSongPlayed(a);
      state.clearPlaylist();
      expect(state.playlist).toEqual([]);
      expect(state.getPlayedSongPaths().size).toBe(0);
    });

    it("clearPlaylistWithBackup saves then clears; restore recovers list and played state", () => {
      const b = makeSong("b.mp3");
      state.addToPlaylist(a);
      state.addToPlaylist(b);
      state.markSongPlayed(a);
      state.clearPlaylistWithBackup();
      expect(state.playlist).toEqual([]);
      expect(state.hasClearedPlaylistBackup()).toBe(true);
      state.restoreClearedPlaylist();
      expect(state.playlist).toEqual([a, b]);
      expect(state.isPlaylistEntryPlayed(a)).toBe(true);
      expect(state.isPlaylistEntryPlayed(b)).toBe(false);
    });

    it("clearPlaylistWithBackup overwrites prior backup", () => {
      state.addToPlaylist(a);
      state.clearPlaylistWithBackup();
      state.addToPlaylist(makeSong("c.mp3"));
      state.clearPlaylistWithBackup();
      state.restoreClearedPlaylist();
      expect(state.playlist.map((s) => s.musicFile)).toEqual(["c.mp3"]);
    });

    it("clearPlaylistWithBackup is a no-op on an empty playlist", () => {
      state.clearPlaylistWithBackup();
      expect(state.hasClearedPlaylistBackup()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Played-song tracking
  // -----------------------------------------------------------------------

  describe("played-song tracking", () => {
    const a = makeSong("a.mp3");
    const b = makeSong("b.mp3");

    it("markSongPlayed adds to played set", () => {
      state.markSongPlayed(a);
      expect(state.getPlayedSongPaths().has("a.mp3")).toBe(true);
    });

    it("setSongPlayed can add and remove", () => {
      state.setSongPlayed(a, true);
      expect(state.getPlayedSongPaths().has("a.mp3")).toBe(true);
      state.setSongPlayed(a, false);
      expect(state.getPlayedSongPaths().has("a.mp3")).toBe(false);
    });

    it("resetPlayedSongs clears all", () => {
      state.markSongPlayed(a);
      state.markSongPlayed(b);
      state.resetPlayedSongs();
      expect(state.getPlayedSongPaths().size).toBe(0);
    });

    it("uses playlistRelPath when set for distinct rows", () => {
      const s1 = { ...makeSong("x.mp3"), playlistRelPath: "f1/x.mp3" };
      const s2 = { ...makeSong("x.mp3"), playlistRelPath: "f2/x.mp3" };
      state.addToPlaylist(s1);
      state.addToPlaylist(s2);
      state.markSongPlayed(s1);
      expect(state.isPlaylistEntryPlayed(s1)).toBe(true);
      expect(state.isPlaylistEntryPlayed(s2)).toBe(false);
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

    it("closeTab replaces the tabs array reference when closing an inactive tab", () => {
      // Lit binds .tabs by !== ; in-place splice left a ghost tab in the bar.
      const id1 = state.openTab(TabType.PlaylistEditor, "Root");
      const id2 = state.openSingletonTab(TabType.PlaylistPlay, "Now Playing");
      state.activateTab(id1);
      expect(state.activeTabId).toBe(id1);

      const before = state.tabs;
      state.closeTab(id2);

      expect(state.tabs).not.toBe(before);
      expect(state.tabs.map((t) => t.id)).toEqual([id1]);
      expect(state.activeTabId).toBe(id1);
      expect(state.tabs.some((t) => t.type === TabType.PlaylistPlay)).toBe(false);
    });

    it("closeTabByType closes the matching closable tab", () => {
      state.openTab(TabType.PlaylistEditor, "Root");
      state.openSingletonTab(TabType.PlaylistPlay, "Now Playing");
      state.closeTabByType(TabType.PlaylistPlay);
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0].type).toBe(TabType.PlaylistEditor);
    });

    it("openTab assigns a new tabs array reference", () => {
      const before = state.tabs;
      state.openTab(TabType.PlaylistEditor, "Editor");
      expect(state.tabs).not.toBe(before);
    });

    it("closeTab does nothing for non-closable tabs", () => {
      const id = state.openTab(TabType.Welcome, "Welcome", false);
      state.closeTab(id);
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0].id).toBe(id);
    });

    it("closeTab with force removes non-closable tabs and scrub back stack", () => {
      const welcomeId = state.openTab(TabType.Welcome, "Welcome", false);
      const editorId = state.openTab(TabType.PlaylistEditor, "Root", false);
      expect(state.peekBackTarget()).toBe(welcomeId);

      state.closeTabByType(TabType.Welcome, { force: true });

      expect(state.tabs.map((t) => t.id)).toEqual([editorId]);
      expect(state.activeTabId).toBe(editorId);
      expect(state.peekBackTarget()).toBeNull();
      expect(state.goBack()).toBe(false);
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

    it("openSingletonTab replaces tabs array when updating data on existing tab", () => {
      const id = state.openSingletonTab(TabType.SongPlay, "Song", true, { song: "a" });
      const before = state.tabs;
      state.openSingletonTab(TabType.SongPlay, "Song", true, { song: "b" });
      expect(state.tabs).not.toBe(before);
      expect(state.tabs[0].id).toBe(id);
      expect(state.tabs[0].data).toEqual({ song: "b" });
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
  // Import destination folder
  // -----------------------------------------------------------------------

  describe("importTargetDir", () => {
    const root = { name: "CallerBuddySongs" } as FileSystemDirectoryHandle;
    const sub = { name: "Christmas" } as FileSystemDirectoryHandle;

    beforeEach(() => {
      state.rootHandle = root;
    });

    it("uses the active playlist editor folder", () => {
      state.openTab(TabType.PlaylistEditor, "Christmas", true, {
        dirHandle: sub,
        folderName: "Christmas",
      });
      expect(state.importTargetDir()).toBe(sub);
    });

    it("uses the root playlist editor folder when that editor is active", () => {
      state.openTab(TabType.PlaylistEditor, "CallerBuddySongs", false, {
        dirHandle: root,
        folderName: "CallerBuddySongs",
      });
      expect(state.importTargetDir()).toBe(root);
    });

    it("returns null when a non-editor tab is active", () => {
      state.openTab(TabType.PlaylistEditor, "Christmas", true, {
        dirHandle: sub,
        folderName: "Christmas",
      });
      state.openSingletonTab(TabType.Help, "Help");
      expect(state.importTargetDir()).toBeNull();
    });

    it("returns null when no tabs are open", () => {
      expect(state.importTargetDir()).toBeNull();
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

  describe("setLastSongEndedMs", () => {
    it("starts null and records a session-only end time", () => {
      expect(state.lastSongEndedMs).toBeNull();
      const handler = spyOn(state, StateEvents.CHANGED);
      const ms = Date.now();
      state.setLastSongEndedMs(ms);
      expect(state.lastSongEndedMs).toBe(ms);
      expect(handler).toHaveBeenCalledOnce();
    });
  });
});
