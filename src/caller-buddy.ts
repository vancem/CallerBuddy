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

import { AppState, TabType } from "./services/app-state.js";
import {
  storeRootHandle,
  loadRootHandle,
  ensurePermission,
  readTextFile,
  readBinaryFile,
  writeTextFile,
  fileExists,
} from "./services/file-system-service.js";
import { loadSongsJson, saveSongsJson, loadAndMergeSongs } from "./services/song-library.js";
import {
  WebAudioEngine,
  type AudioEngine,
} from "./services/audio-engine.js";
import { detectBPM } from "./services/bpm-detector.js";
import { defaultSettings, type Settings } from "./models/settings.js";
import type { Song } from "./models/song.js";
import { log } from "./services/logger.js";
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

  /** Update a single setting and persist to settings.json. */
  async updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    this.state.setSettings({ ...this.state.settings, [key]: value });
    await this.saveSettings();
  }

  // -----------------------------------------------------------------------
  // Song operations
  // -----------------------------------------------------------------------

  /**
   * Update a song's metadata and persist to songs.json in the song's folder.
   * Uses song.dirHandle to write to the correct folder's songs.json.
   * Falls back to rootHandle if dirHandle is not set.
   */
  async updateSong(song: Song): Promise<void> {
    const handle = song.dirHandle ?? this.state.rootHandle;
    if (!handle) return;

    // Update in global songs array (backward compat for BPM detection callbacks)
    const idx = this.state.songs.findIndex(
      (s) => s.musicFile === song.musicFile,
    );
    if (idx >= 0) {
      this.state.songs[idx] = song;
    }

    try {
      const folderSongs = await loadSongsJson(handle);
      const folderIdx = folderSongs.findIndex(
        (s) => s.musicFile === song.musicFile,
      );
      if (folderIdx >= 0) {
        folderSongs[folderIdx] = song;
        await saveSongsJson(handle, folderSongs);
      }
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
    if (!handle) return;
    const data = await readBinaryFile(handle, song.musicFile);
    await this.audio.loadAudio(data);
    this.audio.setVolume(song.volume);
    this.audio.setLoopPoints(song.loopStartTime, song.loopEndTime);
    this.audio.setPitch(song.pitch);
    this.audio.setTempo(song.deltaTempo, song.originalTempo);
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
  async openSongPlay(song: Song): Promise<void> {
    await this.audio.ensureContextRunning();
    try {
      await this.loadSongAudio(song);
    } catch (err) {
      log.error(`Failed to load audio for "${song.title}":`, err);
      return;
    }
    this.state.setCurrentSong(song);
    await this.audio.play();
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
   * Tear down song play (stop audio, persist lastUsed, remove tab, clear current song).
   * Idempotent: no-op if there is no song play tab and no current song.
   */
  async finalizeSongPlayClose(): Promise<void> {
    const tab = this.state.tabs.find((t) => t.type === TabType.SongPlay);
    const song = this.state.currentSong;
    if (!tab && !song) return;

    this.audio.stop();
    if (song) {
      const updated = { ...song, lastUsed: new Date().toISOString() };
      await this.updateSong(updated);
    }
    if (tab) {
      this.state.closeTab(tab.id);
    }
    this.state.setCurrentSong(null);
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
      await loadAndMergeSongs(dirHandle);
      log.info("importSong: song list refreshed");
    } catch (err) {
      log.warn("importSong: could not refresh song list:", err);
    }

    // Clean up
    this.onboardingSource = null;

    // Close the onboard tab
    const tab = this.state.tabs.find((t) => t.type === TabType.SongOnboard);
    if (tab) this.state.closeTab(tab.id);

    this.state.emit("songs-loaded");
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
