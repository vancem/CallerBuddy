/**
 * Playlist editor: browse songs, filter, and build a playlist.
 *
 * Layout:
 *  ┌─────────────┬──────────────────────────────────────┐
 *  │  Playlist   │  [Filter: ________________]          │
 *  │             │  ┌──────┬───────┬─────┬──────┐       │
 *  │  1. Song A  │  │Title │ Label │ Cat │ Rank │       │
 *  │  2. Song B  │  ├──────┼───────┼─────┼──────┤       │
 *  │  3. Song C  │  │ ...  │       │     │      │       │
 *  │             │  └──────┴───────┴─────┴──────┘       │
 *  │  [▶ Play]   │                                      │
 *  └─────────────┴──────────────────────────────────────┘
 *
 * See CallerBuddySpec.md §"Playlist Editor UI".
 */

import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { callerBuddy } from "../caller-buddy.js";
import { StateEvents } from "../services/app-state.js";
import { isSingingCall } from "../models/song.js";
import type { Song } from "../models/song.js";

type SortField = "title" | "label" | "category" | "rank" | "dateAdded";
type SortDir = "asc" | "desc";

@customElement("playlist-editor")
export class PlaylistEditor extends LitElement {
  @state() private filterText = "";
  @state() private sortField: SortField = "title";
  @state() private sortDir: SortDir = "asc";
  @state() private contextMenuSong: Song | null = null;
  @state() private contextMenuPos = { x: 0, y: 0 };

  connectedCallback() {
    super.connectedCallback();
    callerBuddy.state.addEventListener(StateEvents.SONGS_LOADED, this.refresh);
    callerBuddy.state.addEventListener(StateEvents.PLAYLIST_CHANGED, this.refresh);
    document.addEventListener("keydown", this._boundKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this._boundKeydown);
    callerBuddy.state.removeEventListener(StateEvents.SONGS_LOADED, this.refresh);
    callerBuddy.state.removeEventListener(StateEvents.PLAYLIST_CHANGED, this.refresh);
  }

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

  render() {
    const songs = this.getFilteredSongs();
    const playlist = callerBuddy.state.playlist;

    return html`
      <div class="editor" @click=${this.closeContextMenu}>
        <!-- Left: Playlist -->
        <aside class="playlist-panel">
          <h2>Playlist</h2>
          ${playlist.length === 0
            ? html`<p class="muted">No songs in playlist. Right-click or use
                the + button to add songs.</p>`
            : html`
                <ol class="playlist-list">
                  ${playlist.map(
                    (song, i) => html`
                      <li class="playlist-item">
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

        <!-- Right: Song browser -->
        <section class="browser-panel">
          <div class="browser-toolbar">
            <input
              type="text"
              class="filter-input"
              placeholder="Filter songs by title, label, or category…"
              .value=${this.filterText}
              @input=${this.onFilterInput}
              @keydown=${this.onFilterKeydown}
            />
            <span class="song-count">${songs.length} songs</span>
          </div>

          <div class="table-wrapper">
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
                ${songs.map(
                  (song) => html`
                    <tr
                      @contextmenu=${(e: MouseEvent) => this.onRowContextMenu(e, song)}
                      @dblclick=${() => this.addToPlaylist(song)}
                      title="Double-click or right-click to add to playlist"
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
            ${songs.length === 0
              ? html`<p class="muted table-empty">
                  ${this.filterText
                    ? "No songs match the filter."
                    : "No songs found. Make sure your CallerBuddyRoot folder contains MP3 files."}
                </p>`
              : nothing}
          </div>
        </section>

        <!-- Context menu -->
        ${this.contextMenuSong
          ? html`
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
            `
          : nothing}
      </div>
    `;
  }

  // -- Filtering and sorting ------------------------------------------------

  private getFilteredSongs(): Song[] {
    let songs = [...callerBuddy.state.songs];

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

  // -- Playlist operations --------------------------------------------------

  private addToPlaylist(song: Song) {
    callerBuddy.state.addToPlaylist(song);
  }

  /**
   * Single-song workflow shortcut: add to playlist and immediately play.
   * See CallerBuddySpec.md §"Single song Workflow".
   */
  private async playSongNow(song: Song) {
    callerBuddy.state.addToPlaylist(song);
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

  // -- Context menu ---------------------------------------------------------

  private onRowContextMenu(e: MouseEvent, song: Song) {
    e.preventDefault();
    this.contextMenuSong = song;
    this.contextMenuPos = { x: e.clientX, y: e.clientY };
  }

  private closeContextMenu() {
    this.contextMenuSong = null;
  }

  private addToPlaylistFromCtx(position: "start" | "end") {
    if (!this.contextMenuSong) return;
    if (position === "start") {
      callerBuddy.state.insertAtStartOfPlaylist(this.contextMenuSong);
    } else {
      callerBuddy.state.addToPlaylist(this.contextMenuSong);
    }
    this.contextMenuSong = null;
  }

  private async playSongFromCtx() {
    if (!this.contextMenuSong) return;
    const song = this.contextMenuSong;
    this.contextMenuSong = null;
    await this.playSongNow(song);
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
      width: 260px;
      min-width: 200px;
      border-right: 1px solid var(--cb-border);
      display: flex;
      flex-direction: column;
      padding: 12px;
      background: var(--cb-panel-bg);
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
      gap: 8px;
      margin-top: 8px;
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
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "playlist-editor": PlaylistEditor;
  }
}
