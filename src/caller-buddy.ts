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
  listDirectory,
} from "./services/file-system-service.js";
import { loadSongsJson, saveSongsJson, loadAndMergeSongs, scanDirectory } from "./services/song-library.js";
import {
  WebAudioEngine,
  type AudioEngine,
} from "./services/audio-engine.js";
import { detectBPM } from "./services/bpm-detector.js";
import { defaultSettings, normalizeSettings, type Settings } from "./models/settings.js";
import {
  applyLyricsFontScaleFromSettings,
  mergeLegacyLyricsScaleFromDisk,
  persistLyricsScaleMirror,
} from "./utils/lyrics-scale.js";
import {
  type Song,
  nextOrderAdded,
  effectiveAudioLoopPoints,
  isMusicFile,
} from "./models/song.js";
import {
  daysSinceLastUsedMs,
  lastUsedIsoFromMs,
  nextPlayWeight,
  qualifyingPlayWallSeconds,
  shouldRefreshPlayStats,
  tempoRatioFromSong,
} from "./utils/play-history.js";
import { log } from "./services/logger.js";
import {
  normalizePlaylistRelPath,
  normalizePlaylistRelPaths,
} from "./utils/playlist-path.js";
import JSZip from "jszip";
import {
  analyzeZipForOnboarding,
  type OnboardingProposal,
} from "./services/song-onboarding.js";
import type { EditorTabData } from "./services/app-state.js";

const SETTINGS_JSON = "settings.json";

export class CallerBuddy {
  readonly state = new AppState();
  readonly audio: AudioEngine = new WebAudioEngine();

  /**
   * When the song-play view is mounted, it registers an async guard invoked
   * before closing the view or switching away while lyrics have unsaved edits.
   * Returns true to proceed, false to abort (keep song play open).
   */
  private songPlayUnsavedGuard: (() => Promise<boolean>) | null = null;

  /**
   * Set when song play was opened from the playlist editor "Play now" shortcut.
   * When true, {@link finalizeSongPlayClose} also closes the Now Playing tab.
   */
  private closeNowPlayingWhenSongPlayCloses = false;

  /**
   * Directory handle used for the last successful {@link loadSongAudio}; used to
   * persist play history so we write to the same folder the audio came from
   * even if `song.dirHandle` was lost in transit (e.g. playlist references).
   */
  private lastLoadedSongDirHandle: FileSystemDirectoryHandle | null = null;

  /**
   * When true, closing the player does not update lastUsed / playWeight.
   * App-wide, not persisted across reloads.
   */
  private practiceMode = false;

  /**
   * When true, song-play pauses audio on window blur. App-wide, not persisted.
   * Default true (matches prior always-on behavior).
   */
  private autoPauseOnWindowBlur = true;

  private songPlaySession: {
    accumulatedPlayingWallSec: number;
    naturalEnd: boolean;
    lastPlayingClockMs: number;
  } | null = null;

  getPracticeMode(): boolean {
    return this.practiceMode;
  }

  setPracticeMode(value: boolean): void {
    this.practiceMode = value;
  }

  getAutoPauseOnWindowBlur(): boolean {
    return this.autoPauseOnWindowBlur;
  }

  setAutoPauseOnWindowBlur(value: boolean): void {
    this.autoPauseOnWindowBlur = value;
  }

  /** Called when song-play mounts: fresh session for wall-clock qualification. */
  beginSongPlaySession(): void {
    this.songPlaySession = {
      accumulatedPlayingWallSec: 0,
      naturalEnd: false,
      lastPlayingClockMs: 0,
    };
  }

  /** Wall time while playing (excludes pauses); drive from audio timeupdate tick. */
  tickSongPlaySession(isPlaying: boolean): void {
    const s = this.songPlaySession;
    if (!s) return;
    const now = performance.now();
    if (isPlaying) {
      if (s.lastPlayingClockMs > 0) {
        s.accumulatedPlayingWallSec += (now - s.lastPlayingClockMs) / 1000;
      }
      s.lastPlayingClockMs = now;
    } else {
      s.lastPlayingClockMs = 0;
    }
  }

  /** Natural end of the file (not loop repeat): counts as a qualifying play. */
  markSongPlayNaturalEnd(): void {
    if (this.songPlaySession) this.songPlaySession.naturalEnd = true;
  }

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
    // Start the IndexedDB persist immediately (don't await yet) so we
    // survive back-button / quick navigation even if the user leaves
    // while ensurePermission is showing the prompt.
    log.info("setRoot: starting IndexedDB persist…");
    const stored = storeRootHandle(handle).then(
      () => log.info("setRoot: handle stored"),
      (err) => log.warn("setRoot: could not persist handle to IndexedDB:", err),
    );

