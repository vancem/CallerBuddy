/**
 * Playlist editor: browse songs in a folder, filter, and build a playlist.
 *
 * Each editor instance is self-contained: it owns its own directory handle,
 * song list, and subfolder state. Multiple instances can coexist in separate
 * tabs, all sharing the global playlist via AppState events.
 *
 * Layout:
 *  ┌─────────────┬──────────────────────────────────────┐
 *  │  Playlist   │  Root > subfolder1 > subfolder2      │
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
import { PlaylistReorderController } from "../controllers/playlist-reorder-controller.js";
import { PanelResizeController } from "../controllers/panel-resize-controller.js";
import {
  DEFAULT_PLAYLIST_PANEL_HEIGHT,
  DEFAULT_PLAYLIST_PANEL_WIDTH,
} from "../models/settings.js";
import { StateEvents } from "../services/app-state.js";
import { isSingingCall } from "../models/song.js";
import type { Song } from "../models/song.js";
import { loadAndMergeSongs, loadSongsJson } from "../services/song-library.js";
import { listDirectory, type DirEntry } from "../services/file-system-service.js";
import { log } from "../services/logger.js";
import { daysSinceLastUsedMs, displayPlayWeight } from "../utils/play-history.js";

type SortField =
  | "title"
  | "label"
  | "categories"
  | "rank"
  | "orderAdded"
  | "lastUsedDays"
  | "playedDisplay";
type SortDir = "asc" | "desc";
type SortKey = { field: SortField; dir: SortDir };

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

  /** Re-render when host box changes (orientation; viewport MQs lie on WebAPK). */
  private _editorLayoutRo: ResizeObserver | null = null;

  @state() private filterText = "";
  /** When true, rank filter uses >= threshold; when false, uses < threshold. */
  @state() private rankCompareGte = true;
  /** Empty string disables rank filtering. */
  @state() private rankFilterInput = "";
  /**
   * Multi-key stable sort order. Most-recently toggled field is primary (index 0).
   * Default when entering the editor: Rank (desc), then Title (asc).
   */
  @state() private sortKeys: SortKey[] = [
    { field: "rank", dir: "desc" },
    { field: "title", dir: "asc" },
  ];
  @state() private contextTarget: ContextTarget | null = null;
  @state() private contextMenuPos = { x: 0, y: 0 };

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

  /** Songs loaded from the current folder's songs.json + disk scan. */
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
    this.resizerX.width =
      callerBuddy.state.settings.playlistPanelWidth ?? DEFAULT_PLAYLIST_PANEL_WIDTH;
    this.resizerY.size =
      callerBuddy.state.settings.playlistPanelHeight ?? DEFAULT_PLAYLIST_PANEL_HEIGHT;
    callerBuddy.state.addEventListener(StateEvents.PLAYLIST_CHANGED, this.onPlaylistChanged);
    callerBuddy.state.addEventListener(StateEvents.SONG_UPDATED, this.onSongUpdated);
    callerBuddy.state.addEventListener(StateEvents.SETTINGS_CHANGED, this.onSettingsChanged);
    callerBuddy.state.addEventListener(StateEvents.CHANGED, this.onAppStateChanged);
    this.lastSeenActiveTabId = callerBuddy.state.activeTabId;
    document.addEventListener("keydown", this._boundKeydown);

    this._editorLayoutRo = new ResizeObserver(() => this.requestUpdate());
    this._editorLayoutRo.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._editorLayoutRo?.disconnect();
    this._editorLayoutRo = null;
    document.removeEventListener("keydown", this._boundKeydown);
    callerBuddy.state.removeEventListener(StateEvents.PLAYLIST_CHANGED, this.onPlaylistChanged);
    callerBuddy.state.removeEventListener(StateEvents.SONG_UPDATED, this.onSongUpdated);
    callerBuddy.state.removeEventListener(StateEvents.SETTINGS_CHANGED, this.onSettingsChanged);
    callerBuddy.state.removeEventListener(StateEvents.CHANGED, this.onAppStateChanged);
  }

  private onSettingsChanged = () => {
    this.resizerX.width =
      callerBuddy.state.settings.playlistPanelWidth ?? DEFAULT_PLAYLIST_PANEL_WIDTH;
    this.resizerY.size =
      callerBuddy.state.settings.playlistPanelHeight ?? DEFAULT_PLAYLIST_PANEL_HEIGHT;
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
      this.requestUpdate();
    }
  };

  /**
   * Stacked playlist-on-top layout. Prefer host `getBoundingClientRect()` — viewport
   * aspect MQs see bogus ~980×2053 on Samsung WebAPK while the shell is ~360 wide.
   */
  private isEditorPortraitLayout(): boolean {
    const r = this.getBoundingClientRect();
    if (r.width >= 16 && r.height >= 16) {
      return r.width / r.height <= 6 / 5;
    }
    return window.matchMedia("(max-aspect-ratio: 6/5)").matches;
  }

  private _boundKeydown = (e: KeyboardEvent) => this.onKeydown(e);

  private onKeydown(e: KeyboardEvent) {
    if (this.tabId && callerBuddy.state.activeTabId !== this.tabId) return;
    const inTypingControl =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement;
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
      (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "c";
    if (isClearShortcut && !inTypingControl && !this.loading) {
      if (callerBuddy.state.playlist.length > 0) {
        e.preventDefault();
        callerBuddy.state.clearPlaylistWithBackup();
        return;
      }
      if (callerBuddy.state.hasClearedPlaylistBackup()) {
        e.preventDefault();
        callerBuddy.state.restoreClearedPlaylist();
        return;
      }
    }

    if (
      !this.loading &&
      !this.editingCell &&
      (e.ctrlKey || e.metaKey) &&
      !e.altKey
    ) {
      const k = e.key.toLowerCase();
      if (k === "f") {
        e.preventDefault();
        queueMicrotask(() => this.focusFilterInput());
        return;
      }
      if (k === "r" && !e.shiftKey) {
        e.preventDefault();
        queueMicrotask(() => this.focusRankFilterInput());
        return;
      }
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

  private focusRankFilterInput() {
    const el = this.renderRoot.querySelector(
      ".rank-filter-input",
    ) as HTMLInputElement | null;
    el?.focus();
    el?.select();
  }

  private focusSongTable() {
    if (this.tabId && callerBuddy.state.activeTabId !== this.tabId) return;
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
   * reload this folder’s songs.json + scan so the table is not stuck on stale in-memory objects.
   */
  private onSongUpdated = () => {
    void this.reloadCurrentFolderFromDisk();
  };

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

    if (this.pendingSongTableFocus && !this.loading) {
      this.pendingSongTableFocus = false;
      queueMicrotask(() => this.focusSongTable());
    }

    if (changed.has("keyboardShortcutSongKey") && this.keyboardShortcutSongKey) {
      queueMicrotask(() => this.scrollSelectedSongRowIntoView());
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
    const seq = ++this.folderLoadSeq;
    try {
      // Fast path: load songs.json first so the UI can render quickly.
      const t0 = performance.now();
      const persisted = await loadSongsJson(handle);
      const t1 = performance.now();
      if (seq !== this.folderLoadSeq) return;

      for (const song of persisted) song.dirHandle = handle;
      this.localSongs = persisted;
      this.loading = false;
      log.info(
        `playlist-editor: loaded songs.json (${persisted.length} songs) in ${(t1 - t0).toFixed(1)}ms`,
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
    } finally {
      if (seq === this.folderLoadSeq) {
        // If we already flipped loading=false after songs.json, keep it off.
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
    this.filterText = "";
    this.rankFilterInput = "";
    this.rankCompareGte = true;
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
          <h2>Playlist</h2>
          ${playlist.length === 0
            ? html`<div
                class="empty-playlist-drop"
                @dragenter=${this.reorder.onDragEnter}
                @dragover=${this.reorder.onPlaylistContainerDragOver}
                @drop=${this.onEmptyPlaylistDrop}
              ><p class="muted">No songs in playlist. Drag songs here, right-click,
                or use the + button to add songs.</p></div>`
            : html`
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
              `}
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
                    title="Clear playlist (Ctrl+C)"
                    @click=${this.onClearPlaylist}
                  >
                    Clear
                  </button>
                `
              : nothing}
            ${canRestore
              ? html`
                  <button
                    class="secondary"
                    title="Restore cleared playlist (Ctrl+C)"
                    @click=${this.onRestorePlaylist}
                  >
                    Restore
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
                    placeholder="Filter songs by title, label, or categories…"
                    title="Filter songs by title, label, or categories (Ctrl+F)"
                    .value=${this.filterText}
                    @input=${this.onFilterInput}
                    @keydown=${this.onFilterKeydown}
                  />
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
                    title="Rank threshold (0–100). Empty = no rank filter. (Ctrl+R)"
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
                        class="sortable"
                        title="Publisher label and catalog number from the filename (e.g. RYL 607)."
                        @click=${() => this.toggleSort("label")}
                      >
                        Label ${this.sortIndicator("label")}
                      </th>
                      <th title="Singing call (has lyrics) or patter (no lyrics file).">Type</th>
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
                          title="Drag to playlist, double-click, or right-click to add"
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
                          <td class="label-cell">${song.label}</td>
                          <td class="type-cell">
                            <span
                              class="${isSingingCall(song) ? "singing" : "patter"}"
                              title="${isSingingCall(song) ? "Singing call" : "Patter (no lyrics)"}"
                            >${isSingingCall(song) ? "Singing" : "Patter"}</span>
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
                ${songs.length === 0 && this.subfolders.length === 0
                  ? html`<p class="muted table-empty">
                      ${this.filterText
                        ? "No songs match the filter."
                        : "No songs found. Make sure your CallerBuddy folder contains audio files (MP3, M4A, or WAV)."}
                    </p>`
                  : nothing}
              `}
            </div>
          </div>
        </section>

        <!-- Context menu -->
        ${this.renderContextMenu()}
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
          title="Click to open in new tab, right-click for options"
        >
          <td class="folder-icon-cell" colspan="2">📁</td>
          <td colspan="7" class="folder-name">${entry.name}</td>
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
      const lower = this.filterText.toLowerCase();
      songs = songs.filter(
        (s) =>
          s.title.toLowerCase().includes(lower) ||
          s.label.toLowerCase().includes(lower) ||
          s.categories.toLowerCase().includes(lower),
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
      return;
    }

    if (idx > 0) {
      // Promote existing key to primary (preserve its direction).
      const promoted = this.sortKeys[idx];
      this.sortKeys = [promoted, ...this.sortKeys.slice(0, idx), ...this.sortKeys.slice(idx + 1)];
      return;
    }

    // Add new primary key.
    this.sortKeys = [{ field, dir: defaultDir }, ...this.sortKeys];
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
        queueMicrotask(() => this.focusSongTable());
      }
    }
  }

  private onFilterInput(e: Event) {
    this.filterText = (e.target as HTMLInputElement).value;
  }

  private onClearFilter(e: MouseEvent) {
    e.stopPropagation();
    this.filterText = "";
  }

  private onRankCompareToggle(e: MouseEvent) {
    e.stopPropagation();
    this.rankCompareGte = !this.rankCompareGte;
  }

  private onRankFilterInput(e: Event) {
    this.rankFilterInput = (e.target as HTMLInputElement).value;
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

  static styles = css`
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

    .playlist-panel h2 {
      margin: 0 0 8px;
      font-size: 1rem;
      font-weight: 600;
    }

    .playlist-list {
      flex: 1;
      overflow-y: auto;
      margin: 0;
      padding: 0 0 0 4px;
      list-style-position: inside;
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
      border: 1px solid var(--cb-border);
      border-radius: 6px;
      background: var(--cb-input-bg);
      color: var(--cb-fg-secondary);
      font-size: 1.15rem;
      line-height: 1;
      cursor: pointer;
    }

    .filter-clear:hover {
      color: var(--cb-fg);
      background: var(--cb-hover);
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
      border: 1px solid var(--cb-border);
      border-radius: 6px;
      background: var(--cb-input-bg);
      color: var(--cb-fg);
      font-size: 0.8rem;
      font-variant-numeric: tabular-nums;
      cursor: pointer;
    }

    .rank-filter-compare:hover {
      background: var(--cb-hover);
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

    .context-menu hr {
      border: none;
      border-top: 1px solid var(--cb-border);
      margin: 4px 0;
    }

    /* -- Shared button styles ---------------------------------------------- */

    .primary {
      border-radius: 6px;
      border: 1px solid transparent;
      padding: 6px 16px;
      font-size: 0.9rem;
      font-weight: 500;
      background: var(--cb-accent);
      color: var(--cb-fg-on-accent);
      cursor: pointer;
    }

    .primary:hover:not(:disabled) {
      background: var(--cb-accent-hover);
    }

    .primary:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .secondary {
      border-radius: 6px;
      border: 1px solid var(--cb-border);
      padding: 6px 16px;
      font-size: 0.9rem;
      background: transparent;
      color: var(--cb-fg);
      cursor: pointer;
    }

    .secondary:hover {
      background: var(--cb-hover);
    }

    .icon-btn {
      background: none;
      border: none;
      color: var(--cb-fg-secondary);
      font-size: 1rem;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      line-height: 1;
    }

    .icon-btn:hover {
      color: var(--cb-fg);
      background: var(--cb-hover);
    }

    .muted {
      color: var(--cb-fg-tertiary);
      font-size: 0.85rem;
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
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "playlist-editor": PlaylistEditor;
  }
}
