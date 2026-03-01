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
 * See CallerBuddySpec.md §"Playlist Editor UI".
 */

import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { callerBuddy } from "../caller-buddy.js";
import { DEFAULT_PLAYLIST_PANEL_WIDTH } from "../models/settings.js";
import { StateEvents } from "../services/app-state.js";

const MIN_PLAYLIST_WIDTH = 180;
const MAX_PLAYLIST_WIDTH = 500;
import { isSingingCall } from "../models/song.js";
import type { Song } from "../models/song.js";
import { loadAndMergeSongs } from "../services/song-library.js";
import { listDirectory, type DirEntry } from "../services/file-system-service.js";
import { log } from "../services/logger.js";

type SortField = "title" | "label" | "category" | "rank" | "dateAdded";
type SortDir = "asc" | "desc";

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

  @state() private filterText = "";
  @state() private sortField: SortField = "title";
  @state() private sortDir: SortDir = "asc";
  @state() private contextTarget: ContextTarget | null = null;
  @state() private contextMenuPos = { x: 0, y: 0 };

  /** Index of the playlist item the drag is currently hovering over (-1 = none). */
  @state() private dragOverIndex = -1;
  /** Whether the drop indicator should appear above or below the hovered item. */
  @state() private dropPosition: "above" | "below" = "above";
  /** The playlist index of the item currently being dragged (for reorder). */
  @state() private draggingPlaylistIndex = -1;
  /** Song object being dragged from the song table (kept as reference to preserve dirHandle). */
  private draggedSong: Song | null = null;

  // -- Touch drag-and-drop state (for mobile) --------------------------------

  /** True while a touch-initiated drag is active. */
  @state() private touchDragging = false;
  /** Timer ID for the hold-to-drag delay. */
  private touchHoldTimer: ReturnType<typeof setTimeout> | null = null;
  /** Touch identifier we're tracking (multitouch guard). */
  private touchId: number | null = null;
  /** Starting touch coordinates (for movement threshold). */
  private touchStartPos = { x: 0, y: 0 };

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

  /** Playlist panel width (from settings, updated on resize). */
  @state() private playlistWidth = DEFAULT_PLAYLIST_PANEL_WIDTH;

  connectedCallback() {
    super.connectedCallback();
    this.playlistWidth =
      callerBuddy.state.settings.playlistPanelWidth ?? DEFAULT_PLAYLIST_PANEL_WIDTH;
    callerBuddy.state.addEventListener(StateEvents.PLAYLIST_CHANGED, this.refresh);
    callerBuddy.state.addEventListener(StateEvents.SETTINGS_CHANGED, this.onSettingsChanged);
    document.addEventListener("keydown", this._boundKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this._boundKeydown);
    callerBuddy.state.removeEventListener(StateEvents.PLAYLIST_CHANGED, this.refresh);
    callerBuddy.state.removeEventListener(StateEvents.SETTINGS_CHANGED, this.onSettingsChanged);
    this.stopResize();
  }

  private onSettingsChanged = () => {
    this.playlistWidth =
      callerBuddy.state.settings.playlistPanelWidth ?? DEFAULT_PLAYLIST_PANEL_WIDTH;
    this.requestUpdate();
  };

  private _boundKeydown = (e: KeyboardEvent) => this.onKeydown(e);

  private onKeydown(e: KeyboardEvent) {
    if (e.key !== "Enter") return;
    const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (inInput) return;
    if (callerBuddy.state.playlist.length === 0) return;
    e.preventDefault();
    this.onPlayPlaylist();
  }

  private refresh = () => {
    this.requestUpdate();
  };

  // -- Folder loading -------------------------------------------------------

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
  }

  private async initFolder(handle: FileSystemDirectoryHandle): Promise<void> {
    this.handleStack = [handle];
    await this.loadCurrentFolder();
  }

  private async loadCurrentFolder(): Promise<void> {
    const handle = this.currentHandle;
    if (!handle) return;

    this.loading = true;
    try {
      // Sequential: concurrent use of the same directory handle can hang
      // (handle.values() is not safe to call concurrently).
      const songs = await loadAndMergeSongs(handle);
      const entries = await listDirectory(handle);

      for (const song of songs) {
        song.dirHandle = handle;
      }

      this.localSongs = songs;
      this.subfolders = entries.filter((e) => e.kind === "directory");

      // Kick off background BPM detection for this folder's songs
      callerBuddy.detectBpmForSongs(handle, songs, (updated) => {
        this.localSongs = [...updated];
      });
    } catch (err) {
      log.error(`Failed to load folder "${handle.name}":`, err);
      this.localSongs = [];
      this.subfolders = [];
    } finally {
      this.loading = false;
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
    await this.loadCurrentFolder();
  }

  // -- Render ---------------------------------------------------------------

  render() {
    const songs = this.getFilteredSongs();
    const playlist = callerBuddy.state.playlist;


    return html`
      <div class="editor" @click=${this.closeContextMenu}>
        <!-- Left: Playlist -->
        <aside class="playlist-panel ${this.touchDragging ? "touch-drag-active" : ""}" style="width: ${this.playlistWidth}px">
          <h2>Playlist</h2>
          ${playlist.length === 0
            ? html`<div
                class="empty-playlist-drop"
                @dragover=${this.onPlaylistContainerDragOver}
                @drop=${this.onEmptyPlaylistDrop}
              ><p class="muted">No songs in playlist. Drag songs here, right-click,
                or use the + button to add songs.</p></div>`
            : html`
                <ol
                  class="playlist-list"
                  @dragover=${this.onPlaylistContainerDragOver}
                  @dragleave=${this.onPlaylistDragLeave}
                  @drop=${this.onPlaylistDrop}
                >
                  ${playlist.map(
                    (song, i) => html`
                      <li
                        class="playlist-item
                          ${this.draggingPlaylistIndex === i ? "dragging" : ""}
                          ${this.dragOverIndex === i && this.dropPosition === "above" ? "drop-indicator-above" : ""}
                          ${this.dragOverIndex === i && this.dropPosition === "below" ? "drop-indicator-below" : ""}"
                        draggable="true"
                        @dragstart=${(e: DragEvent) => this.onPlaylistItemDragStart(e, i)}
                        @dragend=${this.onDragEnd}
                        @dragover=${(e: DragEvent) => this.onPlaylistDragOver(e, i)}
                        @touchstart=${(e: TouchEvent) => this.onTouchStart(e, { kind: "playlist" as const, index: i })}
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
              title="Play the playlist"
              @click=${this.onPlayPlaylist}
            >
              ▶ Play
            </button>
            ${playlist.length > 0
              ? html`
                  <button
                    class="secondary"
                    title="Clear playlist"
                    @click=${() => callerBuddy.state.clearPlaylist()}
                  >
                    Clear
                  </button>
                `
              : nothing}
          </div>
        </aside>
        <div
          class="resizer"
          title="Drag to resize playlist"
          @mousedown=${this.onResizerMouseDown}
        ></div>

        <!-- Right: Song browser -->
        <section class="browser-panel">
          ${this.renderBreadcrumb()}
          <div class="browser-toolbar">
            <input
              type="text"
              class="filter-input"
              placeholder="Filter songs by title, label, or category…"
              .value=${this.filterText}
              @input=${this.onFilterInput}
              @keydown=${this.onFilterKeydown}
            />
            <span class="song-count">
              ${this.subfolders.length > 0
                ? `${this.subfolders.length} folders, `
                : ""}${songs.length} songs
            </span>
          </div>

          <div class="table-wrapper">
            ${this.loading
              ? html`<p class="muted table-empty">Loading…</p>`
              : html`
                <table class="song-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th></th>
                      <th class="sortable" @click=${() => this.toggleSort("title")}>
                        Title ${this.sortIndicator("title")}
                      </th>
                      <th class="sortable" @click=${() => this.toggleSort("label")}>
                        Label ${this.sortIndicator("label")}
                      </th>
                      <th class="sortable" @click=${() => this.toggleSort("category")}>
                        Category ${this.sortIndicator("category")}
                      </th>
                      <th class="sortable" @click=${() => this.toggleSort("rank")}>
                        Rank ${this.sortIndicator("rank")}
                      </th>
                      <th>Type</th>
                      <th>BPM</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${this.renderFolderRows()}
                    ${songs.map(
                      (song) => html`
                        <tr
                          draggable="true"
                          @dragstart=${(e: DragEvent) => this.onSongDragStart(e, song)}
                          @dragend=${this.onDragEnd}
                          @contextmenu=${(e: MouseEvent) => this.onRowContextMenu(e, { kind: "song", song })}
                          @dblclick=${() => this.addToPlaylist(song)}
                          @touchstart=${(e: TouchEvent) => this.onTouchStart(e, { kind: "song" as const, song })}
                          title="Drag to playlist, double-click, or right-click to add"
                        >
                          <td class="play-cell">
                            <button
                              class="icon-btn"
                              title="Play now"
                              @click=${() => this.playSongNow(song)}
                            >▶</button>
                          </td>
                          <td class="add-cell">
                            <button
                              class="icon-btn add-btn"
                              title="Add to playlist"
                              @click=${() => this.addToPlaylist(song)}
                            >+</button>
                          </td>
                          <td>${song.title}</td>
                          <td class="label-cell">${song.label}</td>
                          <td>${song.category}</td>
                          <td class="rank-cell">${song.rank}</td>
                          <td class="type-cell">
                            <span
                              class="${isSingingCall(song) ? "singing" : "patter"}"
                              title="${isSingingCall(song) ? "Singing call" : "Patter (no lyrics)"}"
                            >${isSingingCall(song) ? "Singing" : "Patter"}</span>
                          </td>
                          <td class="bpm-cell"
                            title="${song.originalTempo > 0 ? `Detected tempo: ${song.originalTempo} BPM` : "BPM not yet detected"}"
                          >${song.originalTempo > 0 ? song.originalTempo : "—"}</td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
                ${songs.length === 0 && this.subfolders.length === 0
                  ? html`<p class="muted table-empty">
                      ${this.filterText
                        ? "No songs match the filter."
                        : "No songs found. Make sure your CallerBuddy folder contains MP3 files."}
                    </p>`
                  : nothing}
              `}
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
          <td colspan="6" class="folder-name">${entry.name}</td>
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
      callerBuddy.state.insertAtStartOfPlaylist(song);
    } else {
      callerBuddy.state.addToPlaylist(song);
    }
    this.contextTarget = null;
    this.filterText = "";
  }

  private async playSongFromCtx() {
    if (!this.contextTarget || this.contextTarget.kind !== "song") return;
    const song = this.contextTarget.song;
    this.contextTarget = null;
    await this.playSongNow(song);
  }

  // -- Drag and drop --------------------------------------------------------

  private onSongDragStart(e: DragEvent, song: Song) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("application/x-callerbuddy-song", "1");
    e.dataTransfer.effectAllowed = "copy";
    this.draggedSong = song;
  }

  private onPlaylistItemDragStart(e: DragEvent, index: number) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("application/x-callerbuddy-playlist-item", String(index));
    e.dataTransfer.effectAllowed = "move";
    this.draggingPlaylistIndex = index;
  }

  private onDragEnd() {
    this.dragOverIndex = -1;
    this.draggingPlaylistIndex = -1;
    this.draggedSong = null;
  }

  private onPlaylistDragOver(e: DragEvent, index: number) {
    const dt = e.dataTransfer;
    if (!dt) return;
    const hasSong = dt.types.includes("application/x-callerbuddy-song");
    const hasItem = dt.types.includes("application/x-callerbuddy-playlist-item");
    if (!hasSong && !hasItem) return;

    e.preventDefault();
    dt.dropEffect = hasItem ? "move" : "copy";

    const target = (e.currentTarget as HTMLElement);
    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    this.dropPosition = e.clientY < midY ? "above" : "below";
    this.dragOverIndex = index;
  }

  private onPlaylistContainerDragOver(e: DragEvent) {
    const dt = e.dataTransfer;
    if (!dt) return;
    const hasSong = dt.types.includes("application/x-callerbuddy-song");
    const hasItem = dt.types.includes("application/x-callerbuddy-playlist-item");
    if (!hasSong && !hasItem) return;
    e.preventDefault();
    dt.dropEffect = hasItem ? "move" : "copy";
  }

  private onPlaylistDrop(e: DragEvent) {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt) return;

    const dropIndex = this.dropPosition === "below"
      ? this.dragOverIndex + 1
      : this.dragOverIndex;

    const itemData = dt.getData("application/x-callerbuddy-playlist-item");
    if (itemData) {
      const fromIndex = Number(itemData);
      const adjustedTo = dropIndex > fromIndex ? dropIndex - 1 : dropIndex;
      if (fromIndex !== adjustedTo) {
        callerBuddy.state.moveInPlaylist(fromIndex, adjustedTo);
      }
    } else if (this.draggedSong) {
      callerBuddy.state.insertInPlaylist(this.draggedSong, dropIndex);
    }

    this.dragOverIndex = -1;
    this.draggingPlaylistIndex = -1;
  }

  private onEmptyPlaylistDrop(e: DragEvent) {
    e.preventDefault();

    if (this.draggedSong) {
      callerBuddy.state.addToPlaylist(this.draggedSong);
    }

    this.dragOverIndex = -1;
  }

  private onPlaylistDragLeave(e: DragEvent) {
    const related = e.relatedTarget as Node | null;
    const container = e.currentTarget as HTMLElement;
    if (related && container.contains(related)) return;
    this.dragOverIndex = -1;
  }

  // -- Touch drag-and-drop (mobile) -----------------------------------------
  //
  // HTML5 DnD events don't fire reliably on Android/iOS touch screens.
  // These handlers use touchstart/touchmove/touchend directly so that
  // dragging songs into the playlist (and reordering) works on mobile.

  private static readonly TOUCH_HOLD_MS = 300;
  private static readonly TOUCH_MOVE_THRESHOLD = 10; // px before cancelling hold

  private onTouchStart(
    e: TouchEvent,
    source: { kind: "song"; song: Song } | { kind: "playlist"; index: number },
  ) {
    if (e.touches.length !== 1) return;

    // Prevent the browser from starting a native drag (the element has
    // draggable="true" for desktop mouse DnD). Without this, Android Chrome
    // long-press triggers a native drag → touchcancel, killing our handler.
    e.preventDefault();

    const touch = e.touches[0];
    this.touchId = touch.identifier;
    this.touchStartPos = { x: touch.clientX, y: touch.clientY };

    if (source.kind === "song") {
      this.draggedSong = source.song;
      this.draggingPlaylistIndex = -1;
    } else {
      this.draggedSong = null;
      this.draggingPlaylistIndex = source.index;
    }

    // Attach listeners immediately so we can cancel on premature movement
    document.addEventListener("touchmove", this.boundTouchMove, { passive: false });
    document.addEventListener("touchend", this.boundTouchEnd);
    document.addEventListener("touchcancel", this.boundTouchEnd);

    this.touchHoldTimer = setTimeout(() => {
      this.touchHoldTimer = null;
      this.touchDragging = true;
    }, PlaylistEditor.TOUCH_HOLD_MS);
  }

  private boundTouchMove = (e: TouchEvent) => this.onTouchMove(e);
  private boundTouchEnd = (e: TouchEvent) => this.onTouchEnd(e);

  private onTouchMove(e: TouchEvent) {
    // CRITICAL: always prevent default so the browser doesn't claim the
    // touch for scrolling (which would fire touchcancel and kill the drag).
    e.preventDefault();

    // Use e.touches (all active touches) for move — more reliable than
    // changedTouches on some mobile browsers.
    const touch = this.findTrackedTouch(e.touches);
    if (!touch) return;

    // Still in hold phase — cancel if finger moved too far
    if (!this.touchDragging) {
      const dx = touch.clientX - this.touchStartPos.x;
      const dy = touch.clientY - this.touchStartPos.y;
      if (Math.abs(dx) > PlaylistEditor.TOUCH_MOVE_THRESHOLD ||
          Math.abs(dy) > PlaylistEditor.TOUCH_MOVE_THRESHOLD) {
        this.cancelTouchDrag();
      }
      return;
    }

    // Use bounding-rect hit-testing (more reliable than elementFromPoint in
    // Shadow DOM on mobile browsers).
    const hit = this.hitTestPlaylistItems(touch.clientX, touch.clientY);
    if (hit) {
      this.dragOverIndex = hit.index;
      this.dropPosition = hit.position;
    } else if (this.isOverPlaylistPanel(touch.clientX, touch.clientY)) {
      // Over the panel but not a specific item — target end of list
      const len = callerBuddy.state.playlist.length;
      if (len > 0) {
        this.dragOverIndex = len - 1;
        this.dropPosition = "below";
      } else {
        this.dragOverIndex = -1; // empty playlist, drop will use addToPlaylist
      }
    } else {
      this.dragOverIndex = -1;
    }
  }

  private onTouchEnd(e: TouchEvent) {
    const touch = this.findTrackedTouch(e.changedTouches);
    if (!touch) return;

    if (this.touchDragging) {
      this.performTouchDrop(touch.clientX, touch.clientY);
    }
    this.cancelTouchDrag();
  }

  private performTouchDrop(x: number, y: number) {
    const playlist = callerBuddy.state.playlist;
    const overPlaylist = this.isOverPlaylistPanel(x, y);

    if (!overPlaylist) return; // Dropped outside the playlist — no action

    if (this.draggingPlaylistIndex >= 0) {
      // Reorder within playlist
      if (this.dragOverIndex >= 0) {
        const dropIndex = this.dropPosition === "below"
          ? this.dragOverIndex + 1
          : this.dragOverIndex;
        const fromIndex = this.draggingPlaylistIndex;
        const adjustedTo = dropIndex > fromIndex ? dropIndex - 1 : dropIndex;
        if (fromIndex !== adjustedTo) {
          callerBuddy.state.moveInPlaylist(fromIndex, adjustedTo);
        }
      }
    } else if (this.draggedSong) {
      // Add song to playlist
      if (playlist.length === 0) {
        callerBuddy.state.addToPlaylist(this.draggedSong);
      } else if (this.dragOverIndex >= 0) {
        const dropIndex = this.dropPosition === "below"
          ? this.dragOverIndex + 1
          : this.dragOverIndex;
        callerBuddy.state.insertInPlaylist(this.draggedSong, dropIndex);
      } else {
        callerBuddy.state.addToPlaylist(this.draggedSong);
      }
    }
  }

  private cancelTouchDrag() {
    if (this.touchHoldTimer != null) {
      clearTimeout(this.touchHoldTimer);
      this.touchHoldTimer = null;
    }
    document.removeEventListener("touchmove", this.boundTouchMove);
    document.removeEventListener("touchend", this.boundTouchEnd);
    document.removeEventListener("touchcancel", this.boundTouchEnd);
    this.touchDragging = false;
    this.touchId = null;
    this.dragOverIndex = -1;
    this.draggingPlaylistIndex = -1;
    this.draggedSong = null;
  }

  private findTrackedTouch(touches: TouchList): Touch | null {
    if (this.touchId == null) return null;
    for (let i = 0; i < touches.length; i++) {
      if (touches[i].identifier === this.touchId) return touches[i];
    }
    return null;
  }

  /**
   * Hit-tests all visible .playlist-item elements against viewport coordinates.
   * Uses getBoundingClientRect instead of elementFromPoint for reliability
   * inside Shadow DOM on mobile browsers.
   */
  private hitTestPlaylistItems(
    x: number,
    y: number,
  ): { index: number; position: "above" | "below" } | null {
    const root = this.shadowRoot;
    if (!root) return null;
    const items = root.querySelectorAll(".playlist-item");
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const midY = rect.top + rect.height / 2;
        return { index: i, position: y < midY ? "above" : "below" };
      }
    }
    return null;
  }

  /** Checks whether the given viewport coordinates are over the playlist panel. */
  private isOverPlaylistPanel(x: number, y: number): boolean {
    const root = this.shadowRoot;
    if (!root) return false;
    const panel = root.querySelector(".playlist-panel");
    if (!panel) return false;
    const rect = panel.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
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
          s.category.toLowerCase().includes(lower),
      );
    }

    const dir = this.sortDir === "asc" ? 1 : -1;
    songs.sort((a, b) => {
      const aVal = a[this.sortField];
      const bVal = b[this.sortField];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return dir * aVal.localeCompare(bVal, undefined, { sensitivity: "base" });
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return dir * (aVal - bVal);
      }
      return 0;
    });

    return songs;
  }

  private toggleSort(field: SortField) {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
    } else {
      this.sortField = field;
      this.sortDir = "asc";
    }
  }

  private sortIndicator(field: SortField): string {
    if (this.sortField !== field) return "";
    return this.sortDir === "asc" ? " ▲" : " ▼";
  }

  /** Consume Enter inside the filter so it doesn't bubble up to the
   *  page-level keydown handler (which would start playback). */
  private onFilterKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") e.stopPropagation();
  }

  private onFilterInput(e: Event) {
    this.filterText = (e.target as HTMLInputElement).value;
  }

  // -- Resizer --------------------------------------------------------------

  private resizeStartX = 0;
  private resizeStartWidth = 0;
  private resizeBoundMousemove = (e: MouseEvent) => this.onResizeMouseMove(e);
  private resizeBoundMouseup = () => this.onResizeMouseUp();

  private onResizerMouseDown(e: MouseEvent) {
    e.preventDefault();
    this.resizeStartX = e.clientX;
    this.resizeStartWidth = this.playlistWidth;
    document.addEventListener("mousemove", this.resizeBoundMousemove);
    document.addEventListener("mouseup", this.resizeBoundMouseup);
    (document.body.style as { cursor?: string }).cursor = "col-resize";
    (document.body.style as { userSelect?: string }).userSelect = "none";
  }

  private onResizeMouseMove(e: MouseEvent) {
    const delta = e.clientX - this.resizeStartX;
    const w = Math.round(
      Math.max(MIN_PLAYLIST_WIDTH, Math.min(MAX_PLAYLIST_WIDTH, this.resizeStartWidth + delta)),
    );
    this.playlistWidth = w;
  }

  private onResizeMouseUp() {
    this.stopResize();
    void callerBuddy.updateSetting("playlistPanelWidth", this.playlistWidth);
  }

  private stopResize() {
    document.removeEventListener("mousemove", this.resizeBoundMousemove);
    document.removeEventListener("mouseup", this.resizeBoundMouseup);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  // -- Playlist operations --------------------------------------------------

  private addToPlaylist(song: Song) {
    callerBuddy.state.addToPlaylist(song);
    this.filterText = "";
  }

  /**
   * Single-song workflow shortcut: add to playlist and immediately play.
   * See CallerBuddySpec.md §"Single song Workflow".
   */
  private async playSongNow(song: Song) {
    callerBuddy.state.addToPlaylist(song);
    this.filterText = "";
    callerBuddy.openPlaylistPlay();
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "wait";
    try {
      await callerBuddy.openSongPlay(song);
    } finally {
      document.body.style.cursor = prevCursor;
    }
  }

  private onPlayPlaylist() {
    callerBuddy.openPlaylistPlay();
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }

    .editor {
      display: flex;
      height: 100%;
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

    .playlist-panel.touch-drag-active {
      outline: 2px solid var(--cb-accent);
      outline-offset: -2px;
      background: color-mix(in srgb, var(--cb-accent) 5%, var(--cb-panel-bg));
    }

    .touch-drag-active .empty-playlist-drop {
      border-color: var(--cb-accent);
      background: color-mix(in srgb, var(--cb-accent) 8%, transparent);
    }

    .song-table tbody tr[draggable="true"] {
      cursor: grab;
    }

    .pl-type {
      font-size: 0.9rem;
      width: 18px;
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
    }

    .browser-toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--cb-border);
    }

    .filter-input {
      flex: 1;
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

    .song-count {
      font-size: 0.8rem;
      color: var(--cb-fg-secondary);
      white-space: nowrap;
    }

    .table-wrapper {
      flex: 1;
      overflow: auto;
      padding: 0;
    }

    .song-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }

    .song-table th,
    .song-table td {
      padding: 6px 10px;
      text-align: left;
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

    .song-table tbody tr:hover {
      background: var(--cb-hover);
    }

    /* -- Folder rows ------------------------------------------------------- */

    .folder-row {
      cursor: pointer;
    }

    .folder-row:hover {
      background: var(--cb-hover);
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
    }

    .type-cell .singing {
      color: var(--cb-singing);
    }

    .type-cell .patter {
      color: var(--cb-patter);
    }

    .bpm-cell {
      text-align: center;
      font-variant-numeric: tabular-nums;
      color: var(--cb-fg-secondary);
      font-size: 0.85rem;
    }

    .add-cell,
    .play-cell {
      width: 32px;
      text-align: center;
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

    /* -- Narrow layout: playlist on top when width <= 1.2× height ---------- */

    @media (max-aspect-ratio: 6/5) {
      .editor {
        flex-direction: column;
      }

      .playlist-panel {
        width: auto !important;
        min-width: 0;
        max-height: 35vh;
        max-height: 35dvh;
        border-right: none;
        border-bottom: 1px solid var(--cb-border);
      }

      .resizer {
        display: none;
      }

      .browser-toolbar {
        flex-wrap: wrap;
      }

      .song-table th,
      .song-table td {
        padding: 6px 6px;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "playlist-editor": PlaylistEditor;
  }
}
