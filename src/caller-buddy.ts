/**
 * CallerBuddy application singleton.
 *
 * Per coding standards: "There should be a CallerBuddy object that represents
 * the program as a whole, that gets created at start and dies when the program
 * is closed."
 *
 * This object owns all services and state. UI components import and use it for
 * all non-trivial operations. It is the single coordination point between
 * services and the UI layer.
 */

import { AppState, StateEvents, TabType } from "./services/app-state.js";
import {
  storeRootHandle,
  loadRootHandle,
  ensurePermission,
  readTextFile,
  readBinaryFile,
  writeTextFile,
  fileExists,
} from "./services/file-system-service.js";
import { loadAndMergeSongs, saveSongsJson } from "./services/song-library.js";
import {
  WebAudioEngine,
  type AudioEngine,
} from "./services/audio-engine.js";
import { detectBPM } from "./services/bpm-detector.js";
import { defaultSettings, type Settings } from "./models/settings.js";
import type { Song } from "./models/song.js";
import { log } from "./services/logger.js";

const SETTINGS_JSON = "settings.json";

export class CallerBuddy {
  readonly state = new AppState();
  readonly audio: AudioEngine = new WebAudioEngine();

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  /**
   * Called once at startup from main.ts.
   * Attempts to restore the previously chosen CallerBuddyRoot folder handle.
   * If found and permissions are still valid, loads songs and opens the editor.
   * Otherwise opens the welcome screen.
   */
  async init(): Promise<void> {
    log.info("CallerBuddy initializing…");

    const storedHandle = await loadRootHandle();
    if (storedHandle) {
      log.info(`init: found stored handle "${storedHandle.name}", checking permission…`);
      // Try to silently verify permission (no user gesture, may fail)
      const perm = await storedHandle.queryPermission({ mode: "readwrite" });
      log.info(`init: queryPermission returned "${perm}"`);
      if (perm === "granted") {
        log.info("init: permission granted, activating stored root…");
        await this.activateRoot(storedHandle);
        return;
      }
      // Permission not granted — we'll need a user gesture. Store the handle
      // so the welcome view can offer a "reconnect" button.
      log.info("init: permission not granted; showing welcome.");
      this.state.rootHandle = storedHandle;
    } else {
      log.info("init: no stored handle found");
    }

    log.info("init: opening welcome tab");
    this.state.openSingletonTab(TabType.Welcome, "Welcome", false);
  }

  // -----------------------------------------------------------------------
  // Root folder management
  // -----------------------------------------------------------------------

  /**
   * Set the CallerBuddyRoot to a new handle (from folder picker or reconnect).
   * Persists the handle, loads songs, opens the playlist editor.
   */
  async setRoot(handle: FileSystemDirectoryHandle): Promise<void> {
    log.info(`setRoot: ensuring readwrite permission on "${handle.name}"…`);
    const granted = await ensurePermission(handle);
    if (!granted) {
      log.warn("setRoot: user denied readwrite permission on root folder.");
      return;
    }
    log.info("setRoot: permission granted, storing handle in IndexedDB…");
    await storeRootHandle(handle);
    log.info("setRoot: handle stored, activating root…");
    await this.activateRoot(handle);
    log.info("setRoot: complete");
  }

  private async activateRoot(handle: FileSystemDirectoryHandle): Promise<void> {
    this.state.setRoot(handle);
    log.info(`activateRoot: CallerBuddyRoot set to "${handle.name}"`);

    log.info("activateRoot: loading settings…");
    await this.loadSettings();
    log.info("activateRoot: settings loaded");

    log.info("activateRoot: loading and merging songs…");
    const songs = await loadAndMergeSongs(handle);
    log.info(`activateRoot: ${songs.length} songs loaded`);
    this.state.setSongs(songs);

    log.info("activateRoot: opening playlist editor tab…");
    this.state.openSingletonTab(
      TabType.PlaylistEditor,
      handle.name,
      true,
      { folderName: handle.name },
    );
    log.info("activateRoot: complete");

    // Kick off background BPM detection for songs that don't have it yet.
    // This runs after the UI is ready so it doesn't block the user.
    this.detectBpmForAllSongs();
  }

  // -----------------------------------------------------------------------
  // Settings
  // -----------------------------------------------------------------------

  private async loadSettings(): Promise<void> {
    const handle = this.state.rootHandle;
    if (!handle) return;
    try {
      const exists = await fileExists(handle, SETTINGS_JSON);
      if (exists) {
        const text = await readTextFile(handle, SETTINGS_JSON);
        const data = JSON.parse(text) as Settings;
        this.state.setSettings({ ...defaultSettings(), ...data });
        log.info("Settings loaded from settings.json");
      } else {
        this.state.setSettings(defaultSettings());
      }
    } catch (err) {
      log.warn("Could not load settings.json:", err);
      this.state.setSettings(defaultSettings());
    }
  }

  async saveSettings(): Promise<void> {
    const handle = this.state.rootHandle;
    if (!handle) return;
    try {
      const json = JSON.stringify(this.state.settings, null, 2);
      await writeTextFile(handle, SETTINGS_JSON, json);
      log.info("Settings saved to settings.json");
    } catch (err) {
      log.warn("Could not save settings.json:", err);
    }
  }

