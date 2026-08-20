/**
 * Playlist editor: browse songs in a folder, filter, and build a playlist.
 *
 * Each editor instance is self-contained: it owns its own directory handle,
 * song list, and subfolder state. Multiple instances can coexist in separate
 * tabs, all sharing the global playlist via AppState events.
 *
 * Layout:
 *  ┌─────────────┬──────────────────────────────────────┐
 *  │  Editing    │  Root > subfolder1 > subfolder2      │
 *  │  Playlist   │                                      │
 *  │             │  [Filter: ________________]          │
 *  │  1. Song A  │  ┌──────┬───────┬─────┬──────┐       │
 *  │  2. Song B  │  │📁 sub│       │     │      │       │
 *  │  3. Song C  │  │Title │ Label │ Cat │ Rank │       │
 *  │             │  └──────┴───────┴─────┴──────┘       │
 *  │  [▶ Play]   │                                      │
 *  └─────────────┴──────────────────────────────────────┘
 *
 * Closable folder tabs (not the root editor) show Close beside Play/Clear; Esc closes the tab.
 *
 * See CallerBuddySpec.md §"Playlist Editor UI".
 */

import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { callerBuddy } from "../caller-buddy.js";
import {
  chromeButtonStyles,
  ctxHelpBtnStyles,
  modalOverlayStyles,
} from "../styles/chrome.js";
import { PlaylistReorderController } from "../controllers/playlist-reorder-controller.js";
import { PanelResizeController } from "../controllers/panel-resize-controller.js";
import {
  DEFAULT_PLAYLIST_PANEL_HEIGHT,
  DEFAULT_PLAYLIST_PANEL_WIDTH,
  defaultPlaylistEditorView,
  type PlaylistEditorSortDir,
  type PlaylistEditorSortField,
  type PlaylistEditorSortKey,
  type PlaylistEditorViewSettings,
} from "../models/settings.js";
import { StateEvents, TabType } from "../services/app-state.js";
import { isSingingCall } from "../models/song.js";
import type { Song } from "../models/song.js";
import { loadAndMergeSongs, loadSongsJson } from "../services/song-library.js";
import { isSameDirectory, listDirectory, type DirEntry, type FolderRef } from "../services/file-system-service.js";
import { log } from "../services/logger.js";
import { daysSinceLastUsedMs, displayPlayWeight } from "../utils/play-history.js";
import { songMatchesTextFilter } from "../utils/song-text-filter.js";
import { formatUnknownError } from "../utils/format.js";
import {
  HostLayoutResizeController,
  isHostPortraitLayout,
} from "../utils/host-portrait-layout.js";

type SortField = PlaylistEditorSortField;
type SortDir = PlaylistEditorSortDir;
type SortKey = PlaylistEditorSortKey;

/** Inline spreadsheet-style edit for Categories / Rank table cells. */
type EditingCell = { key: string; field: "categories" | "rank"; draft: string };

/** Discriminated union for the context menu target (song or folder). */
type ContextTarget =
  | { kind: "song"; song: Song }
  | { kind: "folder"; entry: DirEntry };

@customElement("playlist-editor")
export class PlaylistEditor extends LitElement {
  /**
   * The directory handle for the folder this editor is browsing.
   * Set by app-shell from TabInfo.data when the tab is rendered.
   */
  @property({ attribute: false })
  dirHandle: FileSystemDirectoryHandle | null = null;

  /** Mirrors TabInfo.closable: false for the CallerBuddy root folder editor. */
  @property({ type: Boolean }) editorClosable = false;

  /** This editor tab's id; used to close via the button or Esc. */
  @property({ type: String }) tabId = "";

  /** Re-render when host box changes so width/height styles match @container aspect flip. */
  private _hostLayoutRo = new HostLayoutResizeController(this);

  @state() private filterText = "";
  /** When true, rank filter uses >= threshold; when false, uses < threshold. */
  @state() private rankCompareGte = true;
  /** Empty string disables rank filtering. */
  @state() private rankFilterInput = "";
  /**
   * Multi-key stable sort order. Most-recently toggled field is primary (index 0).
   * Default when entering the editor: Rank (desc), then Title (asc).
   */
  @state() private sortKeys: SortKey[] = defaultPlaylistEditorView().sortKeys;

  /** Debounce timer for persisting browser filters/sort while typing. */
  private persistViewTimer: ReturnType<typeof setTimeout> | null = null;
  @state() private contextTarget: ContextTarget | null = null;
  @state() private contextMenuPos = { x: 0, y: 0 };
  /** Song pending permanent delete confirmation (null when dialog closed). */
  @state() private deleteConfirmSong: Song | null = null;
  @state() private deleteInProgress = false;

  /** Song being renamed (null when dialog closed). */
  @state() private renameSongTarget: Song | null = null;
  @state() private renameLabel = "";
  @state() private renameTitle = "";
  @state() private renameConflictName: string | null = null;
  @state() private renameInProgress = false;
  @state() private renameFolders: FolderRef[] = [];
  @state() private renameDestRelPath = "";
  @state() private renameFoldersLoading = false;

  /** Create-folder dialog (opened from the app menu). */
  @state() private createFolderOpen = false;
  @state() private createFolderName = "";
  @state() private createFolderError = "";
  @state() private createFolderInProgress = false;

  /** One-time hint shown the first time this (root) editor renders after demo songs were added. */
  @state() private showGettingStartedHint = false;

  @state() private editingCell: EditingCell | null = null;
  /** After Escape, skip one blur so we do not persist cancelled edits. */
  private skipNextBlurCommit = false;

  /** `${musicFile}|field` for the cell that last received autofocus (avoid refocus on each keystroke). */
  private lastFocusedEditAnchor: string | null = null;

  /**
   * {@link songKey} for the focused song row (keyboard shortcuts, selection styling).
   * Kept in sync with the filtered list in {@link syncSelectionToFilteredList}.
   */
  @state() private keyboardShortcutSongKey: string | null = null;

  /** After load or tab activation, move focus to the song table for keyboard shortcuts. */
  private pendingSongTableFocus = false;

  /** Tracks tab switches so we focus the table when this editor becomes active. */
  private lastSeenActiveTabId: string | null = null;

  /** Song object being dragged from the song table (kept as reference to preserve dirHandle). */
  private draggedSong: Song | null = null;

  private reorder = new PlaylistReorderController(this, {
    getExternalDragData: () => this.draggedSong,
    onExternalDrop: (idx) => {
      const song = this.draggedSong;
      if (song) {
        void callerBuddy.insertSongInPlaylist(song, idx);
        this.draggedSong = null;
      }
    },
  });

  /** Songs loaded from the current folder's CallerBuddySongs.json + disk scan. */
  @state() private localSongs: Song[] = [];

  /** Subdirectories in the current folder. */
  @state() private subfolders: DirEntry[] = [];

  /**
   * Navigation stack for breadcrumb traversal. stack[0] is the initial
   * folder this editor was opened with (the "root" for this editor).
   * The current folder is always the last entry.
   */
  private handleStack: FileSystemDirectoryHandle[] = [];

  /** True while the initial (or navigated) folder is being scanned. */
  @state() private loading = false;

  /** Set when {@link loadCurrentFolder} fails; shown instead of a fake empty library. */
  @state() private folderLoadError = "";

  /** Incrementing token to ignore stale async folder loads (tab switches / navigation). */
  private folderLoadSeq = 0;

  private resizerX = new PanelResizeController(this, DEFAULT_PLAYLIST_PANEL_WIDTH, {
    axis: "x",
    min: 180,
    max: 500,
    settingKey: "playlistPanelWidth",
  });
  private resizerY = new PanelResizeController(this, DEFAULT_PLAYLIST_PANEL_HEIGHT, {
    axis: "y",
    min: 120,
    max: 1200,
    settingKey: "playlistPanelHeight",
  });