    // ensurePermission needs transient user-activation (consumed by the
    // browser's permission prompt).  Run it first — before any awaits that
    // could let other code consume the activation token.
    log.info(`setRoot: ensuring readwrite permission on "${handle.name}"…`);
    const granted = await ensurePermission(handle);
    if (!granted) {
      log.warn("setRoot: user denied readwrite permission on root folder.");
      return;
    }

    await stored;
    log.info("setRoot: activating root…");
    await this.activateRoot(handle);
    log.info("setRoot: complete");
  }

  private async activateRoot(handle: FileSystemDirectoryHandle): Promise<void> {
    this.state.setRoot(handle);
    await this.state.updateEditorTabsClosable();
    log.info(`activateRoot: CallerBuddyRoot set to "${handle.name}"`);

    log.info("activateRoot: loading settings…");
    await this.loadSettings();
    log.info("activateRoot: settings loaded");

    log.info("activateRoot: restoring playlist…");
    await this.restorePlaylist(handle);
    log.info("activateRoot: playlist restored");

    this.listenForPlaylistChanges();

    log.info("activateRoot: opening playlist editor tab…");
    await this.state.openEditorTab(handle, handle.name);
    log.info("activateRoot: complete");
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
        const raw = JSON.parse(text) as Record<string, unknown>;
        const normalized = normalizeSettings(raw);
        this.state.setSettings(mergeLegacyLyricsScaleFromDisk(normalized, raw));
        applyLyricsFontScaleFromSettings();
        persistLyricsScaleMirror();
        log.info("Settings loaded from settings.json");
      } else {
        this.state.setSettings(defaultSettings());
        applyLyricsFontScaleFromSettings();
        persistLyricsScaleMirror();
      }
    } catch (err) {
      log.warn("Could not load settings.json:", err);
      this.state.setSettings(defaultSettings());
      applyLyricsFontScaleFromSettings();
      persistLyricsScaleMirror();
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

  /** Update a single setting and persist to settings.json. */
  async updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    this.state.setSettings({ ...this.state.settings, [key]: value });
    await this.saveSettings();
  }

  // -----------------------------------------------------------------------
  // Playlist persistence
  // -----------------------------------------------------------------------

  /** Debounce handle for persisting playlist changes. */
  private playlistSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private playlistListenerAttached = false;

  /**
   * Subscribe to PLAYLIST_CHANGED so every add/remove/reorder/clear
   * persists the current playlist paths into settings.json.
   */
  private listenForPlaylistChanges(): void {
    if (this.playlistListenerAttached) return;
    this.playlistListenerAttached = true;
    this.state.addEventListener(StateEvents.PLAYLIST_CHANGED, () => {
      if (this.playlistSaveTimer) clearTimeout(this.playlistSaveTimer);
      this.playlistSaveTimer = setTimeout(() => this.persistPlaylistPaths(), 500);
    });
  }

  private async persistPlaylistPaths(): Promise<void> {
    const rootHandle = this.state.rootHandle;
    if (!rootHandle) return;
    const paths: string[] = [];
    for (const song of this.state.playlist) {
      await this.ensurePlaylistRelPathForSong(song);
      paths.push(song.playlistRelPath!);
    }
    const playedOut: string[] = [];
    for (const song of this.state.playlist) {
      if (this.state.isPlaylistEntryPlayed(song)) {
        playedOut.push(song.playlistRelPath ?? song.musicFile);
      }
    }
    this.state.settings = {
      ...this.state.settings,
      playlistPaths: paths,
      playlistPlayedPaths: playedOut,
    };
    await this.saveSettings();
    log.info(`Playlist persisted: ${paths.length} song(s), ${playedOut.length} marked played`);
  }

  /**
   * Set {@link Song.playlistRelPath} from CallerBuddyRoot + song folder (same rules as persist).
   */
  async ensurePlaylistRelPathForSong(song: Song): Promise<void> {
    const rootHandle = this.state.rootHandle;
    if (!rootHandle) return;
    const rootName = rootHandle.name;
    const dirHandle = song.dirHandle ?? rootHandle;
    let rawPath: string | undefined;
    try {
      const segments = await rootHandle.resolve(dirHandle);
      if (segments && segments.length > 0) {
        const decodedSegments = segments.map((s) => {
          try {
            return decodeURIComponent(s);
          } catch {
            return s;
          }
        });
        rawPath = decodedSegments.join("/") + "/" + song.musicFile;
      }
    } catch {
      /* fall through to normalize existing or musicFile */
    }

    if (!rawPath) {
      rawPath = song.playlistRelPath ?? song.musicFile;
    }
    song.playlistRelPath = normalizePlaylistRelPath(rawPath, rootName);
  }

  /** Add to playlist after resolving {@link Song.playlistRelPath}. */
  async addSongToPlaylist(song: Song): Promise<void> {
    await this.ensurePlaylistRelPathForSong(song);
    this.state.addToPlaylist(song);
  }

  async insertSongAtStartOfPlaylist(song: Song): Promise<void> {
    await this.ensurePlaylistRelPathForSong(song);
    this.state.insertAtStartOfPlaylist(song);
  }

  async insertSongInPlaylist(song: Song, index: number): Promise<void> {
    await this.ensurePlaylistRelPathForSong(song);
    this.state.insertInPlaylist(song, index);
  }

  /**
   * After a folder scan, sync playlist entries in that folder to scan filenames
   * (matched by exact musicFile or label) and persist paths to settings.json.
   */
  async syncPlaylistFilenamesFromFolder(
    dirHandle: FileSystemDirectoryHandle,
    folderSongs: Song[],
  ): Promise<void> {
    const byFile = new Map(folderSongs.map((s) => [s.musicFile, s]));
    const byLabel = new Map<string, Song>();
    for (const s of folderSongs) {
      if (s.label) byLabel.set(s.label, s);
    }
    let changed = false;
    for (const song of this.state.playlist) {
      if (song.dirHandle !== dirHandle && song.dirHandle?.name !== dirHandle.name) {
        continue;
      }
      const scanned =
        byFile.get(song.musicFile) ??
        (song.label ? byLabel.get(song.label) : undefined);
      if (!scanned) continue;
      if (
        scanned.musicFile === song.musicFile &&
        scanned.lyricsFile === song.lyricsFile
      ) {
        continue;
      }
      song.musicFile = scanned.musicFile;
      song.lyricsFile = scanned.lyricsFile;
      await this.ensurePlaylistRelPathForSong(song);
      changed = true;
      log.info(`Playlist entry synced to scanned filenames: ${scanned.musicFile}`);
    }
    if (changed) {
      await this.persistPlaylistPaths();
    }
  }

  /**
   * Rebuild the in-memory playlist from the paths stored in settings.json.
   * Each path is relative to CallerBuddyRoot (e.g. "Christmas/Song.MP3" or
   * just "Song.MP3" for root-level songs). Loads songs.json (or scans) from
   * each referenced subfolder to get full metadata.
   */
  private async restorePlaylist(rootHandle: FileSystemDirectoryHandle): Promise<void> {
    const rootName = rootHandle.name;
    const rawPaths = this.state.settings.playlistPaths;
    const rawPlayed = this.state.settings.playlistPlayedPaths;
    const paths = normalizePlaylistRelPaths(rawPaths, rootName);
    const playedPaths = normalizePlaylistRelPaths(rawPlayed, rootName);

    const pathsNeedMigration =
      paths.length !== rawPaths.length ||
      paths.some((p, i) => p !== rawPaths[i]);
    const playedNeedMigration =
      playedPaths.length !== rawPlayed.length ||
      playedPaths.some((p, i) => p !== rawPlayed[i]);
    if (pathsNeedMigration || playedNeedMigration) {
      this.state.settings = {
        ...this.state.settings,
        playlistPaths: paths,
        playlistPlayedPaths: playedPaths,
      };
      await this.saveSettings();
      log.info("restorePlaylist: migrated playlist paths to CallerBuddyRoot-relative form");
    }

    if (paths.length === 0) {
      this.state.clearPlaylist();
      return;
    }

    // Map from full relative path (lowercase) → Song with dirHandle attached.
    const songsByPath = new Map<string, Song>();
    const foldersToLoad = new Set<string>();

    for (const p of paths) {
      const slashIdx = p.lastIndexOf("/");
      foldersToLoad.add(slashIdx >= 0 ? p.substring(0, slashIdx) : "");
    }

    for (const folder of foldersToLoad) {
      try {
        const dirHandle = folder
          ? await resolveSubdir(rootHandle, folder)
          : rootHandle;
        let songs = await loadSongsJson(dirHandle);
        if (songs.length === 0) {
          songs = await scanDirectory(dirHandle);
        }
        for (const s of songs) {
          const fullPath = folder ? folder + "/" + s.musicFile : s.musicFile;
          s.dirHandle = dirHandle;
          songsByPath.set(fullPath.toLowerCase(), s);
        }
      } catch (err) {
        log.warn(`restorePlaylist: could not load folder "${folder}":`, err);
      }
    }

    const restored: Song[] = [];
    for (const p of paths) {
      const song = songsByPath.get(p.toLowerCase());
      if (song) {
        restored.push({ ...song, playlistRelPath: p });
      } else {
        log.warn(`restorePlaylist: song not found for path "${p}", skipping`);
      }
    }

    if (restored.length > 0) {
      this.state.playlist = restored;
      this.state.hydratePlayedPlaylistFromPaths(playedPaths);
      log.info(`restorePlaylist: restored ${restored.length} of ${paths.length} song(s)`);
    } else {
      this.state.clearPlaylist();
    }
  }

  // -----------------------------------------------------------------------
  // Song operations
  // -----------------------------------------------------------------------

  /**
   * Update a song's metadata and persist to songs.json in the song's folder.
   * Uses `opts.dirHandle` if provided, else song.dirHandle, else rootHandle.
   */
  async updateSong(
    song: Song,
    opts?: { dirHandle?: FileSystemDirectoryHandle },
  ): Promise<void> {
    const handle = opts?.dirHandle ?? song.dirHandle ?? this.state.rootHandle;
    if (!handle) {
      log.warn(`updateSong: no directory handle for "${song.musicFile}"; skipped persist`);
      return;
    }
    if (!song.dirHandle && !opts?.dirHandle && handle === this.state.rootHandle) {
      log.debug(
        `updateSong: using CallerBuddy root for "${song.musicFile}" (song.dirHandle unset)`,
      );
    }

    const key = song.musicFile.toLowerCase();
    try {
      const folderSongs = await loadSongsJson(handle);
      const folderIdx = folderSongs.findIndex(
        (s) => s.musicFile.toLowerCase() === key,
      );
      if (folderIdx >= 0) {
        folderSongs[folderIdx] = song;
      } else {
        song.orderAdded = nextOrderAdded(folderSongs);
        folderSongs.push(song);
      }
      await saveSongsJson(handle, folderSongs);
      this.state.emit(StateEvents.SONG_UPDATED);
    } catch (err) {
      log.warn("Could not persist song update:", err);
    }
  }

  /** Read the lyrics file for a song. Returns the HTML/MD text or empty string. */
  async loadLyrics(song: Song): Promise<string> {
    const handle = song.dirHandle ?? this.state.rootHandle;
    if (!song.lyricsFile || !handle) return "";
    try {
      return await readTextFile(handle, song.lyricsFile);
    } catch (err) {
      log.warn(`Could not load lyrics for "${song.title}":`, err);
      return "";
    }
  }

  /**
   * Save lyrics HTML to the song's lyrics file.
   * If the song had no lyrics file (new creation), updates song.lyricsFile
   * in-memory and persists the change to songs.json.
   */
  async saveLyrics(song: Song, lyricsFilename: string, htmlContent: string): Promise<void> {
    const handle = song.dirHandle ?? this.state.rootHandle;
    if (!handle || !lyricsFilename) return;

    await writeTextFile(handle, lyricsFilename, htmlContent);
    log.info(`Lyrics saved to "${lyricsFilename}"`);

    if (song.lyricsFile !== lyricsFilename) {
      song.lyricsFile = lyricsFilename;
      await this.updateSong(song);
      log.info(`Song "${song.title}" now references lyrics file "${lyricsFilename}"`);
    }
  }

  /** Load and decode the audio data for a song, prepare the audio engine. */
  async loadSongAudio(song: Song): Promise<void> {
    const handle = song.dirHandle ?? this.state.rootHandle;
    if (!handle) {
      this.lastLoadedSongDirHandle = null;
      return;
    }
    this.lastLoadedSongDirHandle = handle;
    try {
      const t0 = performance.now();
      const data = await readBinaryFile(handle, song.musicFile);
      const t1 = performance.now();
      await this.audio.loadAudio(data);
      const t2 = performance.now();
      this.audio.setVolume(song.volume);
      const { start, end } = effectiveAudioLoopPoints(song, this.audio.getDuration());
      this.audio.setLoopPoints(start, end);
      this.audio.setPitch(song.pitch);
      this.audio.setTempo(song.deltaTempo, song.originalTempo);
      const t3 = performance.now();
      log.info(
        `loadSongAudio: read=${(t1 - t0).toFixed(1)}ms decode=${(t2 - t1).toFixed(1)}ms setup=${(t3 - t2).toFixed(1)}ms total=${(t3 - t0).toFixed(1)}ms`,
      );
    } catch (err) {
      this.lastLoadedSongDirHandle = null;
      await logSongAudioLoadFailure(song, handle, this.state.rootHandle, err);
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // BPM detection (background, per-folder)
  // -----------------------------------------------------------------------

  /** Tracks which folders currently have BPM detection running (by handle name). */
  private bpmDetectionActive = new Set<string>();

  /**
   * Run BPM detection for songs in a specific folder that have originalTempo === 0.
   * Called by each playlist-editor instance after loading its folder.
   *
   * @param dirHandle  The folder containing the songs' audio files.
   * @param songs      The song list to analyze (mutated in place).
   * @param onUpdate   Callback fired when any song's BPM is updated, receives
   *                   the full (mutated) songs array so the editor can refresh.
   */
  async detectBpmForSongs(
    dirHandle: FileSystemDirectoryHandle,
    songs: Song[],
    onUpdate: (songs: Song[]) => void,
  ): Promise<void> {
    const folderKey = dirHandle.name;
    if (this.bpmDetectionActive.has(folderKey)) {
      log.info(`BPM detection already running for "${folderKey}", skipping`);
      return;
    }

    const needsBpm = songs.filter((s) => s.originalTempo === 0);
    if (needsBpm.length === 0) {
      log.info(`All songs in "${folderKey}" already have BPM data`);
      return;
    }

    this.bpmDetectionActive.add(folderKey);
    log.info(`Starting BPM detection for ${needsBpm.length} songs in "${folderKey}"…`);

    let detected = 0;
    for (const song of needsBpm) {
      try {
        const audioData = await readBinaryFile(dirHandle, song.musicFile);
        const bpm = await detectBPM(audioData);
        if (bpm > 0) {
          song.originalTempo = bpm;
          detected++;
          log.info(`BPM for "${song.title}": ${bpm}`);
          onUpdate(songs);
        }
      } catch (err) {
        log.warn(`BPM detection failed for "${song.title}":`, err);
      }
    }

    if (detected > 0) {
      try {
        await saveSongsJson(dirHandle, songs);
        log.info(`BPM detection for "${folderKey}": ${detected}/${needsBpm.length} songs updated`);
      } catch (err) {
        log.warn(`Could not persist BPM results for "${folderKey}":`, err);
      }
    } else {
      log.info(`BPM detection for "${folderKey}": no songs could be analyzed`);
    }

    this.bpmDetectionActive.delete(folderKey);
  }

  // -----------------------------------------------------------------------
  // Folder tab management
  // -----------------------------------------------------------------------

  /**
   * Open a subfolder in a new playlist editor tab.
   * Prevents duplicate tabs for the same folder.
   */
  async openFolderTab(
    dirHandle: FileSystemDirectoryHandle,
    folderName: string,
  ): Promise<void> {
    await this.state.openEditorTab(dirHandle, folderName);
  }

  // -----------------------------------------------------------------------
  // Playlist → play flow
  // -----------------------------------------------------------------------

  /** Open the playlist play view. */
  openPlaylistPlay(): void {
    this.state.openSingletonTab(TabType.PlaylistPlay, "Now Playing", true);
  }

  /** Open the song play view for a specific song. Starts playback after load. */
  async openSongPlay(
    song: Song,
    opts?: { closeNowPlayingWhenDone?: boolean },
  ): Promise<void> {
    this.closeNowPlayingWhenSongPlayCloses = opts?.closeNowPlayingWhenDone ?? false;
    const t0 = performance.now();
    await this.audio.ensureContextRunning();
    const t1 = performance.now();
    try {
      await this.loadSongAudio(song);
    } catch {
      this.closeNowPlayingWhenSongPlayCloses = false;
      return;
    }
    const t2 = performance.now();
    this.state.setCurrentSong(song);
    await this.audio.play();
    const t3 = performance.now();
    log.info(
      `openSongPlay: ctxResume=${(t1 - t0).toFixed(1)}ms loadSongAudio=${(t2 - t1).toFixed(1)}ms play=${(t3 - t2).toFixed(1)}ms total=${(t3 - t0).toFixed(1)}ms`,
    );
    this.state.openSingletonTab(
      TabType.SongPlay,
      song.title,
      true,
      { song },
    );
  }

  /** song-play registers while mounted; cleared on disconnect. */
  setSongPlayUnsavedGuard(fn: (() => Promise<boolean>) | null): void {
    this.songPlayUnsavedGuard = fn;
  }

  /** Run the unsaved-lyrics prompt if needed. True = OK to leave / close. */
  async runSongPlayUnsavedGuard(): Promise<boolean> {
    if (!this.songPlayUnsavedGuard) return true;
    return this.songPlayUnsavedGuard();
  }

  /**
   * Tear down song play (stop audio, optionally persist play history, remove tab, clear current song).
   * Idempotent: no-op if there is no song play tab and no current song.
   */
  async finalizeSongPlayClose(): Promise<void> {
    const tab = this.state.tabs.find((t) => t.type === TabType.SongPlay);
    const song = this.state.currentSong;
    if (!tab && !song) {
      this.lastLoadedSongDirHandle = null;
      return;
    }

    const alsoCloseNowPlaying = this.closeNowPlayingWhenSongPlayCloses;

    const persistDirHandle = this.lastLoadedSongDirHandle;
    const session = this.songPlaySession;
    this.songPlaySession = null;

    if (song && session && !this.practiceMode) {
      const duration = this.audio.getDuration();
      const ratio = tempoRatioFromSong(song);
      const threshold = qualifyingPlayWallSeconds(duration, ratio);
      const qualifies =
        session.naturalEnd ||
        (Number.isFinite(threshold) && session.accumulatedPlayingWallSec >= threshold);
      if (qualifies) {
        const nowMs = Date.now();
        if (shouldRefreshPlayStats(song.lastUsed, nowMs)) {
          const deltaDays = daysSinceLastUsedMs(song.lastUsed, nowMs);
          const wNew = nextPlayWeight(song.playWeight, deltaDays);
          const updated = { ...song, lastUsed: lastUsedIsoFromMs(nowMs), playWeight: wNew };
          await this.updateSong(updated, {
            dirHandle: persistDirHandle ?? undefined,
          });
        }
      }
    }

    this.lastLoadedSongDirHandle = null;
    this.audio.stop();
    this.state.setCurrentSong(null);
    if (tab) {
      this.state.closeTab(tab.id);
    }

    if (alsoCloseNowPlaying) {
      this.closeNowPlayingWhenSongPlayCloses = false;
      const nowPlayingTab = this.state.tabs.find((t) => t.type === TabType.PlaylistPlay);
      if (nowPlayingTab) this.state.closeTab(nowPlayingTab.id);
    }
  }

  /**
   * Close the song play tab after an optional unsaved-lyrics prompt.
   * @returns false if the user chose not to save and the close was aborted.
   */
  async closeSongPlay(): Promise<boolean> {
    if (!(await this.runSongPlayUnsavedGuard())) {
      return false;
    }
    await this.finalizeSongPlayClose();
    return true;
  }
  // -----------------------------------------------------------------------
  // Song onboarding (ZIP or folder import)
  // -----------------------------------------------------------------------

  /** Abstraction over the import source (ZIP archive or unpacked folder). */
  private onboardingSource: OnboardingSource | null = null;
  /**
   * Read a ZIP file, analyze its contents, and open the song-onboard review tab.
   */
  async openSongOnboard(file: File): Promise<void> {
    log.info(`openSongOnboard: reading ZIP "${file.name}" (${file.size} bytes)…`);
    const data = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(data);

    const entryPaths: string[] = [];
    zip.forEach((relativePath, entry) => {
      if (!entry.dir) entryPaths.push(relativePath);
    });
    log.info(`openSongOnboard: ZIP contains ${entryPaths.length} files`);

    this.onboardingSource = {
      type: "zip",
      readText: async (path) => {
        const entry = zip.file(path);
        if (!entry) throw new Error(`ZIP entry not found: ${path}`);
        return entry.async("string");
      },
      readBinary: async (path) => {
        const entry = zip.file(path);
        if (!entry) throw new Error(`ZIP entry not found: ${path}`);
        return entry.async("arraybuffer");
      },
    };

    const proposal = await analyzeZipForOnboarding(
      file.name, entryPaths, this.onboardingSource.readText,
    );
    log.info(`openSongOnboard: proposal — label="${proposal.label}", title="${proposal.title}"`);

    this.state.openSingletonTab(
      TabType.SongOnboard,
      `Import: ${proposal.title || file.name}`,
      true,
      { proposal, sourceName: file.name, sourceType: "zip" as const },
    );
  }

  /**
   * Enumerate an unpacked folder, analyze its contents, and open the
   * song-onboard review tab — same flow as openSongOnboard but for a folder.
   */
  async openSongOnboardFromFolder(dirHandle: FileSystemDirectoryHandle): Promise<void> {
    log.info(`openSongOnboardFromFolder: enumerating "${dirHandle.name}"…`);

    const entryPaths = await listFilesRecursive(dirHandle);
    log.info(`openSongOnboardFromFolder: folder contains ${entryPaths.length} files`);

    this.onboardingSource = {
      type: "folder",
      readText: async (path) => {
        const file = await getFileByPath(dirHandle, path);
        return file.text();
      },
      readBinary: async (path) => {
        const file = await getFileByPath(dirHandle, path);
        return file.arrayBuffer();
      },
    };

    const folderName = dirHandle.name;
    const proposal = await analyzeZipForOnboarding(
      folderName, entryPaths, this.onboardingSource.readText,
    );
    log.info(`openSongOnboardFromFolder: proposal — label="${proposal.label}", title="${proposal.title}"`);

    this.state.openSingletonTab(
      TabType.SongOnboard,
      `Import: ${proposal.title || folderName}`,
      true,
      { proposal, sourceName: folderName, sourceType: "folder" as const },
    );
  }

  /**
   * Finalize the import: read the selected MP3 from the source, write the
   * MP3 and normalized HTML to the target folder, and refresh the song list.
   *
   * @param proposal  The (possibly user-edited) onboarding proposal
   * @returns true if the import succeeded
   */
  async importSong(proposal: OnboardingProposal): Promise<boolean> {
    const source = this.onboardingSource;
    if (!source) {
      log.error("importSong: no onboarding source loaded");
      return false;
    }

    const dirHandle = this.getImportTargetDir();
    if (!dirHandle) {
      log.error("importSong: no target directory");
      return false;
    }

    // Read and write the MP3
    if (proposal.selectedMp3) {
      log.info(`importSong: reading MP3 "${proposal.selectedMp3}"…`);
      const mp3Data = await source.readBinary(proposal.selectedMp3);
      const mp3Handle = await dirHandle.getFileHandle(proposal.destMp3Name, { create: true });
      const writable = await mp3Handle.createWritable();
      await writable.write(mp3Data);
      await writable.close();
      log.info(`importSong: wrote "${proposal.destMp3Name}" (${mp3Data.byteLength} bytes)`);
    }

    // Write the normalized HTML lyrics
    if (proposal.normalizedHtml && proposal.destHtmlName) {
      await writeTextFile(dirHandle, proposal.destHtmlName, proposal.normalizedHtml);
      log.info(`importSong: wrote "${proposal.destHtmlName}"`);
    }

    // Refresh the song list for the target folder
    try {
      const merged = await loadAndMergeSongs(dirHandle);
      await this.syncPlaylistFilenamesFromFolder(dirHandle, merged);
      log.info("importSong: song list refreshed");
    } catch (err) {
      log.warn("importSong: could not refresh song list:", err);
    }

    // Clean up
    this.onboardingSource = null;

    // Close the onboard tab
    const tab = this.state.tabs.find((t) => t.type === TabType.SongOnboard);
    if (tab) this.state.closeTab(tab.id);

    this.state.emit(StateEvents.SONGS_LOADED);
    log.info("importSong: complete");
    return true;
  }

  /**
   * Get the directory handle for the import target.
   * Uses the currently active playlist editor folder, falling back to rootHandle.
   */
  private getImportTargetDir(): FileSystemDirectoryHandle | null {
    const activeTab = this.state.getActiveTab();
    if (activeTab?.type === TabType.PlaylistEditor) {
      const data = activeTab.data as EditorTabData | undefined;
      if (data?.dirHandle) return data.dirHandle;
    }

    for (const tab of this.state.tabs) {
      if (tab.type === TabType.PlaylistEditor) {
        const data = tab.data as EditorTabData | undefined;
        if (data?.dirHandle) return data.dirHandle;
      }
    }

    return this.state.rootHandle;
  }

  /** Read a text entry from the current onboarding source (ZIP or folder). */
  async readOnboardingEntry(path: string): Promise<string> {
    if (!this.onboardingSource) throw new Error("No onboarding source loaded");
    return this.onboardingSource.readText(path);
  }
}

// ---------------------------------------------------------------------------
// Onboarding source abstraction
// ---------------------------------------------------------------------------

interface OnboardingSource {
  type: "zip" | "folder";
  readText: (path: string) => Promise<string>;
  readBinary: (path: string) => Promise<ArrayBuffer>;
}

/** Decode a File System Access path segment when Android returns URI-encoded names. */
function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Describe where CallerBuddy expects a song's audio file (for error logs).
 * Uses playlistRelPath when set; otherwise root-relative dir + musicFile.
 */
async function describeSongAudioTarget(
  song: Song,
  dirHandle: FileSystemDirectoryHandle,
  rootHandle: FileSystemDirectoryHandle | null,
): Promise<{ displayPath: string; details: string }> {
  let rootRelDir = "";
  if (rootHandle) {
    try {
      const segments = await rootHandle.resolve(dirHandle);
      if (segments && segments.length > 0) {
        rootRelDir = segments.map(decodePathSegment).join("/");
      }
    } catch {
      /* resolve() may fail on some platforms */
    }
  }

  const displayPath =
    song.playlistRelPath ??
    (rootRelDir ? `${rootRelDir}/${song.musicFile}` : `${dirHandle.name}/${song.musicFile}`);

  const details = [
    `path="${displayPath}"`,
    `musicFile="${song.musicFile}"`,
    `dirHandle="${dirHandle.name}"`,
    song.playlistRelPath ? `playlistRelPath="${song.playlistRelPath}"` : null,
    rootRelDir ? `rootRelDir="${rootRelDir}"` : null,
    song.dirHandle ? "dirHandleSource=song" : "dirHandleSource=rootFallback",
  ]
    .filter(Boolean)
    .join(", ");

  return { displayPath, details };
}

/** Log a failed audio load with path context and on-disk hints (for phone debugging). */
async function logSongAudioLoadFailure(
  song: Song,
  dirHandle: FileSystemDirectoryHandle,
  rootHandle: FileSystemDirectoryHandle | null,
  err: unknown,
): Promise<void> {
  const { displayPath, details } = await describeSongAudioTarget(
    song,
    dirHandle,
    rootHandle,
  );
  log.error(`Failed to load audio for "${song.title}" at ${displayPath}:`, err);
  log.error(`Audio load context: ${details}`);

  if (!(err instanceof DOMException && err.name === "NotFoundError")) return;

  try {
    const entries = await listDirectory(dirHandle);
    const musicFiles = entries
      .filter((e) => e.kind === "file" && isMusicFile(e.name))
      .map((e) => e.name);
    log.error(
      `Directory "${dirHandle.name}" contains ${musicFiles.length} music file(s): ` +
        (musicFiles.length > 0 ? musicFiles.join(", ") : "(none)"),
    );

    if (song.label) {
      const sameLabel = musicFiles.filter((f) => f.startsWith(song.label + " - "));
      if (sameLabel.length > 0 && !sameLabel.includes(song.musicFile)) {
        log.error(
          `Stored musicFile "${song.musicFile}" not on disk; same label: ${sameLabel.join(", ")} ` +
            `(open this folder tab and wait for scan+merge to sync songs.json)`,
        );
      }
    }
  } catch (listErr) {
    log.warn(`Could not list directory "${dirHandle.name}" for diagnosis:`, listErr);
  }
}

/** Walk a slash-separated relative path from a root directory handle. */
async function resolveSubdir(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const part of relativePath.split("/")) {
    if (!part) continue;
    dir = await dir.getDirectoryHandle(part);
  }
  return dir;
}

/** Recursively list all file paths in a directory, relative to the root. */
async function listFilesRecursive(
  dir: FileSystemDirectoryHandle,
  prefix = "",
): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of dir.values()) {
    const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "file") {
      paths.push(entryPath);
    } else if (entry.kind === "directory") {
      const subDir = await dir.getDirectoryHandle(entry.name);
      paths.push(...(await listFilesRecursive(subDir, entryPath)));
    }
  }
  return paths;
}

/** Navigate a directory handle by a slash-separated path and return the File. */
async function getFileByPath(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<File> {
  const parts = path.split("/");
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]);
  }
  const fileHandle = await dir.getFileHandle(parts[parts.length - 1]);
  return fileHandle.getFile();
}

/** The one and only CallerBuddy instance. Imported by all modules that need it. */
export const callerBuddy = new CallerBuddy();
