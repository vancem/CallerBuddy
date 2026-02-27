/**
 * Centralized application state with event-based change notification.
 *
 * The CallerBuddy singleton (caller-buddy.ts) owns an AppState instance.
 * UI components subscribe to change events and re-render when state mutates.
 *
 * Design decision: EventTarget-based event bus (see BACKLOG.md).
 */

import type { Song } from "../models/song.js";
import type { Settings } from "../models/settings.js";
import { defaultSettings } from "../models/settings.js";
import { log } from "./logger.js";

// ---------------------------------------------------------------------------
// Tab model
// ---------------------------------------------------------------------------

export const TabType = {
  Welcome: "welcome",
  PlaylistEditor: "playlist-editor",
  PlaylistPlay: "playlist-play",
  SongPlay: "song-play",
} as const;

export type TabType = (typeof TabType)[keyof typeof TabType];

export interface TabInfo {
  id: string;
  type: TabType;
  title: string;
  closable: boolean;
  /** Tab-specific payload. For PlaylistEditor tabs, see EditorTabData. */
  data?: unknown;
}

/** Typed payload stored in TabInfo.data for PlaylistEditor tabs. */
export interface EditorTabData {
  dirHandle: FileSystemDirectoryHandle;
  folderName: string;
}

// ---------------------------------------------------------------------------
// Event names emitted by AppState
// ---------------------------------------------------------------------------

export const StateEvents = {
  /** Fires when any state changes (catch-all for UI refresh). */
  CHANGED: "state-changed",
  /** Fires when the CallerBuddyRoot handle changes. */
  ROOT_CHANGED: "root-changed",
  /** Fires when the song library is loaded or updated. */
  SONGS_LOADED: "songs-loaded",
  /** Fires when the playlist is modified. */
  PLAYLIST_CHANGED: "playlist-changed",
  /** Fires when settings change. */
  SETTINGS_CHANGED: "settings-changed",
  /** Fires when a song starts playing. */
  SONG_PLAYING: "song-playing",
  /** Fires when a song finishes or is stopped. */
  SONG_ENDED: "song-ended",
} as const;

// ---------------------------------------------------------------------------
// AppState
// ---------------------------------------------------------------------------

let nextTabId = 1;

export class AppState extends EventTarget {
  rootHandle: FileSystemDirectoryHandle | null = null;

  /**
   * @deprecated Songs are now per-editor. Each playlist-editor component
   * manages its own song list loaded from its dirHandle. This field is
   * retained only for the updateSong() path in caller-buddy.ts.
   */
  songs: Song[] = [];

  playlist: Song[] = [];
  settings: Settings = defaultSettings();

  tabs: TabInfo[] = [];
  activeTabId = "";

  /** Tab IDs we can go "back" to (Alt+Left). */
  private tabBackStack: string[] = [];
  /** Tab IDs we can go "forward" to (Alt+Right). */
  private tabForwardStack: string[] = [];

  /** The song currently being played, or null. */
  currentSong: Song | null = null;

  /** Set of musicFile paths for songs already played this session (Now Playing). */
  private playedSongPaths = new Set<string>();

  // -- Mutation helpers (fire events) ---------------------------------------

  emit(eventName: string): void {
    this.dispatchEvent(new Event(eventName));
    if (eventName !== StateEvents.CHANGED) {
      this.dispatchEvent(new Event(StateEvents.CHANGED));
    }
  }

  setRoot(handle: FileSystemDirectoryHandle): void {
    this.rootHandle = handle;
    this.emit(StateEvents.ROOT_CHANGED);
  }

  /** Update closable on all PlaylistEditor tabs based on current root. Call after setRoot. */
  async updateEditorTabsClosable(): Promise<void> {
    for (const tab of this.tabs) {
      if (tab.type !== TabType.PlaylistEditor) continue;
      const data = tab.data as EditorTabData | undefined;
      if (!data?.dirHandle) continue;
      tab.closable = !(await this.isRootHandle(data.dirHandle));
    }
    this.emit(StateEvents.CHANGED);
  }