  connectedCallback() {
    super.connectedCallback();
    void this._hostLayoutRo;
    this.resizerX.width =
      callerBuddy.state.settings.playlistPanelWidth ?? DEFAULT_PLAYLIST_PANEL_WIDTH;
    this.resizerY.size =
      callerBuddy.state.settings.playlistPanelHeight ?? DEFAULT_PLAYLIST_PANEL_HEIGHT;
    this.applyBrowserViewFromSettings();
    callerBuddy.state.addEventListener(StateEvents.PLAYLIST_CHANGED, this.onPlaylistChanged);
    callerBuddy.state.addEventListener(StateEvents.SONG_UPDATED, this.onSongUpdated);
    callerBuddy.state.addEventListener(StateEvents.DISK_REFRESHED, this.onDiskRefreshed);
    callerBuddy.state.addEventListener(StateEvents.SETTINGS_CHANGED, this.onSettingsChanged);
    callerBuddy.state.addEventListener(StateEvents.CHANGED, this.onAppStateChanged);
    this.lastSeenActiveTabId = callerBuddy.state.activeTabId;
    document.addEventListener("keydown", this._boundKeydown);
    this.maybeClaimGettingStartedHint();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.persistViewTimer !== null) {
      clearTimeout(this.persistViewTimer);
      this.persistViewTimer = null;
      void this.persistBrowserView();
    }
    document.removeEventListener("keydown", this._boundKeydown);
    callerBuddy.state.removeEventListener(StateEvents.PLAYLIST_CHANGED, this.onPlaylistChanged);
    callerBuddy.state.removeEventListener(StateEvents.SONG_UPDATED, this.onSongUpdated);
    callerBuddy.state.removeEventListener(StateEvents.DISK_REFRESHED, this.onDiskRefreshed);
    callerBuddy.state.removeEventListener(StateEvents.SETTINGS_CHANGED, this.onSettingsChanged);
    callerBuddy.state.removeEventListener(StateEvents.CHANGED, this.onAppStateChanged);
  }

  private onSettingsChanged = () => {
    this.resizerX.width =
      callerBuddy.state.settings.playlistPanelWidth ?? DEFAULT_PLAYLIST_PANEL_WIDTH;
    this.resizerY.size =
      callerBuddy.state.settings.playlistPanelHeight ?? DEFAULT_PLAYLIST_PANEL_HEIGHT;
    // Adopt persisted filters/sort when another editor (or disk refresh) changed them,
    // but not while this instance still has unsaved keystrokes pending.
    const incoming = callerBuddy.state.settings.playlistEditorView;
    if (
      incoming &&
      this.persistViewTimer === null &&
      JSON.stringify(incoming) !== JSON.stringify(this.snapshotBrowserView())
    ) {
      this.applyBrowserViewFromSettings();
    }
    this.requestUpdate();
  };

  private onAppStateChanged = () => {
    const { activeTabId } = callerBuddy.state;
    const becameThisTab =
      Boolean(this.tabId) &&
      activeTabId === this.tabId &&
      this.lastSeenActiveTabId !== this.tabId;
    this.lastSeenActiveTabId = activeTabId;
    if (becameThisTab && !this.loading) {
      this.pendingSongTableFocus = true;
    }
    // Re-check on every state change (not just becameThisTab) so a pending
    // table focus that was deferred by hasBlockingOverlay() (e.g. the "Add
    // demo songs?" prompt) gets retried once that overlay clears.
    if (this.pendingSongTableFocus) {
      this.requestUpdate();
    }

    this.maybeClaimGettingStartedHint();
  };

  /**
   * Only the CallerBuddyRoot editor (not closable) claims this hint — demo
   * songs are always installed into the root. Clearing the shared flag
   * immediately means only the first editor instance to observe it will show
   * it. Checked both on connect (in case it was set while unmounted) and on
   * every app-state change (the common case: this editor is already the
   * active, mounted tab when demo songs finish installing).
   */
  private maybeClaimGettingStartedHint() {
    if (callerBuddy.state.playlistGettingStartedHintPending && !this.editorClosable) {
      callerBuddy.state.setPlaylistGettingStartedHintPending(false);
      this.showGettingStartedHint = true;
    }
  }

  private dismissGettingStartedHint() {
    this.showGettingStartedHint = false;
  }

  /**
   * Stacked playlist-on-top layout. Prefer host box — viewport aspect MQs lie on WebAPK.
   */
  private isEditorPortraitLayout(): boolean {
    return isHostPortraitLayout(this);
  }

  private _boundKeydown = (e: KeyboardEvent) => this.onKeydown(e);

  /**
   * Document-level keydown sees retargeted `event.target` (the host) for shadow
   * inputs. Use composedPath so filter/rank/cell edits suppress table shortcuts.
   */
  private isEventFromTypingControl(e: Event): boolean {
    return e.composedPath().some(
      (n) =>
        n instanceof HTMLInputElement ||
        n instanceof HTMLTextAreaElement ||
        n instanceof HTMLSelectElement,
    );
  }

  private onKeydown(e: KeyboardEvent) {
    if (this.tabId && callerBuddy.state.activeTabId !== this.tabId) return;

    if (this.showGettingStartedHint) {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        this.dismissGettingStartedHint();
      }
      return;
    }

    if (e.key === "Escape" && this.createFolderOpen) {
      e.preventDefault();
      this.cancelCreateFolder();
      return;
    }
    if (e.key === "Escape" && this.renameSongTarget) {
      e.preventDefault();
      this.cancelRenameSong();
      return;
    }
    if (e.key === "Escape" && this.deleteConfirmSong) {
      e.preventDefault();
      this.cancelDeleteSong();
      return;
    }

    const inTypingControl = this.isEventFromTypingControl(e);
    if (e.key === "Escape" && this.editorClosable && this.tabId) {
      if (!inTypingControl) {
        if (this.contextTarget) {
          e.preventDefault();
          this.closeContextMenu();
          return;
        }
        e.preventDefault();
        callerBuddy.state.closeTab(this.tabId);
        return;
      }
    }

    const mod = e.ctrlKey || e.metaKey || e.altKey;
    const isAddShortcut =
      !mod &&
      (e.key === "+" || e.key === "=" || e.code === "NumpadAdd");
    const isPlayNowShortcut = !mod && e.key.toLowerCase() === "p";

    if ((isAddShortcut || isPlayNowShortcut) && !inTypingControl && !this.loading) {
      const song = this.resolveShortcutTargetSong();
      if (song) {
        e.preventDefault();
        if (isAddShortcut) void this.addToPlaylist(song);
        else void this.playSongNow(song);
        return;
      }
    }

    if (
      !mod &&
      (e.key === "ArrowDown" || e.key === "ArrowUp") &&
      !inTypingControl &&
      !this.loading
    ) {
      const songs = this.getFilteredSongs();
      if (songs.length > 0) {
        e.preventDefault();
        let idx = this.keyboardShortcutSongKey
          ? songs.findIndex((s) => this.songKey(s) === this.keyboardShortcutSongKey)
          : 0;
        if (idx < 0) idx = 0;
        const delta = e.key === "ArrowDown" ? 1 : -1;
        const next = Math.min(songs.length - 1, Math.max(0, idx + delta));
        this.keyboardShortcutSongKey = this.songKey(songs[next]);
        return;
      }
    }

    const isClearShortcut =
      (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "r";
    if (
      isClearShortcut &&
      !inTypingControl &&
      !this.loading &&
      callerBuddy.state.playlist.length > 0
    ) {
      e.preventDefault();
      callerBuddy.state.clearPlaylistWithBackup();
      return;
    }

    const isUndoShortcut =
      (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "z";
    if (
      isUndoShortcut &&
      !inTypingControl &&
      !this.loading &&
      callerBuddy.state.playlist.length === 0 &&
      callerBuddy.state.hasClearedPlaylistBackup()
    ) {
      e.preventDefault();
      callerBuddy.state.restoreClearedPlaylist();
      return;
    }

    if (
      !this.loading &&
      !this.editingCell &&
      (e.ctrlKey || e.metaKey) &&
      !e.altKey &&
      e.key.toLowerCase() === "f"
    ) {
      e.preventDefault();
      queueMicrotask(() => this.focusFilterInput());
      return;
    }

    if (e.key !== "Enter") return;
    if (inTypingControl) return;
    if (callerBuddy.state.playlist.length === 0) return;
    e.preventDefault();
    this.onPlayPlaylist();
  }

  private focusFilterInput() {
    const el = this.renderRoot.querySelector(
      ".filter-input",
    ) as HTMLInputElement | null;
    el?.focus();
    el?.select();
  }

  /** True while some dialog/overlay (in this editor or app-shell) should keep keyboard focus. */
  private hasBlockingOverlay(): boolean {
    return (
      callerBuddy.state.demoOfferPending ||
      this.showGettingStartedHint ||
      this.createFolderOpen ||
      Boolean(this.renameSongTarget) ||
      Boolean(this.deleteConfirmSong) ||
      Boolean(this.contextTarget)
    );
  }

  private focusSongTable() {
    if (this.tabId && callerBuddy.state.activeTabId !== this.tabId) return;
    if (this.hasBlockingOverlay()) return;
    const table = this.renderRoot.querySelector(
      "table.song-table",
    ) as HTMLTableElement | null;
    table?.focus();
  }

  private onSongRowShortcutAnchor(song: Song) {
    this.keyboardShortcutSongKey = this.songKey(song);
  }

  /** Song targeted by selection, +/=, P, and arrow keys. */
  private resolveShortcutTargetSong(): Song | null {
    const songs = this.getFilteredSongs();
    if (songs.length === 0) return null;
    if (this.keyboardShortcutSongKey) {
      const hit = songs.find((s) => this.songKey(s) === this.keyboardShortcutSongKey);
      if (hit) return hit;
    }
    return songs[0];
  }

  private onCloseEditorTab() {
    if (!this.editorClosable || !this.tabId) return;
    callerBuddy.state.closeTab(this.tabId);
  }

  private onPlaylistChanged = () => {
    this.requestUpdate();
  };

  /**
   * Persisted song fields (e.g. lastUsed, playWeight) are written via updateSong;
   * reload this folder’s CallerBuddySongs.json + scan so the table is not stuck on stale in-memory objects.
   */
  private onSongUpdated = () => {
    void this.reloadCurrentFolderFromDisk();
  };

  /** Soft reload after focus/cloud sync — JSON only, no scan+merge rewrite. */
  private onDiskRefreshed = () => {
    if (this.editingCell) return;
    void this.softReloadSongsFromDisk();
    void this.refreshSubfolders();
  };

  private async softReloadSongsFromDisk() {
    const handle = this.currentHandle;
    if (!handle || this.loading) return;
    try {
      const persisted = await loadSongsJson(handle);
      const prevByFile = new Map(
        this.localSongs.map((s) => [s.musicFile.toLowerCase(), s]),
      );
      for (const song of persisted) {
        song.dirHandle = handle;
        // Older catalogs omitted lyricsFile; keep scan-derived pairing until JSON is rewritten.
        if (!song.lyricsFile.trim()) {
          const prev = prevByFile.get(song.musicFile.toLowerCase());
          if (prev?.lyricsFile.trim()) song.lyricsFile = prev.lyricsFile;
        }
      }
      this.localSongs = persisted;
    } catch (err) {
      log.warn(`playlist-editor: soft reload failed for "${handle.name}":`, err);
    }
  }

  private async refreshSubfolders() {
    const handle = this.currentHandle;
    if (!handle || this.loading) return;
    try {
      const entries = await listDirectory(handle);
      this.subfolders = entries.filter((e) => e.kind === "directory");
    } catch (err) {
      log.warn(`playlist-editor: could not refresh folders for "${handle.name}":`, err);
    }
  }

  private async reloadCurrentFolderFromDisk() {
    if (!this.currentHandle) {
      this.requestUpdate();
      return;
    }
    await this.loadCurrentFolder();
  }

  // -- Folder loading -------------------------------------------------------

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    const c = changed as unknown as Map<PropertyKey, unknown>;
    if (
      c.has("localSongs") ||
      c.has("filterText") ||
      c.has("rankFilterInput") ||
      c.has("rankCompareGte") ||
      c.has("sortKeys")
    ) {
      this.syncSelectionToFilteredList();
    }
  }

  /** Keep the highlighted row on a visible song; clear when the list is empty. */
  private syncSelectionToFilteredList() {
    const songs = this.getFilteredSongs();
    if (songs.length === 0) {
      if (this.keyboardShortcutSongKey !== null) this.keyboardShortcutSongKey = null;
      return;
    }
    const cur = this.keyboardShortcutSongKey;
    if (cur && songs.some((s) => this.songKey(s) === cur)) return;
    this.keyboardShortcutSongKey = this.songKey(songs[0]);
  }

  /**
   * Respond to the dirHandle property being set or changed by the parent.
   * Resets navigation and loads the new folder.
   */
  protected override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has("dirHandle") && this.dirHandle) {
      const prev = changed.get("dirHandle") as FileSystemDirectoryHandle | null;
      if (prev !== this.dirHandle) {
        this.initFolder(this.dirHandle);
      }
    }
    if (changed.has("editingCell")) {
      const anchor = this.editingCell
        ? `${this.editingCell.key}|${this.editingCell.field}`
        : null;
      if (!this.editingCell) {
        this.lastFocusedEditAnchor = null;
      } else if (anchor !== this.lastFocusedEditAnchor) {
        this.lastFocusedEditAnchor = anchor;
        queueMicrotask(() => {
          const inp = this.renderRoot.querySelector(
            ".cell-input",
          ) as HTMLInputElement | null;
          inp?.focus();
          inp?.select();
        });
      }
    }

    // Don't consume the pending focus while some other dialog/overlay wants
    // keyboard focus (e.g. the app-level "Add demo songs?" prompt, shown right
    // after this tab becomes active for a freshly-chosen empty folder). Leave
    // the flag set so it's retried once that overlay closes.
    if (this.pendingSongTableFocus && !this.loading && !this.hasBlockingOverlay()) {
      this.pendingSongTableFocus = false;
      queueMicrotask(() => this.focusSongTable());
    }

    if (changed.has("keyboardShortcutSongKey") && this.keyboardShortcutSongKey) {
      queueMicrotask(() => this.scrollSelectedSongRowIntoView());
    }

    if (changed.has("showGettingStartedHint") && this.showGettingStartedHint) {
      queueMicrotask(() => {
        const btn = this.renderRoot.querySelector(
          ".getting-started-primary",
        ) as HTMLButtonElement | null;
        btn?.focus();
      });
    }
  }

  private scrollSelectedSongRowIntoView() {
    const key = this.keyboardShortcutSongKey;
    if (!key) return;
    const row = this.renderRoot.querySelector(
      `tr[data-song-key="${CSS.escape(key)}"]`,
    ) as HTMLTableRowElement | null;
    row?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }

  private async initFolder(handle: FileSystemDirectoryHandle): Promise<void> {
    this.handleStack = [handle];
    await this.loadCurrentFolder();
  }

  private async loadCurrentFolder(): Promise<void> {
    const handle = this.currentHandle;
    if (!handle) return;

    this.editingCell = null;
    this.loading = true;
    this.folderLoadError = "";
    const seq = ++this.folderLoadSeq;
    try {
      // Fast path: load CallerBuddySongs.json first so the UI can render quickly.
      const t0 = performance.now();
      const persisted = await loadSongsJson(handle);
      const t1 = performance.now();
      if (seq !== this.folderLoadSeq) return;

      for (const song of persisted) song.dirHandle = handle;
      this.localSongs = persisted;
      this.loading = false;
      log.info(
        `playlist-editor: loaded CallerBuddySongs.json (${persisted.length} songs) in ${(t1 - t0).toFixed(1)}ms`,
      );

      // Background: list directories for folder rows (non-blocking UI).
      void (async () => {
        const d0 = performance.now();
        const entries = await listDirectory(handle);
        const d1 = performance.now();
        if (seq !== this.folderLoadSeq) return;
        this.subfolders = entries.filter((e) => e.kind === "directory");
        log.info(
          `playlist-editor: listed folder entries (${entries.length}) in ${(d1 - d0).toFixed(1)}ms`,
        );
      })();

      // Background: scan the folder and merge, then refresh if anything changed.
      void (async () => {
        const s0 = performance.now();
        const merged = await loadAndMergeSongs(handle);
        const s1 = performance.now();
        if (seq !== this.folderLoadSeq) return;

        for (const song of merged) song.dirHandle = handle;
        this.localSongs = merged;
        await callerBuddy.syncPlaylistFilenamesFromFolder(handle, merged);
        log.info(
          `playlist-editor: scan+merge complete (merged=${merged.length}) in ${(s1 - s0).toFixed(1)}ms`,
        );

        // Kick off background BPM detection for this folder's songs
        callerBuddy.detectBpmForSongs(handle, merged, (updated) => {
          if (seq !== this.folderLoadSeq) return;
          this.localSongs = [...updated];
        });
      })();
    } catch (err) {
      log.error(`Failed to load folder "${handle.name}":`, err);
      this.localSongs = [];
      this.subfolders = [];
      this.folderLoadError = `Could not load folder "${handle.name}": ${formatUnknownError(err)}`;
    } finally {
      if (seq === this.folderLoadSeq) {
        // If we already flipped loading=false after CallerBuddySongs.json, keep it off.
        this.loading = false;
        this.pendingSongTableFocus = true;
        this.requestUpdate();
      }
    }
  }

  private get currentHandle(): FileSystemDirectoryHandle | null {
    return this.handleStack.length > 0
      ? this.handleStack[this.handleStack.length - 1]
      : null;
  }

  // -- Folder navigation ----------------------------------------------------

  private async navigateTo(stackIndex: number): Promise<void> {
    if (stackIndex < 0 || stackIndex >= this.handleStack.length) return;
    this.handleStack = this.handleStack.slice(0, stackIndex + 1);
    await this.loadCurrentFolder();
  }

  // -- Render ---------------------------------------------------------------

  render() {
    const songs = this.getFilteredSongs();
    const playlist = callerBuddy.state.playlist;
    const canRestore =
      playlist.length === 0 && callerBuddy.state.hasClearedPlaylistBackup();

    const isPortrait = this.isEditorPortraitLayout();
    const playlistPanelStyle = isPortrait
      ? `height: ${this.resizerY.size}px`
      : `width: ${this.resizerX.width}px`;

    return html`
      <div class="editor" @click=${this.closeContextMenu}>
        <!-- Left: Playlist -->
        <aside class="playlist-panel" style="${playlistPanelStyle}">
          <div class="panel-heading">
            <h2>Editing Playlist</h2>
            <button
              class="ctx-help-btn"
              title="Help for the whole Playlist Editor page"
              @click=${() => this.openHelpSection("playlist-editor")}
            >?</button>
          </div>
          ${playlist.length === 0
            ? html`<div
                class="empty-playlist-drop"
                @dragenter=${this.reorder.onDragEnter}
                @dragover=${this.reorder.onPlaylistContainerDragOver}
                @drop=${this.onEmptyPlaylistDrop}
              ><p class="muted">No songs in playlist. Drag songs here, right-click,
                or use the + button to add songs.</p></div>`
            : html`
                <div class="playlist-body">
                  <ol
                    class="playlist-list"
                    @dragenter=${this.reorder.onDragEnter}
                    @dragover=${this.reorder.onPlaylistContainerDragOver}
                    @dragleave=${this.reorder.onPlaylistDragLeave}
                    @drop=${this.reorder.onPlaylistDrop}
                  >
                    ${playlist.map(
                      (song, i) => html`
                        <li
                          class="playlist-item
                            ${this.reorder.draggingPlaylistIndex === i ? "dragging" : ""}
                            ${this.reorder.dragOverIndex === i && this.reorder.dropPosition === "above" ? "drop-indicator-above" : ""}
                            ${this.reorder.dragOverIndex === i && this.reorder.dropPosition === "below" ? "drop-indicator-below" : ""}"
                          draggable="true"
                          @dragstart=${(e: DragEvent) => this.reorder.onPlaylistItemDragStart(e, i)}
                          @dragend=${this.onEditorDragEnd}
                          @dragenter=${this.reorder.onDragEnter}
                          @dragover=${(e: DragEvent) => this.reorder.onPlaylistDragOver(e, i)}
                        >
                          <span class="pl-type ${isSingingCall(song) ? "singing" : "patter"}"
                            title="${isSingingCall(song) ? "Singing call" : "Patter"}"
                          >${isSingingCall(song) ? "♪" : "♫"}</span>
                          <span class="pl-title">${song.title}</span>
                          <button
                            class="icon-btn"
                            title="Remove from playlist"
                            @click=${() => callerBuddy.state.removeFromPlaylist(i)}
                          >×</button>
                        </li>
                      `,
                    )}
                  </ol>
                  <div class="playlist-shortcut-hint" aria-hidden="true">
                    <p class="muted">Type &lt;Enter&gt; to play the playlist</p>
                  </div>
                </div>
              `}
          ${callerBuddy.state.userError
            ? html`<p class="action-error" role="alert">
                ${callerBuddy.state.userError}
                <button
                  type="button"
                  class="icon-btn"
                  title="Dismiss"
                  aria-label="Dismiss error"
                  @click=${() => callerBuddy.state.clearUserError()}
                >×</button>
              </p>`
            : nothing}
          <div class="playlist-actions">
            <button
              class="primary"
              ?disabled=${playlist.length === 0}
              title="Play the playlist (Enter)"
              @click=${this.onPlayPlaylist}
            >
              ▶ Play
            </button>
            ${playlist.length > 0
              ? html`
                  <button
                    class="secondary"
                    title="Clear playlist (Ctrl+R)"
                    @click=${this.onClearPlaylist}
                  >
                    Reset
                  </button>
                `
              : nothing}
            ${canRestore
              ? html`
                  <button
                    class="secondary"
                    title="Undo clear (Ctrl+Z)"
                    @click=${this.onRestorePlaylist}
                  >
                    Undo
                  </button>
                `
              : nothing}
            ${this.editorClosable && this.tabId
              ? html`
                  <button
                    type="button"
                    class="secondary"
                    title="Close folder tab (Esc)"
                    @click=${this.onCloseEditorTab}
                  >
                    Close
                  </button>
                `
              : nothing}
          </div>
        </aside>
        <div
          class="resizer"
          title="Drag to resize playlist"
          @pointerdown=${(e: PointerEvent) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            if (isPortrait) this.resizerY.onPointerDown(e);
            else this.resizerX.onPointerDown(e);
          }}
          @mousedown=${(e: MouseEvent) =>
            isPortrait ? this.resizerY.onMouseDown(e) : this.resizerX.onMouseDown(e)}
        ></div>

        <!-- Right: Song browser -->
        <section class="browser-panel">
          ${this.renderBreadcrumb()}
          <div class="browser-content-scroll">
            <div class="browser-toolbar">
              <div class="browser-toolbar-track">
                <div class="filter-cluster">
                  <button
                    type="button"
                    class="view-reset-btn"
                    title="Reset filters and sort order to defaults"
                    aria-label="Reset filters and sort order to defaults"
                    ?disabled=${this.isBrowserViewAtDefault()}
                    @click=${this.onResetBrowserView}
                  >
                    ↺
                  </button>
                  <div class="filter-wrap">
                    ${this.filterText
                      ? html`<button
                          type="button"
                          class="filter-clear"
                          title="Clear filter"
                          aria-label="Clear filter"
                          @click=${this.onClearFilter}
                        >
                          ×
                        </button>`
                      : nothing}
                    <input
                      type="text"
                      class="filter-input"
                      placeholder="Filter…  !word excludes"
                      title="Filter by title, label, categories, or type (Singing/Patter). Space-separated words must all match; prefix a word with ! to exclude. Case insensitive. (Ctrl+F)"
                      .value=${this.filterText}
                      @input=${this.onFilterInput}
                      @keydown=${this.onFilterKeydown}
                    />
                  </div>
                </div>
                <div
                  class="rank-filter"
                  title="Filter by rank (0–100). Leave the number empty to disable. Works together with the text filter."
                >
                  <span class="rank-filter-label">Rank</span>
                  <button
                    type="button"
                    class="rank-filter-compare"
                    title=${this.rankCompareGte
                      ? "Comparing with ≥ (greater than or equal). Click to switch to less than."
                      : "Comparing with < (less than). Click to switch to greater than or equal."}
                    aria-label=${this.rankCompareGte
                      ? "Rank comparison: greater than or equal. Click to use less than."
                      : "Rank comparison: less than. Click to use greater than or equal."}
                    @click=${this.onRankCompareToggle}
                  >
                    ${this.rankCompareGte ? ">=" : "<"}
                  </button>
                  <input
                    type="number"
                    class="rank-filter-input"
                    min="0"
                    max="100"
                    step="1"
                    placeholder=""
                    title="Rank threshold (0–100). Empty = no rank filter."
                    .value=${this.rankFilterInput}
                    @input=${this.onRankFilterInput}
                    @keydown=${this.onFilterKeydown}
                  />
                </div>
                <span class="song-count">
                  ${this.subfolders.length > 0
                    ? `${this.subfolders.length} folders, `
                    : ""}${songs.length} songs
                </span>
              </div>
            </div>

            <div class="table-block">
              ${this.folderLoadError
                ? html`<p class="action-error" role="alert">${this.folderLoadError}</p>`
                : nothing}
              ${this.loading
                ? html`<p class="muted table-empty">Loading…</p>`
                : html`
                <table
                  class="song-table"
                  tabindex="-1"
                  aria-label="Songs in this folder"
                  aria-multiselectable="false"
                >
                  <thead>
                    <tr>
                      <th
                        class="play-cell"
                        title="Play this song now in the player (P)"
                      ></th>
                      <th
                        class="add-cell"
                        title="Add this song to the playlist (+)"
                      ></th>
                      <th
                        class="sortable title-col-head"
                        title="Song title, taken from the audio filename."
                        @click=${() => this.toggleSort("title")}
                      >
                        Title ${this.sortIndicator("title")}
                      </th>
                      <th
                        class="sortable"
                        title="Your preference from 0 to 100: 100 is excellent, 50 is average, 0 means avoid using this song."
                        @click=${() => this.toggleSort("rank")}
                      >
                        Rank ${this.sortIndicator("rank")}
                      </th>
                      <th
                        class="sortable last-col-head"
                        title="Days since this song was last played (practice sessions do not count)."
                        @click=${() => this.toggleSort("lastUsedDays")}
                      >
                        Last ${this.sortIndicator("lastUsedDays")}
                      </th>
                      <th
                        class="sortable played-col-head"
                        title="Weighted average of how often the song was played recently. Under 1 means OK to use again without being too repetitive."
                        @click=${() => this.toggleSort("playedDisplay")}
                      >
                        Played ${this.sortIndicator("playedDisplay")}
                      </th>
                      <th
                        class="sortable"
                        title="Category tags for this song: words or phrases separated by semicolons (e.g. Christmas; Patriotic; Plus)."
                        @click=${() => this.toggleSort("categories")}
                      >
                        Categories ${this.sortIndicator("categories")}
                      </th>
                      <th
                        class="sortable order-col-head"
                        title="The order that the song was added to the database of songs. Recent songs have high numbers."
                        @click=${() => this.toggleSort("orderAdded")}
                      >
                        Order ${this.sortIndicator("orderAdded")}
                      </th>
                      <th
                        class="sortable"
                        title="Publisher label and catalog number from the filename (e.g. RYL 607)."
                        @click=${() => this.toggleSort("label")}
                      >
                        Label ${this.sortIndicator("label")}
                      </th>
                      <th
                        class="sortable"
                        title="Singing call (has lyrics) or patter (no lyrics file)."
                        @click=${() => this.toggleSort("type")}
                      >
                        Type ${this.sortIndicator("type")}
                      </th>
                      <th class="more-cell" title="More actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${this.renderFolderRows()}
                    ${songs.map(
                      (song) => html`
                        <tr
                          draggable="true"
                          data-song-key=${this.songKey(song)}
                          aria-selected=${this.songKey(song) === this.keyboardShortcutSongKey}
                          class=${this.songKey(song) === this.keyboardShortcutSongKey
                            ? "song-row-selected"
                            : ""}
                          @mousedown=${() => this.onSongRowShortcutAnchor(song)}
                          @dragstart=${(e: DragEvent) => this.onSongDragStart(e, song)}
                          @dragend=${this.onEditorDragEnd}
                          @contextmenu=${(e: MouseEvent) => this.onRowContextMenu(e, { kind: "song", song })}
                          @dblclick=${() => void this.addToPlaylist(song)}
                          title="Drag to playlist, double-click, or use ⋮ for more options"
                        >
                          <td class="play-cell">
                            <button
                              class="icon-btn"
                              title="Play now (P)"
                              @click=${() => this.playSongNow(song)}
                            >▶</button>
                          </td>
                          <td class="add-cell">
                            <button
                              class="icon-btn add-btn"
                              title="Add to playlist (+)"
                              @click=${() => void this.addToPlaylist(song)}
                            >+</button>
                          </td>
                          <td class="title-cell">
                            <span class="title-ellipsis" title=${song.title}>${song.title}</span>
                          </td>
                          ${this.renderRankCell(song)}
                          <td
                            class="last-cell"
                            title="Days since this song was last counted as played (practice sessions do not count)."
                          >
                            ${this.formatLastUsedDays(song)}
                          </td>
                          <td
                            class="played-cell"
                            title="Weighted average of how often the song was played recently. Under 1 means OK to use again without being too repetitive."
                          >
                            ${this.formatPlayedDisplay(song)}
                          </td>
                          ${this.renderCategoriesCell(song)}
                          <td
                            class="order-cell"
                            title="The order that the song was added to the database of songs. Recent songs have high numbers."
                          >
                            ${song.orderAdded}
                          </td>
                          <td class="label-cell">${song.label}</td>
                          <td class="type-cell">
                            <span
                              class="${isSingingCall(song) ? "singing" : "patter"}"
                              title="${isSingingCall(song) ? "Singing call" : "Patter (no lyrics)"}"
                            >${isSingingCall(song) ? "Singing" : "Patter"}</span>
                          </td>
                          <td class="more-cell">
                            <button
                              class="icon-btn more-btn"
                              title="More actions"
                              aria-label="More actions for ${song.title}"
                              @click=${(e: MouseEvent) =>
                                this.onMoreMenuClick(e, { kind: "song", song })}
                            >⋮</button>
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
                ${!this.folderLoadError &&
                songs.length === 0 &&
                this.subfolders.length === 0
                  ? html`<p class="muted table-empty">
                      ${this.filterText
                        ? "No songs match the filter."
                        : "No songs found. Make sure your CallerBuddy folder contains MP3 audio files."}
                    </p>`
                  : nothing}
              `}
            </div>
          </div>
        </section>

        <!-- Context menu -->
        ${this.renderContextMenu()}
        ${this.renderDeleteConfirm()}
        ${this.renderRenameDialog()}
        ${this.renderCreateFolderDialog()}
        ${this.renderGettingStartedHint()}
      </div>
    `;
  }

  // -- Breadcrumb -----------------------------------------------------------

  private renderBreadcrumb() {
    if (this.handleStack.length <= 1) return nothing;

    return html`
      <nav class="breadcrumb" aria-label="Folder navigation">
        ${this.handleStack.map(
          (handle, i) => html`
            ${i > 0 ? html`<span class="breadcrumb-sep">›</span>` : nothing}
            ${i < this.handleStack.length - 1
              ? html`<button
                  class="breadcrumb-link"
                  @click=${() => this.navigateTo(i)}
                  title="Navigate to ${handle.name}"
                >${handle.name}</button>`
              : html`<span class="breadcrumb-current">${handle.name}</span>`}
          `,
        )}
      </nav>
    `;
  }

  // -- Folder rows ----------------------------------------------------------

  private renderFolderRows() {
    if (this.subfolders.length === 0) return nothing;

    return this.subfolders.map(
      (entry) => html`
        <tr
          class="folder-row"
          @click=${() => this.openFolderInNewTabFromCtx(entry.name)}
          @contextmenu=${(e: MouseEvent) => this.onRowContextMenu(e, { kind: "folder", entry })}
          title="Click to open in new tab, or use ⋮ for options"
        >
          <td class="folder-icon-cell" colspan="2">📁</td>
          <td colspan="8" class="folder-name">${entry.name}</td>
          <td class="more-cell">
            <button
              class="icon-btn more-btn"
              title="More actions"
              aria-label="More actions for folder ${entry.name}"
              @click=${(e: MouseEvent) =>
                this.onMoreMenuClick(e, { kind: "folder", entry })}
            >⋮</button>
          </td>
        </tr>
      `,
    );
  }

  // -- Context menu ---------------------------------------------------------

  private renderContextMenu() {
    if (!this.contextTarget) return nothing;

    if (this.contextTarget.kind === "song") {
      return html`
        <div
          class="context-menu"
          style="left:${this.contextMenuPos.x}px; top:${this.contextMenuPos.y}px"
          role="menu"
        >
          <button class="menu-item" role="menuitem"
            @click=${() => this.addToPlaylistFromCtx("end")}
          >Add to end of playlist</button>
          <button class="menu-item" role="menuitem"
            @click=${() => this.addToPlaylistFromCtx("start")}
          >Add to start of playlist</button>
          <hr />
          <button class="menu-item" role="menuitem"
            @click=${() => this.playSongFromCtx()}
          >Play now</button>
          <hr />
          <button class="menu-item" role="menuitem"
            @click=${() => this.requestRenameSongFromCtx()}
          >Rename…</button>
          <button class="menu-item menu-item-danger" role="menuitem"
            @click=${() => this.requestDeleteSongFromCtx()}
          >Delete song…</button>
        </div>
      `;
    }

    // Folder context menu
    const folderName = this.contextTarget.entry.name;
    return html`
      <div
        class="context-menu"
        style="left:${this.contextMenuPos.x}px; top:${this.contextMenuPos.y}px"
        role="menu"
      >
        <button class="menu-item" role="menuitem"
          @click=${() => this.openFolderInNewTabFromCtx(folderName)}
        >Open in new tab</button>
      </div>
    `;
  }

  private onRowContextMenu(e: MouseEvent, target: ContextTarget) {
    e.preventDefault();
    e.stopPropagation();
    this.contextTarget = target;
    this.contextMenuPos = { x: e.clientX, y: e.clientY };
  }

  /** Open the same context menu from the row's ⋮ button (mobile-friendly). */
  private onMoreMenuClick(e: MouseEvent, target: ContextTarget) {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const menuWidth = 200;
    const x = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    const y = Math.min(rect.bottom + 2, window.innerHeight - 8);
    this.contextTarget = target;
    this.contextMenuPos = { x, y };
  }

  private closeContextMenu() {
    this.contextTarget = null;
  }

  private async openFolderInNewTabFromCtx(folderName: string) {
    this.contextTarget = null;
    const parent = this.currentHandle;
    if (!parent) return;
    try {
      const child = await parent.getDirectoryHandle(folderName);
      await callerBuddy.openFolderTab(child, folderName);
    } catch (err) {
      log.error(`Failed to open subfolder "${folderName}" in new tab:`, err);
    }
  }

  private addToPlaylistFromCtx(position: "start" | "end") {
    if (!this.contextTarget || this.contextTarget.kind !== "song") return;
    const song = this.contextTarget.song;
    if (position === "start") {
      void callerBuddy.insertSongAtStartOfPlaylist(song);
    } else {
      void callerBuddy.addSongToPlaylist(song);
    }
    this.contextTarget = null;
  }

  private async playSongFromCtx() {
    if (!this.contextTarget || this.contextTarget.kind !== "song") return;
    const song = this.contextTarget.song;
    this.contextTarget = null;
    await this.playSongNow(song);
  }

  private requestDeleteSongFromCtx() {
    if (!this.contextTarget || this.contextTarget.kind !== "song") return;
    this.deleteConfirmSong = this.contextTarget.song;
    this.contextTarget = null;
  }

  private requestRenameSongFromCtx() {
    if (!this.contextTarget || this.contextTarget.kind !== "song") return;
    const song = this.contextTarget.song;
    this.contextTarget = null;
    this.renameSongTarget = song;
    this.renameLabel = song.label;
    this.renameTitle = song.title;
    this.renameConflictName = null;
    this.renameInProgress = false;
    this.renameFolders = [];
    this.renameDestRelPath = "";
    this.renameFoldersLoading = true;
    void this.loadRenameFolders();
  }

  private async loadRenameFolders() {
    try {
      const folders = await callerBuddy.listPlaylistFolders();
      if (!this.renameSongTarget) return;
      this.renameFolders = folders;
      const current = this.currentHandle;
      let dest = "";
      if (current) {
        for (const folder of folders) {
          if (await isSameDirectory(folder.handle, current)) {
            dest = folder.relPath;
            break;
          }
        }
      }
      this.renameDestRelPath = dest;
    } catch (err) {
      log.warn("playlist-editor: could not list folders for rename:", err);
      if (this.renameSongTarget) this.renameFolders = [];
    } finally {
      this.renameFoldersLoading = false;
    }
  }

  private cancelRenameSong() {
    if (this.renameInProgress) return;
    this.renameSongTarget = null;
    this.renameConflictName = null;
    this.renameFolders = [];
    this.renameDestRelPath = "";
  }

  private async submitRenameSong(e?: Event) {
    e?.preventDefault();
    const song = this.renameSongTarget;
    if (!song || this.renameInProgress) return;
    this.renameInProgress = true;
    this.renameConflictName = null;
    try {
      const dest =
        this.renameFolders.find((f) => f.relPath === this.renameDestRelPath)
          ?.handle ?? this.currentHandle;
      const result = await callerBuddy.renameSong(
        song,
        this.renameLabel,
        this.renameTitle,
        dest,
      );
      if (!result.ok) {
        this.renameConflictName = result.conflictName;
        return;
      }
      this.renameSongTarget = null;
      this.renameFolders = [];
      this.renameDestRelPath = "";
    } catch (err) {
      log.error(`Failed to rename song "${song.title}":`, err);
      window.alert(
        err instanceof Error
          ? err.message
          : "Could not rename the song. Check folder permissions and try again.",
      );
    } finally {
      this.renameInProgress = false;
    }
  }

  private renameFolderLabel(folder: FolderRef): string {
    if (folder.relPath) return folder.relPath;
    return callerBuddy.state.rootHandle?.name ?? folder.handle.name;
  }

  private renderGettingStartedHint() {
    if (!this.showGettingStartedHint) return nothing;

    return html`
      <div
        class="getting-started-overlay cb-modal-overlay"
        @click=${() => this.dismissGettingStartedHint()}
      >
        <div
          class="getting-started-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="getting-started-title"
          @click=${(e: Event) => e.stopPropagation()}
        >
          <h2 id="getting-started-title" class="getting-started-title">
            Getting started
          </h2>
          <p class="getting-started-body">
            To get started, click the <strong>+</strong> on songs to add them
            to the playlist and click the <strong>Play</strong> button (or &lt;Enter&gt;) to play
            the playlist you created.  
          </p>
          <p> 
            Clicking the ▶ button will play the song immediately.  
          </p>
          <p>
            Click the
            <span class="getting-started-help-glyph" aria-hidden="true">?</span>
            button for help for this view.
          </p>
          <div class="getting-started-actions">
            <button
              type="button"
              class="getting-started-primary"
              @click=${() => this.dismissGettingStartedHint()}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderRenameDialog() {
    const song = this.renameSongTarget;
    if (!song) return nothing;

    return html`
      <div
        class="rename-dialog-overlay cb-modal-overlay"
        @click=${(e: MouseEvent) => {
          if (e.target !== e.currentTarget) return;
          this.cancelRenameSong();
        }}
      >
        <div
          class="rename-dialog-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-song-title"
          @click=${(e: Event) => e.stopPropagation()}
        >
          <h2 id="rename-song-title" class="rename-dialog-title">Rename song</h2>
          ${this.renameConflictName
            ? html`<p class="rename-dialog-conflict" role="alert">
                A file named <strong>${this.renameConflictName}</strong> already
                exists in the selected folder. Choose a different label, title,
                or folder.
              </p>`
            : html`<p class="rename-dialog-body">
                Edit the label and title, and optionally move the song to
                another folder. The audio file
                ${song.lyricsFile ? "and lyrics file " : ""}will be renamed to
                match.
              </p>`}
          <form
            class="rename-dialog-form"
            @submit=${(e: Event) => void this.submitRenameSong(e)}
          >
            <label class="rename-field">
              <span>Label</span>
              <input
                type="text"
                name="label"
                .value=${this.renameLabel}
                ?disabled=${this.renameInProgress}
                autofocus
                @input=${(e: Event) => {
                  this.renameLabel = (e.target as HTMLInputElement).value;
                  this.renameConflictName = null;
                }}
              />
            </label>
            <label class="rename-field">
              <span>Title</span>
              <input
                type="text"
                name="title"
                .value=${this.renameTitle}
                ?disabled=${this.renameInProgress}
                @input=${(e: Event) => {
                  this.renameTitle = (e.target as HTMLInputElement).value;
                  this.renameConflictName = null;
                }}
              />
            </label>
            <label class="rename-field">
              <span>Folder</span>
              <select
                name="folder"
                .value=${this.renameDestRelPath}
                ?disabled=${this.renameInProgress || this.renameFoldersLoading}
                @change=${(e: Event) => {
                  this.renameDestRelPath = (e.target as HTMLSelectElement).value;
                  this.renameConflictName = null;
                }}
              >
                ${this.renameFoldersLoading
                  ? html`<option value=${this.renameDestRelPath}>Loading folders…</option>`
                  : this.renameFolders.map(
                      (folder) => html`
                        <option
                          value=${folder.relPath}
                          ?selected=${folder.relPath === this.renameDestRelPath}
                        >
                          ${this.renameFolderLabel(folder)}
                        </option>
                      `,
                    )}
              </select>
            </label>
            <div class="rename-dialog-actions">
              <button
                type="submit"
                class="rename-dialog-primary"
                ?disabled=${this.renameInProgress}
              >
                ${this.renameInProgress ? "Renaming…" : "Rename"}
              </button>
              <button
                type="button"
                class="rename-dialog-secondary"
                ?disabled=${this.renameInProgress}
                @click=${() => this.cancelRenameSong()}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  /** Opened from the app-shell "Create Folder…" menu item. */
  openCreateFolderDialog() {
    this.createFolderName = "";
    this.createFolderError = "";
    this.createFolderInProgress = false;
    this.createFolderOpen = true;
  }

  private cancelCreateFolder() {
    if (this.createFolderInProgress) return;
    this.createFolderOpen = false;
    this.createFolderName = "";
    this.createFolderError = "";
  }

  private async submitCreateFolder(e?: Event) {
    e?.preventDefault();
    if (this.createFolderInProgress) return;
    const parent = this.currentHandle;
    if (!parent) {
      this.createFolderError = "No folder is available to create in.";
      return;
    }
    this.createFolderInProgress = true;
    this.createFolderError = "";
    try {
      const result = await callerBuddy.createPlaylistSubfolder(
        parent,
        this.createFolderName,
      );
      if (!result.ok) {
        this.createFolderError =
          result.reason === "conflict"
            ? "A folder or file with that name already exists."
            : "Enter a folder name.";
        return;
      }
      this.createFolderOpen = false;
      this.createFolderName = "";
      await this.refreshSubfolders();
    } catch (err) {
      log.error("Failed to create folder:", err);
      this.createFolderError =
        err instanceof Error
          ? err.message
          : "Could not create the folder. Check folder permissions and try again.";
    } finally {
      this.createFolderInProgress = false;
    }
  }

  private renderCreateFolderDialog() {
    if (!this.createFolderOpen) return nothing;
    const parentName = this.currentHandle?.name ?? "this folder";

    return html`
      <div
        class="rename-dialog-overlay cb-modal-overlay"
        @click=${(e: MouseEvent) => {
          if (e.target !== e.currentTarget) return;
          this.cancelCreateFolder();
        }}
      >
        <div
          class="rename-dialog-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-folder-title"
          @click=${(e: Event) => e.stopPropagation()}
        >
          <h2 id="create-folder-title" class="rename-dialog-title">Create folder</h2>
          ${this.createFolderError
            ? html`<p class="rename-dialog-conflict" role="alert">
                ${this.createFolderError}
              </p>`
            : html`<p class="rename-dialog-body">
                New subfolder in <strong>${parentName}</strong>.
              </p>`}
          <form
            class="rename-dialog-form"
            @submit=${(e: Event) => void this.submitCreateFolder(e)}
          >
            <label class="rename-field">
              <span>Name</span>
              <input
                type="text"
                name="folderName"
                .value=${this.createFolderName}
                ?disabled=${this.createFolderInProgress}
                autofocus
                @input=${(e: Event) => {
                  this.createFolderName = (e.target as HTMLInputElement).value;
                  this.createFolderError = "";
                }}
              />
            </label>
            <div class="rename-dialog-actions">
              <button
                type="submit"
                class="rename-dialog-primary"
                ?disabled=${this.createFolderInProgress}
              >
                ${this.createFolderInProgress ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                class="rename-dialog-secondary"
                ?disabled=${this.createFolderInProgress}
                @click=${() => this.cancelCreateFolder()}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  private cancelDeleteSong() {
    if (this.deleteInProgress) return;
    this.deleteConfirmSong = null;
  }

  private async confirmDeleteSong() {
    const song = this.deleteConfirmSong;
    if (!song || this.deleteInProgress) return;
    this.deleteInProgress = true;
    try {
      await callerBuddy.deleteSong(song);
      this.deleteConfirmSong = null;
    } catch (err) {
      log.error(`Failed to delete song "${song.title}":`, err);
      window.alert(
        err instanceof Error
          ? err.message
          : "Could not delete the song. Check folder permissions and try again.",
      );
    } finally {
      this.deleteInProgress = false;
    }
  }

  private renderDeleteConfirm() {
    const song = this.deleteConfirmSong;
    if (!song) return nothing;

    const hasLyrics = Boolean(song.lyricsFile.trim());
    return html`
      <div
        class="delete-confirm-overlay cb-modal-overlay"
        @click=${(e: MouseEvent) => {
          if (e.target !== e.currentTarget) return;
          this.cancelDeleteSong();
        }}
      >
        <div
          class="delete-confirm-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-song-title"
          @click=${(e: Event) => e.stopPropagation()}
        >
          <h2 id="delete-song-title" class="delete-confirm-title">Delete song?</h2>
          <p class="delete-confirm-body">
            Permanently delete <strong>${song.title}</strong>?
            This removes the audio file${hasLyrics ? " and lyrics file" : ""}
            and its entry from CallerBuddySongs.json. This cannot be undone.
          </p>
          <div class="delete-confirm-actions">
            <button
              type="button"
              class="delete-confirm-danger"
              ?disabled=${this.deleteInProgress}
              @click=${() => void this.confirmDeleteSong()}
            >
              ${this.deleteInProgress ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              class="delete-confirm-secondary"
              ?disabled=${this.deleteInProgress}
              @click=${() => this.cancelDeleteSong()}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // -- Inline cell editing (categories / rank) ------------------------------

  private songKey(song: Song): string {
    return song.musicFile.toLowerCase();
  }

  private formatLastUsedDays(song: Song): string {
    if (!song.lastUsed.trim()) return "—";
    const days = daysSinceLastUsedMs(song.lastUsed, Date.now());
    const floored = Number.isFinite(days) ? Math.floor(days) : 0;
    return String(floored);
  }

  private formatPlayedDisplay(song: Song): string {
    const nowMs = Date.now();
    const v = displayPlayWeight(song.playWeight, song.lastUsed, nowMs);
    return (Number.isFinite(v) ? v : 0).toFixed(2);
  }

  private isCellEditing(song: Song, field: "categories" | "rank"): boolean {
    return (
      this.editingCell !== null &&
      this.editingCell.key === this.songKey(song) &&
      this.editingCell.field === field
    );
  }

  private commitCategoriesDraft(song: Song, draft: string) {
    if (draft === song.categories) return;
    song.categories = draft;
    void callerBuddy.updateSong(song);
  }

  private commitRankDraft(song: Song, draft: string) {
    const raw = draft.trim();
    if (raw === "") return;
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 100) return;
    if (n === song.rank) return;
    song.rank = n;
    void callerBuddy.updateSong(song);
  }

  private commitPendingCellEdit() {
    if (!this.editingCell) return;
    const { key, field, draft } = this.editingCell;
    const song = this.localSongs.find((s) => this.songKey(s) === key);
    this.editingCell = null;
    if (!song) return;
    if (field === "categories") this.commitCategoriesDraft(song, draft);
    else this.commitRankDraft(song, draft);
  }

  private startCellEdit(song: Song, field: "categories" | "rank", e: Event) {
    e.stopPropagation();
    if (
      this.editingCell &&
      (this.editingCell.key !== this.songKey(song) || this.editingCell.field !== field)
    ) {
      this.commitPendingCellEdit();
    }
    if (this.isCellEditing(song, field)) return;
    const draft = field === "categories" ? song.categories : String(song.rank);
    this.editingCell = { key: this.songKey(song), field, draft };
  }

  private onCellDraftInput(e: Event) {
    if (!this.editingCell) return;
    this.editingCell = {
      ...this.editingCell,
      draft: (e.target as HTMLInputElement).value,
    };
  }

  private onEditableCellBlur(song: Song) {
    if (this.skipNextBlurCommit) {
      this.skipNextBlurCommit = false;
      return;
    }
    if (!this.editingCell || this.editingCell.key !== this.songKey(song)) return;
    const { field, draft } = this.editingCell;
    this.editingCell = null;
    if (field === "categories") this.commitCategoriesDraft(song, draft);
    else this.commitRankDraft(song, draft);
  }

  private onCellEditKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.skipNextBlurCommit = true;
      this.editingCell = null;
      this.requestUpdate();
    }
  }

  private renderCategoriesCell(song: Song) {
    if (this.isCellEditing(song, "categories")) {
      const draft = this.editingCell!.draft;
      return html`
        <td class="categories-cell editing" @click=${(ev: Event) => ev.stopPropagation()}>
          <input
            type="text"
            class="cell-input"
            .value=${draft}
            @input=${this.onCellDraftInput}
            @blur=${() => this.onEditableCellBlur(song)}
            @keydown=${this.onCellEditKeydown}
            title="Category tags: words or phrases separated by semicolons"
          />
        </td>
      `;
    }
    return html`
      <td
        class="categories-cell"
        title="Click to edit. Tags separated by semicolons (e.g. Christmas; Patriotic)."
        @click=${(ev: MouseEvent) => this.startCellEdit(song, "categories", ev)}
      >
        ${song.categories}
      </td>
    `;
  }

  private renderRankCell(song: Song) {
    if (this.isCellEditing(song, "rank")) {
      const draft = this.editingCell!.draft;
      return html`
        <td class="rank-cell editing" @click=${(ev: Event) => ev.stopPropagation()}>
          <input
            type="text"
            class="cell-input cell-input-rank"
            .value=${draft}
            @input=${this.onCellDraftInput}
            @blur=${() => this.onEditableCellBlur(song)}
            @keydown=${this.onCellEditKeydown}
            title="Rank 0–100 (integer). Lower can mean higher priority in your workflow."
          />
        </td>
      `;
    }
    return html`
      <td
        class="rank-cell"
        title="Click to edit rank (0–100)."
        @click=${(ev: MouseEvent) => this.startCellEdit(song, "rank", ev)}
      >
        ${song.rank}
      </td>
    `;
  }

  // -- Drag and drop --------------------------------------------------------

  private onSongDragStart(e: DragEvent, song: Song) {
    const el = e.target as HTMLElement | null;
    if (el?.closest(".categories-cell, .rank-cell")) {
      e.preventDefault();
      return;
    }
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("application/x-callerbuddy-song", "1");
    e.dataTransfer.effectAllowed = "copy";
    this.draggedSong = song;
  }

  private onEditorDragEnd = () => {
    this.reorder.onDragEnd();
    this.draggedSong = null;
  };

  private onEmptyPlaylistDrop(e: DragEvent) {
    e.preventDefault();

    if (this.draggedSong) {
      void callerBuddy.addSongToPlaylist(this.draggedSong);
      this.draggedSong = null;
    }

    this.reorder.onDragEnd();
  }

  // -- Filtering and sorting ------------------------------------------------

  private getFilteredSongs(): Song[] {
    let songs = [...this.localSongs];

    if (this.filterText) {
      songs = songs.filter((s) =>
        songMatchesTextFilter(
          {
            title: s.title,
            label: s.label,
            categories: s.categories,
            type: isSingingCall(s) ? "Singing" : "Patter",
          },
          this.filterText,
        ),
      );
    }

    const rankRaw = this.rankFilterInput.trim();
    if (rankRaw !== "") {
      const threshold = Number(rankRaw);
      if (Number.isFinite(threshold)) {
        if (this.rankCompareGte) {
          songs = songs.filter((s) => s.rank >= threshold);
        } else {
          songs = songs.filter((s) => s.rank < threshold);
        }
      }
    }

    const nowMs = Date.now();
    const getKey = (s: Song, field: SortField): string | number => {
      switch (field) {
        case "lastUsedDays": {
          return s.lastUsed.trim()
            ? daysSinceLastUsedMs(s.lastUsed, nowMs)
            : Number.POSITIVE_INFINITY;
        }
        case "playedDisplay": {
          return displayPlayWeight(s.playWeight, s.lastUsed, nowMs);
        }
        case "type": {
          return isSingingCall(s) ? "Singing" : "Patter";
        }
        default: {
          return s[field as keyof Song] as unknown as string | number;
        }
      }
    };

    const cmpKey = (a: Song, b: Song, field: SortField): number => {
      const aVal = getKey(a, field);
      const bVal = getKey(b, field);
      if (typeof aVal === "string" && typeof bVal === "string") {
        return aVal.localeCompare(bVal, undefined, { sensitivity: "base" });
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        // Handle NaN consistently (push NaNs to the bottom in asc, top in desc via dir multiplier).
        const aNum = Number.isFinite(aVal) ? aVal : Number.POSITIVE_INFINITY;
        const bNum = Number.isFinite(bVal) ? bVal : Number.POSITIVE_INFINITY;
        if (aNum === bNum) return 0;
        return aNum - bNum;
      }
      return String(aVal).localeCompare(String(bVal), undefined, { sensitivity: "base" });
    };

    // Stable sort: decorate with original index and use it as the final tie-breaker.
    const decorated = songs.map((song, idx) => ({ song, idx }));
    decorated.sort((aa, bb) => {
      for (const { field, dir } of this.sortKeys) {
        const dirMul = dir === "asc" ? 1 : -1;
        const c = cmpKey(aa.song, bb.song, field);
        if (c !== 0) return dirMul * c;
      }
      return aa.idx - bb.idx;
    });
    songs = decorated.map((d) => d.song);

    return songs;
  }

  private toggleSort(field: SortField) {
    const idx = this.sortKeys.findIndex((k) => k.field === field);
    const defaultDir: SortDir = field === "rank" ? "desc" : "asc";

    if (idx === 0) {
      // Toggle direction of the primary key.
      const cur = this.sortKeys[0];
      this.sortKeys = [{ field, dir: cur.dir === "asc" ? "desc" : "asc" }, ...this.sortKeys.slice(1)];
      this.persistBrowserViewImmediate();
      return;
    }

    if (idx > 0) {
      // Promote existing key to primary (preserve its direction).
      const promoted = this.sortKeys[idx];
      this.sortKeys = [promoted, ...this.sortKeys.slice(0, idx), ...this.sortKeys.slice(idx + 1)];
      this.persistBrowserViewImmediate();
      return;
    }

    // Add new primary key.
    this.sortKeys = [{ field, dir: defaultDir }, ...this.sortKeys];
    this.persistBrowserViewImmediate();
  }

  private sortIndicator(field: SortField): string {
    const idx = this.sortKeys.findIndex((k) => k.field === field);
    if (idx < 0) return "";
    const arrow = this.sortKeys[idx].dir === "asc" ? " ▲" : " ▼";
    // Show order for secondary+ keys (e.g. ▲2) so the UI reflects stable multi-sorts.
    return idx === 0 ? arrow : `${arrow}${idx + 1}`;
  }

  /** Consume Enter inside the filter so it doesn't bubble up to the
   *  page-level keydown handler (which would start playback). */
  private onFilterKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") e.stopPropagation();
    if (e.key === "Escape") {
      const t = e.target as HTMLInputElement;
      if (t.classList.contains("filter-input") && this.filterText) {
        e.preventDefault();
        e.stopPropagation();
        this.filterText = "";
        this.persistBrowserViewImmediate();
        queueMicrotask(() => this.focusSongTable());
      }
    }
  }

  private onFilterInput(e: Event) {
    this.filterText = (e.target as HTMLInputElement).value;
    this.schedulePersistBrowserView();
  }

  private onClearFilter(e: MouseEvent) {
    e.stopPropagation();
    this.filterText = "";
    this.persistBrowserViewImmediate();
  }

  private onRankCompareToggle(e: MouseEvent) {
    e.stopPropagation();
    this.rankCompareGte = !this.rankCompareGte;
    this.persistBrowserViewImmediate();
  }

  private onRankFilterInput(e: Event) {
    this.rankFilterInput = (e.target as HTMLInputElement).value;
    this.schedulePersistBrowserView();
  }

  private snapshotBrowserView(): PlaylistEditorViewSettings {
    return {
      filterText: this.filterText,
      rankFilterInput: this.rankFilterInput,
      rankCompareGte: this.rankCompareGte,
      sortKeys: this.sortKeys.map((k) => ({ ...k })),
    };
  }

  private applyBrowserViewFromSettings() {
    const view =
      callerBuddy.state.settings.playlistEditorView ?? defaultPlaylistEditorView();
    this.filterText = view.filterText;
    this.rankFilterInput = view.rankFilterInput;
    this.rankCompareGte = view.rankCompareGte;
    this.sortKeys = view.sortKeys.map((k) => ({ ...k }));
  }

  private isBrowserViewAtDefault(): boolean {
    return (
      JSON.stringify(this.snapshotBrowserView()) ===
      JSON.stringify(defaultPlaylistEditorView())
    );
  }

  private schedulePersistBrowserView() {
    if (this.persistViewTimer !== null) clearTimeout(this.persistViewTimer);
    this.persistViewTimer = setTimeout(() => {
      this.persistViewTimer = null;
      void this.persistBrowserView();
    }, 300);
  }

  private persistBrowserViewImmediate() {
    if (this.persistViewTimer !== null) {
      clearTimeout(this.persistViewTimer);
      this.persistViewTimer = null;
    }
    void this.persistBrowserView();
  }

  private async persistBrowserView() {
    const view = this.snapshotBrowserView();
    const current = callerBuddy.state.settings.playlistEditorView;
    if (current && JSON.stringify(current) === JSON.stringify(view)) return;
    await callerBuddy.persistSettingsPatch({ playlistEditorView: view });
  }

  private onResetBrowserView(e: MouseEvent) {
    e.stopPropagation();
    const defaults = defaultPlaylistEditorView();
    this.filterText = defaults.filterText;
    this.rankFilterInput = defaults.rankFilterInput;
    this.rankCompareGte = defaults.rankCompareGte;
    this.sortKeys = defaults.sortKeys;
    this.persistBrowserViewImmediate();
  }

  // -- Playlist operations --------------------------------------------------

  private async addToPlaylist(song: Song) {
    await callerBuddy.addSongToPlaylist(song);
  }

  /**
   * Single-song workflow shortcut: add to playlist and immediately play.
   * See CallerBuddySpec.md §"Single song Workflow".
   */
  private async playSongNow(song: Song) {
    await callerBuddy.addSongToPlaylist(song);
    callerBuddy.openPlaylistPlay();
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "wait";
    try {
      await callerBuddy.openSongPlay(song, { closeNowPlayingWhenDone: true });
    } finally {
      document.body.style.cursor = prevCursor;
    }
  }

  private onPlayPlaylist() {
    callerBuddy.openPlaylistPlay();
  }

  private onClearPlaylist() {
    callerBuddy.state.clearPlaylistWithBackup();
  }

  private onRestorePlaylist() {
    callerBuddy.state.restoreClearedPlaylist();
  }

  /** Open the Help tab (as a singleton) scrolled to a section; Help's Back button / ArrowLeft returns here. */
  private openHelpSection(sectionId: string) {
    callerBuddy.state.openSingletonTab(TabType.Help, "Help", true, { sectionId });
  }

  static styles = [
    ctxHelpBtnStyles,
    modalOverlayStyles,
    chromeButtonStyles,
    css`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
      /* Viewport aspect MQs see bogus 980×2053 on Samsung WebAPK; use host box. */
      container-type: size;
      container-name: cb-playlist-editor;
    }

    .editor {
      display: flex;
      height: 100%;
      min-height: 0;
      position: relative;
    }

    /* -- Playlist panel ---------------------------------------------------- */

    .playlist-panel {
      min-width: 180px;
      flex-shrink: 0;
      border-right: none;
      display: flex;
      flex-direction: column;
      padding: 12px;
      background: var(--cb-panel-bg);
    }

    .resizer {
      width: 6px;
      flex-shrink: 0;
      cursor: col-resize;
      background: transparent;
      border-left: 1px solid var(--cb-border);
      touch-action: none;
    }

    .resizer:hover {
      background: color-mix(in srgb, var(--cb-accent) 15%, transparent);
    }

    .panel-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin: 0 0 8px;
    }

    .playlist-panel h2 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }

    .playlist-body {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .playlist-list {
      flex: 0 1 auto;
      overflow-y: auto;
      min-height: 0;
      margin: 0;
      padding: 0 0 0 4px;
      list-style-position: inside;
    }

    .playlist-shortcut-hint {
      flex: 1 1 0;
      min-height: 0;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    .playlist-shortcut-hint .muted {
      margin: 0;
      padding: 8px;
      text-align: center;
    }

    .playlist-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 4px;
      font-size: 0.85rem;
      border-radius: 4px;
    }

    .playlist-item:hover {
      background: var(--cb-hover);
    }

    .playlist-item[draggable="true"] {
      cursor: grab;
    }

    .playlist-item.dragging {
      opacity: 0.4;
    }

    .playlist-item.drop-indicator-above {
      box-shadow: inset 0 2px 0 0 var(--cb-accent);
    }

    .playlist-item.drop-indicator-below {
      box-shadow: inset 0 -2px 0 0 var(--cb-accent);
    }

    .empty-playlist-drop {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px dashed var(--cb-border);
      border-radius: 8px;
      margin: 4px 0;
      min-height: 60px;
      transition: border-color 0.15s, background 0.15s;
    }

    .empty-playlist-drop:hover,
    .empty-playlist-drop.drag-hover {
      border-color: var(--cb-accent);
      background: color-mix(in srgb, var(--cb-accent) 8%, transparent);
    }

    .song-table tbody tr[draggable="true"] {
      cursor: grab;
    }

    .pl-type {
      font-size: 0.9rem;
      width: 1.125rem;
      text-align: center;
      flex-shrink: 0;
    }

    .pl-type.singing {
      color: var(--cb-singing);
    }

    .pl-type.patter {
      color: var(--cb-patter);
    }

    .pl-title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .playlist-actions {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }

    .action-error {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 8px 0 0;
      padding: 8px 10px;
      font-size: 0.85rem;
      line-height: 1.35;
      color: var(--cb-error);
      background: var(--cb-error-light);
      border-radius: 6px;
    }

    .action-error .icon-btn {
      flex-shrink: 0;
      margin-left: auto;
      background: none;
      border: none;
      color: var(--cb-error);
      font-size: 1rem;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
    }

    .playlist-actions .primary,
    .playlist-actions .secondary {
      padding: 4px 10px;
      font-size: 0.9rem;
      min-width: 4.5em;
      box-sizing: border-box;
    }

    /* -- Breadcrumb -------------------------------------------------------- */

    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      font-size: 0.8rem;
      border-bottom: 1px solid var(--cb-border);
      background: var(--cb-panel-bg);
      flex-wrap: wrap;
    }

    .breadcrumb-link {
      background: none;
      border: none;
      color: var(--cb-accent);
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 0.8rem;
    }

    .breadcrumb-link:hover {
      background: var(--cb-hover);
      text-decoration: underline;
    }

    .breadcrumb-current {
      font-weight: 600;
      padding: 2px 4px;
    }

    .breadcrumb-sep {
      color: var(--cb-fg-tertiary);
    }

    /* -- Song browser panel ------------------------------------------------ */

    .browser-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }

    .browser-content-scroll {
      flex: 1;
      min-height: 0;
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }

    .browser-toolbar {
      padding: 8px 12px;
      border-bottom: 1px solid var(--cb-border);
      background: var(--cb-panel-bg);
    }

    .browser-toolbar-track {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: nowrap;
      width: 100%;
      min-width: 0;
    }

    .filter-cluster {
      flex: 1 1 0;
      display: flex;
      align-items: center;
      gap: 2px;
      min-width: 0;
    }

    .filter-wrap {
      flex: 1 1 0;
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
    }

    .filter-clear {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.75rem;
      height: 1.75rem;
      padding: 0;
      border: 1px solid var(--cb-btn-border);
      border-radius: 6px;
      background: var(--cb-btn-bg);
      color: var(--cb-fg-secondary);
      font-size: 1.15rem;
      line-height: 1;
      cursor: pointer;
    }

    .filter-clear:hover {
      color: var(--cb-fg);
      background: var(--cb-btn-bg-hover);
    }

    .view-reset-btn {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      margin: 0;
      padding: 0;
      border: 1px solid var(--cb-btn-border);
      border-radius: 4px;
      background: var(--cb-btn-bg);
      color: var(--cb-fg-secondary);
      font-size: 0.85rem;
      line-height: 1;
      cursor: pointer;
    }

    .view-reset-btn:hover:not(:disabled) {
      color: var(--cb-fg);
      background: var(--cb-btn-bg-hover);
    }

    .view-reset-btn:disabled {
      opacity: 0.4;
      cursor: default;
    }

    .filter-input {
      flex: 1;
      min-width: 0;
      padding: 6px 10px;
      border: 1px solid var(--cb-border);
      border-radius: 6px;
      background: var(--cb-input-bg);
      color: var(--cb-fg);
      font-size: 0.9rem;
      outline: none;
    }

    .filter-input:focus {
      border-color: var(--cb-accent);
    }

    .rank-filter {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
      font-size: 0.85rem;
      border-left: 2px solid var(--cb-fg);
      border-right: 2px solid var(--cb-fg);
      padding-left: 10px;
      padding-right: 10px;
    }

    .rank-filter-label {
      color: var(--cb-fg-secondary);
      white-space: nowrap;
    }

    .rank-filter-compare {
      min-width: 2.5rem;
      padding: 4px 8px;
      border: 1px solid var(--cb-btn-border);
      border-radius: 6px;
      background: var(--cb-btn-bg);
      color: var(--cb-fg);
      font-size: 0.8rem;
      font-variant-numeric: tabular-nums;
      cursor: pointer;
    }

    .rank-filter-compare:hover {
      background: var(--cb-btn-bg-hover);
    }

    .rank-filter-input {
      box-sizing: border-box;
      width: 3.5ch;
      min-width: 2.125rem;
      padding: 5px 4px;
      border: 1px solid var(--cb-border);
      border-radius: 6px;
      background: var(--cb-input-bg);
      color: var(--cb-fg);
      font-size: 0.85rem;
      font-variant-numeric: tabular-nums;
      outline: none;
      appearance: textfield;
      -moz-appearance: textfield;
    }

    .rank-filter-input::-webkit-outer-spin-button,
    .rank-filter-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    .rank-filter-input:focus {
      border-color: var(--cb-accent);
    }

    .song-count {
      flex-shrink: 0;
      font-size: 0.8rem;
      color: var(--cb-fg-secondary);
      white-space: nowrap;
    }

    .table-block {
      padding: 0;
      min-width: min-content;
    }

    .song-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }

    .song-table th,
    .song-table td {
      padding: 5px 10px;
      text-align: left;
      white-space: nowrap;
    }

    .title-ellipsis {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .song-table th {
      position: sticky;
      top: 0;
      background: var(--cb-panel-bg);
      border-bottom: 2px solid var(--cb-border-strong);
      font-weight: 600;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--cb-fg-secondary);
    }

    .sortable {
      cursor: pointer;
      user-select: none;
    }

    .sortable:hover {
      color: var(--cb-accent);
    }

    .song-table tbody tr {
      border-bottom: 1px solid var(--cb-border);
    }

    /* Single selection row: shortcuts (+/=, P), arrow keys, and add/play targets. */
    .song-table tbody tr.song-row-selected {
      background: color-mix(in srgb, var(--cb-accent) 14%, var(--cb-panel-bg));
    }

    .song-table:focus {
      outline: 2px solid var(--cb-accent);
      outline-offset: 2px;
    }

    /* -- Folder rows ------------------------------------------------------- */

    .folder-row {
      cursor: pointer;
    }

    .folder-icon-cell {
      text-align: center;
      font-size: 1rem;
    }

    .folder-name {
      font-weight: 500;
    }

    /* -- Song cells -------------------------------------------------------- */

    .label-cell {
      color: var(--cb-fg-secondary);
      font-family: monospace;
    }

    .rank-cell {
      text-align: center;
      /* Stable width so switching to <input> does not widen the column (auto layout). */
      width: 6ch;
      min-width: 6ch;
      max-width: 6ch;
      box-sizing: border-box;
    }

    /* Play history: compact numeric columns (up to 3-digit day count; played as ##0.00) */
    .song-table td.last-cell {
      text-align: right;
      /* Target ~3 digit integers; min fits en dash when never played */
      width: 3ch;
      min-width: 3ch;
      padding-left: 4px;
      padding-right: 4px;
      font-variant-numeric: tabular-nums;
      box-sizing: border-box;
    }

    .song-table th.last-col-head {
      text-align: right;
      padding-left: 4px;
      padding-right: 4px;
    }

    .song-table td.played-cell {
      text-align: right;
      /* Up to ###.## (two decimals) */
      width: 6ch;
      min-width: 6ch;
      padding-left: 4px;
      padding-right: 4px;
      font-variant-numeric: tabular-nums;
      box-sizing: border-box;
    }

    .song-table th.played-col-head {
      text-align: right;
      padding-left: 4px;
      padding-right: 4px;
    }

    .song-table td.order-cell {
      text-align: right;
      /* Narrow column: up to ~4 digit sequence numbers */
      width: 4ch;
      min-width: 4ch;
      padding-left: 4px;
      padding-right: 4px;
      font-variant-numeric: tabular-nums;
      box-sizing: border-box;
    }

    .song-table th.order-col-head {
      text-align: right;
      padding-left: 4px;
      padding-right: 4px;
    }

    .categories-cell {
      cursor: cell;
      /* Fixed width like .rank-cell so edit mode does not change column size. */
      width: 14rem;
      min-width: 14rem;
      max-width: 14rem;
      box-sizing: border-box;
    }

    .categories-cell:not(.editing) {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .categories-cell.editing {
      overflow: visible;
    }

    .categories-cell.editing,
    .rank-cell.editing {
      /* Match .song-table td padding so the cell box does not shrink/grow when editing. */
      padding: 5px 10px;
      vertical-align: middle;
    }

    .cell-input {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      margin: 0;
      padding: 2px 6px;
      font: inherit;
      line-height: inherit;
      color: inherit;
      background: var(--cb-panel-bg);
      border: 1px solid var(--cb-accent);
      border-radius: 4px;
    }

    .cell-input:focus {
      outline: none;
      box-shadow: 0 0 0 2px var(--cb-accent-muted, var(--cb-accent));
    }

    .cell-input-rank {
      text-align: center;
    }

    .rank-cell:not(.editing) {
      cursor: cell;
    }

    .type-cell .singing {
      color: var(--cb-singing);
    }

    .type-cell .patter {
      color: var(--cb-patter);
    }

    .song-table th.play-cell,
    .song-table td.play-cell {
      width: auto;
      min-width: 2rem;
      text-align: center;
      padding: 5px 2px 5px 4px;
    }

    .song-table th.add-cell,
    .song-table td.add-cell {
      width: auto;
      min-width: 2rem;
      text-align: center;
      padding: 5px 4px 5px 2px;
    }

    .song-table th.more-cell,
    .song-table td.more-cell {
      width: auto;
      min-width: 2rem;
      text-align: center;
      padding: 5px 4px;
    }

    .more-btn {
      font-size: 1.15rem;
      letter-spacing: 0;
      line-height: 1;
      padding: 4px 8px;
    }

    .song-table th.title-col-head,
    .song-table td.title-cell {
      padding-left: 4px;
    }

    .table-empty {
      padding: 2rem;
      text-align: center;
    }

    /* -- Context menu ------------------------------------------------------ */

    .context-menu {
      position: fixed;
      background: var(--cb-menu-bg);
      border: 1px solid var(--cb-border);
      border-radius: 6px;
      box-shadow: 0 4px 16px var(--cb-shadow);
      z-index: 1000;
      min-width: 200px;
      padding: 4px 0;
    }

    .context-menu .menu-item {
      display: block;
      width: 100%;
      padding: 8px 16px;
      text-align: left;
      background: none;
      border: none;
      color: var(--cb-fg);
      font-size: 0.85rem;
      cursor: pointer;
    }

    .context-menu .menu-item:hover {
      background: var(--cb-accent);
      color: var(--cb-fg-on-accent);
    }

    .context-menu .menu-item-danger {
      color: var(--cb-danger, #c0392b);
    }

    .context-menu .menu-item-danger:hover {
      background: var(--cb-danger, #c0392b);
      color: #fff;
    }

    .context-menu hr {
      border: none;
      border-top: 1px solid var(--cb-border);
      margin: 4px 0;
    }

    /* -- Delete confirm dialog --------------------------------------------- */

    .delete-confirm-modal {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(92vw, 22rem);
      box-sizing: border-box;
      padding: 1.25rem 1.35rem;
      background: var(--cb-bg);
      color: var(--cb-fg);
      border: 1px solid var(--cb-border);
      border-radius: 10px;
      box-shadow: 0 12px 40px var(--cb-shadow);
      z-index: 2101;
    }

    .delete-confirm-title {
      margin: 0 0 0.75rem;
      font-size: 1.15rem;
      font-weight: 600;
    }

    .delete-confirm-body {
      margin: 0 0 1.1rem;
      font-size: 0.95rem;
      line-height: 1.5;
    }

    .delete-confirm-actions {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .delete-confirm-danger {
      border-radius: 8px;
      border: 1px solid transparent;
      padding: 0.65em 1em;
      font-size: 1rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      background: var(--cb-danger, #c0392b);
      color: #fff;
    }

    .delete-confirm-danger:hover:not(:disabled) {
      filter: brightness(1.05);
    }

    .delete-confirm-danger:disabled,
    .delete-confirm-secondary:disabled {
      opacity: 0.6;
      cursor: default;
    }

    .delete-confirm-secondary {
      border-radius: 8px;
      padding: 0.55em 1em;
      font-size: 0.95rem;
      font-family: inherit;
      cursor: pointer;
      background: var(--cb-btn-bg);
      color: var(--cb-fg);
      border: 1px solid var(--cb-btn-border);
    }

    /* -- Rename dialog ----------------------------------------------------- */

    .rename-dialog-modal {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(92vw, 28rem);
      box-sizing: border-box;
      padding: 1.25rem 1.35rem;
      background: var(--cb-bg);
      color: var(--cb-fg);
      border: 1px solid var(--cb-border);
      border-radius: 10px;
      box-shadow: 0 12px 40px var(--cb-shadow);
      z-index: 2101;
    }

    .rename-dialog-title {
      margin: 0 0 0.75rem;
      font-size: 1.15rem;
      font-weight: 600;
    }

    .rename-dialog-body {
      margin: 0 0 1rem;
      font-size: 0.95rem;
      line-height: 1.5;
    }

    .rename-dialog-conflict {
      margin: 0 0 1rem;
      font-size: 0.95rem;
      line-height: 1.5;
      color: var(--cb-danger, #c0392b);
    }

    .rename-dialog-form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .rename-field {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      font-size: 0.85rem;
      font-weight: 500;
    }

    .rename-field input,
    .rename-field select {
      font: inherit;
      font-weight: 400;
      font-size: 0.95rem;
      padding: 0.5em 0.65em;
      border: 1px solid var(--cb-border-strong, var(--cb-border));
      border-radius: 6px;
      background: var(--cb-panel-bg, var(--cb-bg));
      color: var(--cb-fg);
    }

    .rename-field input:focus,
    .rename-field select:focus {
      outline: 2px solid var(--cb-accent);
      outline-offset: 1px;
    }

    .rename-dialog-actions {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-top: 0.35rem;
    }

    .rename-dialog-primary {
      border-radius: 8px;
      border: 1px solid transparent;
      padding: 0.65em 1em;
      font-size: 1rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      background: var(--cb-accent);
      color: var(--cb-fg-on-accent);
    }

    .rename-dialog-primary:hover:not(:disabled) {
      background: var(--cb-accent-hover, var(--cb-accent));
    }

    .rename-dialog-primary:disabled,
    .rename-dialog-secondary:disabled {
      opacity: 0.6;
      cursor: default;
    }

    .rename-dialog-secondary {
      border-radius: 8px;
      padding: 0.55em 1em;
      font-size: 0.95rem;
      font-family: inherit;
      cursor: pointer;
      background: var(--cb-btn-bg);
      color: var(--cb-fg);
      border: 1px solid var(--cb-btn-border);
    }

    /* -- Getting started hint (shown once, after demo songs are added) ----- */

    .getting-started-modal {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(92vw, 24rem);
      box-sizing: border-box;
      padding: 1.25rem 1.35rem;
      background: var(--cb-bg);
      color: var(--cb-fg);
      border: 1px solid var(--cb-border);
      border-radius: 10px;
      box-shadow: 0 12px 40px var(--cb-shadow);
      z-index: 2101;
    }

    .getting-started-title {
      margin: 0 0 0.75rem;
      font-size: 1.15rem;
      font-weight: 600;
    }

    .getting-started-body {
      margin: 0 0 1.1rem;
      font-size: 0.95rem;
      line-height: 1.5;
    }

    .getting-started-help-glyph {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 0.95rem;
      height: 0.95rem;
      margin: 0 0.15em;
      vertical-align: 0.1em;
      font-size: 0.6rem;
      font-weight: 700;
      line-height: 1;
      border-radius: 50%;
      border: 1px solid var(--cb-accent);
      color: var(--cb-accent);
    }

    .getting-started-actions {
      display: flex;
      flex-direction: column;
    }

    .getting-started-primary {
      border-radius: 8px;
      border: 1px solid transparent;
      padding: 0.65em 1em;
      font-size: 1rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      background: var(--cb-accent);
      color: var(--cb-fg-on-accent);
    }

    .getting-started-primary:hover {
      background: var(--cb-accent-hover, var(--cb-accent));
    }

    /* -- Shared button styles ---------------------------------------------- */

    .secondary {
      border-radius: 6px;
      border: 1px solid var(--cb-btn-border);
      padding: 6px 16px;
      font-size: 0.9rem;
      background: var(--cb-btn-bg);
      color: var(--cb-fg);
      cursor: pointer;
    }

    .secondary:hover {
      background: var(--cb-btn-bg-hover);
    }

    /* Narrow layout: playlist on top when host is taller than wide (not viewport MQ). */

    @container cb-playlist-editor (max-aspect-ratio: 6/5) {
      .editor {
        flex-direction: column;
      }

      .playlist-panel {
        width: auto !important;
        min-width: 0;
        /* Fixed height via inline style; playlist list scrolls within. */
        flex: 0 0 auto;
        min-height: 0;
        border-right: none;
        border-bottom: 1px solid var(--cb-border);
      }

      .browser-panel {
        /* 2/3 of the vertical space; song list keeps its own scroll. */
        flex: 2 1 0;
        min-height: 0;
      }

      .resizer {
        width: 100%;
        height: 6px;
        cursor: row-resize;
        border-left: none;
        border-top: 1px solid var(--cb-border);
        touch-action: none;
      }

      .browser-toolbar {
        flex-wrap: wrap;
      }

      .song-table th,
      .song-table td {
        padding: 5px 6px;
      }
    }

    @container cb-playlist-editor ((max-width: 700px) or (max-height: 520px)) {
      .song-table th.title-col-head,
      .song-table td.title-cell {
        width: 27ch;
        max-width: 27ch;
      }
    }
  `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "playlist-editor": PlaylistEditor;
  }
}
