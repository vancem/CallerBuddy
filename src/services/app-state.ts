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
  /** Tab-specific payload (e.g. folder name for playlist editor). */
  data?: unknown;
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
  songs: Song[] = [];
  playlist: Song[] = [];
  settings: Settings = defaultSettings();

  tabs: TabInfo[] = [];
  activeTabId = "";

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
    this.activeTabId = id;
    this.emit(StateEvents.CHANGED);
    return id;
  }

  /** Open a singleton tab (only one of its type). Returns the existing or new id. */
  openSingletonTab(type: TabType, title: string, closable = true, data?: unknown): string {
    const existing = this.tabs.find((t) => t.type === type);
    if (existing) {
      this.activeTabId = existing.id;
      if (data !== undefined) existing.data = data;
      this.emit(StateEvents.CHANGED);
      return existing.id;
    }
    return this.openTab(type, title, closable, data);
  }

  activateTab(id: string): void {
    if (this.tabs.some((t) => t.id === id)) {
      this.activeTabId = id;
      this.emit(StateEvents.CHANGED);
    }
  }

  closeTab(id: string): void {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const tab = this.tabs[idx];
    if (!tab.closable) return;
    this.tabs.splice(idx, 1);
    if (this.activeTabId === id) {
      // Activate nearest tab
      const newIdx = Math.min(idx, this.tabs.length - 1);
      this.activeTabId = newIdx >= 0 ? this.tabs[newIdx].id : "";
    }
    this.emit(StateEvents.CHANGED);
  }

  getActiveTab(): TabInfo | undefined {
    return this.tabs.find((t) => t.id === this.activeTabId);
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