  /** @deprecated Songs are now per-editor. Kept for backward compatibility. */
  setSongs(songs: Song[]): void {
    this.songs = songs;
    this.emit(StateEvents.SONGS_LOADED);
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.emit(StateEvents.SETTINGS_CHANGED);
  }

  // -- Playlist manipulation ------------------------------------------------

  addToPlaylist(song: Song): void {
    this.playlist.push(song);
    this.emit(StateEvents.PLAYLIST_CHANGED);
  }

  insertAtStartOfPlaylist(song: Song): void {
    this.playlist.unshift(song);
    this.emit(StateEvents.PLAYLIST_CHANGED);
  }

  removeFromPlaylist(index: number): void {
    if (index >= 0 && index < this.playlist.length) {
      this.playlist.splice(index, 1);
      this.emit(StateEvents.PLAYLIST_CHANGED);
    }
  }

  moveInPlaylist(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      fromIndex >= this.playlist.length ||
      toIndex < 0 ||
      toIndex >= this.playlist.length
    ) {
      return;
    }
    const [item] = this.playlist.splice(fromIndex, 1);
    this.playlist.splice(toIndex, 0, item);
    this.emit(StateEvents.PLAYLIST_CHANGED);
  }

  clearPlaylist(): void {
    this.playlist = [];
    this.playedSongPaths.clear();
    this.emit(StateEvents.PLAYLIST_CHANGED);
  }

  /** Mark a song as played (by music file path) for Now Playing. */
  markSongPlayed(musicFile: string): void {
    this.playedSongPaths.add(musicFile);
    this.emit(StateEvents.PLAYLIST_CHANGED);
  }

  /** Set whether a song is marked as played (e.g. from checkbox toggle). */
  setSongPlayed(musicFile: string, played: boolean): void {
    if (played) {
      this.playedSongPaths.add(musicFile);
    } else {
      this.playedSongPaths.delete(musicFile);
    }
    this.emit(StateEvents.PLAYLIST_CHANGED);
  }

  /** Read-only set of music file paths that have been played this session. */
  getPlayedSongPaths(): ReadonlySet<string> {
    return this.playedSongPaths;
  }

  /** Reset the 'has played' bits for all songs in the Now Playing playlist. */
  resetPlayedSongs(): void {
    this.playedSongPaths.clear();
    this.emit(StateEvents.PLAYLIST_CHANGED);
  }

  // -- Tab management -------------------------------------------------------

  openTab(type: TabType, title: string, closable = true, data?: unknown): string {
    const id = `tab-${nextTabId++}`;
    this.tabs.push({ id, type, title, closable, data });
    if (this.activeTabId) {
      this.tabBackStack.push(this.activeTabId);
      this.tabForwardStack = [];
    }
    this.activeTabId = id;
    this.emit(StateEvents.CHANGED);
    return id;
  }

  /** Open a singleton tab (only one of its type). Returns the existing or new id. */
  openSingletonTab(type: TabType, title: string, closable = true, data?: unknown): string {
    const existing = this.tabs.find((t) => t.type === type);
    if (existing) {
      if (this.activeTabId && this.activeTabId !== existing.id) {
        this.tabBackStack.push(this.activeTabId);
        this.tabForwardStack = [];
      }
      this.activeTabId = existing.id;
      if (data !== undefined) existing.data = data;
      this.emit(StateEvents.CHANGED);
      return existing.id;
    }
    return this.openTab(type, title, closable, data);
  }

  activateTab(id: string): void {
    if (!this.tabs.some((t) => t.id === id)) return;
    if (this.activeTabId && this.activeTabId !== id) {
      this.tabBackStack.push(this.activeTabId);
      this.tabForwardStack = [];
    }
    this.activeTabId = id;
    this.emit(StateEvents.CHANGED);
  }

  /** Go to previously visited tab (Alt+Left). Returns true if navigated. */
  goBack(): boolean {
    if (this.tabBackStack.length === 0) return false;
    if (this.activeTabId) this.tabForwardStack.push(this.activeTabId);
    const target = this.tabBackStack.pop()!;
    this.activeTabId = this.tabs.some((t) => t.id === target) ? target : "";
    this.emit(StateEvents.CHANGED);
    return true;
  }

  /** Undo back, go to forward tab (Alt+Right). Returns true if navigated. */
  goForward(): boolean {
    if (this.tabForwardStack.length === 0) return false;
    if (this.activeTabId) this.tabBackStack.push(this.activeTabId);
    const target = this.tabForwardStack.pop()!;
    this.activeTabId = this.tabs.some((t) => t.id === target) ? target : "";
    this.emit(StateEvents.CHANGED);
    return true;
  }

  closeTab(id: string): void {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const tab = this.tabs[idx];
    if (!tab.closable) return;
    this.tabs.splice(idx, 1);
    this.tabBackStack = this.tabBackStack.filter((tid) => tid !== id);
    this.tabForwardStack = this.tabForwardStack.filter((tid) => tid !== id);
    if (this.activeTabId === id) {
      const newIdx = Math.min(idx, this.tabs.length - 1);
      this.activeTabId = newIdx >= 0 ? this.tabs[newIdx].id : "";
    }
    this.emit(StateEvents.CHANGED);
  }

  getActiveTab(): TabInfo | undefined {
    return this.tabs.find((t) => t.id === this.activeTabId);
  }

  /** True if the tab is a PlaylistEditor for the CallerBuddyRoot folder. */
  async isRootEditorTab(id: string): Promise<boolean> {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab || tab.type !== TabType.PlaylistEditor) return false;
    const data = tab.data as EditorTabData | undefined;
    if (!data?.dirHandle) return false;
    return this.isRootHandle(data.dirHandle);
  }

  private async isRootHandle(handle: FileSystemDirectoryHandle): Promise<boolean> {
    const root = this.rootHandle;
    if (!root) return false;
    try {
      return await handle.isSameEntry(root);
    } catch {
      return handle.name === root.name;
    }
  }

  /**
   * Find an existing PlaylistEditor tab whose dirHandle matches the given one.
   * Uses isSameEntry() for reliable comparison (supported in Chrome/Edge).
   * Returns the tab if found, undefined otherwise.
   */
  async findEditorTabByHandle(
    dirHandle: FileSystemDirectoryHandle,
  ): Promise<TabInfo | undefined> {
    for (const tab of this.tabs) {
      if (tab.type !== TabType.PlaylistEditor) continue;
      const data = tab.data as EditorTabData | undefined;
      if (!data?.dirHandle) continue;
      try {
        if (await data.dirHandle.isSameEntry(dirHandle)) {
          return tab;
        }
      } catch {
        log.debug("findEditorTabByHandle: isSameEntry failed, falling back to name comparison");
        if (data.dirHandle.name === dirHandle.name) {
          return tab;
        }
      }
    }
    return undefined;
  }

  /**
   * Open a playlist editor tab for a folder, preventing duplicates.
   * If a tab for the same folder already exists, activates it instead.
   * Returns the tab ID.
   */
  async openEditorTab(
    dirHandle: FileSystemDirectoryHandle,
    folderName: string,
  ): Promise<string> {
    const existing = await this.findEditorTabByHandle(dirHandle);
    if (existing) {
      if (this.activeTabId && this.activeTabId !== existing.id) {
        this.tabBackStack.push(this.activeTabId);
        this.tabForwardStack = [];
      }
      this.activeTabId = existing.id;
      this.emit(StateEvents.CHANGED);
      return existing.id;
    }
    const data: EditorTabData = { dirHandle, folderName };
    const closable = !(await this.isRootHandle(dirHandle));
    return this.openTab(TabType.PlaylistEditor, folderName, closable, data);
  }

  // -- Song playing state ---------------------------------------------------

  setCurrentSong(song: Song | null): void {
    this.currentSong = song;
    if (song) {
      this.emit(StateEvents.SONG_PLAYING);
    } else {
      this.emit(StateEvents.SONG_ENDED);
    }
  }
}