  // -----------------------------------------------------------------------
  // Song operations
  // -----------------------------------------------------------------------

  /** Update a song's metadata and persist to songs.json. */
  async updateSong(song: Song): Promise<void> {
    const idx = this.state.songs.findIndex(
      (s) => s.musicFile === song.musicFile,
    );
    if (idx >= 0) {
      this.state.songs[idx] = song;
      this.state.emit(StateEvents.SONGS_LOADED);
    }
    if (this.state.rootHandle) {
      try {
        await saveSongsJson(this.state.rootHandle, this.state.songs);
      } catch (err) {
        log.warn("Could not persist song update:", err);
      }
    }
  }

  /** Read the lyrics file for a song. Returns the HTML/MD text or empty string. */
  async loadLyrics(song: Song): Promise<string> {
    if (!song.lyricsFile || !this.state.rootHandle) return "";
    try {
      return await readTextFile(this.state.rootHandle, song.lyricsFile);
    } catch (err) {
      log.warn(`Could not load lyrics for "${song.title}":`, err);
      return "";
    }
  }

  /** Load and decode the audio data for a song, prepare the audio engine. */
  async loadSongAudio(song: Song): Promise<void> {
    if (!this.state.rootHandle) return;
    const data = await readBinaryFile(this.state.rootHandle, song.musicFile);
    await this.audio.loadAudio(data);
    this.audio.setVolume(song.volume);
    this.audio.setLoopPoints(song.loopStartTime, song.loopEndTime);
    this.audio.setPitch(song.pitch);
    this.audio.setTempo(song.deltaTempo, song.originalTempo);
  }

  // -----------------------------------------------------------------------
  // BPM detection (background)
  // -----------------------------------------------------------------------

  /** Whether a BPM detection pass is currently running. */
  private bpmDetectionRunning = false;

  /**
   * Run BPM detection on all songs that have originalTempo === 0.
   * Processes sequentially (one at a time) to avoid overloading the system.
   * Results are persisted to songs.json after each successful detection.
   *
   * This method is intentionally fire-and-forget: it logs errors and moves on.
   * It does NOT block the UI or any other operation.
   */
  private async detectBpmForAllSongs(): Promise<void> {
    if (this.bpmDetectionRunning) {
      log.info("BPM detection already running, skipping duplicate request");
      return;
    }
    const handle = this.state.rootHandle;
    if (!handle) return;

    const songsNeedingBpm = this.state.songs.filter(
      (s) => s.originalTempo === 0,
    );
    if (songsNeedingBpm.length === 0) {
      log.info("All songs already have BPM data");
      return;
    }

    this.bpmDetectionRunning = true;
    log.info(
      `Starting background BPM detection for ${songsNeedingBpm.length} songs…`,
    );

    let detected = 0;
    for (const song of songsNeedingBpm) {
      try {
        const audioData = await readBinaryFile(handle, song.musicFile);
        const bpm = await detectBPM(audioData);
        if (bpm > 0) {
          song.originalTempo = bpm;
          detected++;
          log.info(`BPM for "${song.title}": ${bpm}`);
          // Update the song list in state so the UI can reflect the change
          const idx = this.state.songs.findIndex(
            (s) => s.musicFile === song.musicFile,
          );
          if (idx >= 0) {
            this.state.songs[idx] = song;
          }
        }
      } catch (err) {
        log.warn(`BPM detection failed for "${song.title}":`, err);
      }
    }

    // Persist all results in a single write at the end
    if (detected > 0) {
      try {
        this.state.emit(StateEvents.SONGS_LOADED);
        await saveSongsJson(handle, this.state.songs);
        log.info(
          `BPM detection complete: ${detected}/${songsNeedingBpm.length} songs updated`,
        );
      } catch (err) {
        log.warn("Could not persist BPM results:", err);
      }
    } else {
      log.info("BPM detection complete: no songs could be analyzed");
    }

    this.bpmDetectionRunning = false;
  }

  // -----------------------------------------------------------------------
  // Playlist → play flow
  // -----------------------------------------------------------------------

  /** Open the playlist play view. */
  openPlaylistPlay(): void {
    this.state.openSingletonTab(TabType.PlaylistPlay, "Now Playing", true);
  }

  /** Open the song play view for a specific song. */
  async openSongPlay(song: Song): Promise<void> {
    try {
      await this.loadSongAudio(song);
    } catch (err) {
      log.error(`Failed to load audio for "${song.title}":`, err);
      return;
    }
    this.state.setCurrentSong(song);
    this.state.openSingletonTab(
      TabType.SongPlay,
      song.title,
      true,
      { song },
    );
  }

  /** Close the song play tab and clear the current song. */
  async closeSongPlay(): Promise<void> {
    this.audio.stop();
    // Persist lastUsed before closing so we don't have concurrent write with tab teardown
    if (this.state.currentSong) {
      const song = { ...this.state.currentSong, lastUsed: new Date().toISOString() };
      await this.updateSong(song);
    }
    const tab = this.state.tabs.find((t) => t.type === TabType.SongPlay);
    if (tab) {
      this.state.closeTab(tab.id);
    }
    this.state.setCurrentSong(null);
  }
}

/** The one and only CallerBuddy instance. Imported by all modules that need it. */
export const callerBuddy = new CallerBuddy();
