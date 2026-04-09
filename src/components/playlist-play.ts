/**
 * Playlist playback view.
 *
 * Shows the playlist with selection highlighting, break timer, and clock.
 * Played songs show a checked checkbox. The selected song defaults to the first
 * unplayed song; clicking a song overrides the selection. Play/Enter/Space
 * plays the selected song. S starts/stops the break timer. Esc closes the tab.
 *
 * See CallerBuddySpec.md §"PlaylistPlay UI".
 */

import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { callerBuddy } from "../caller-buddy.js";
import { PlaylistReorderController } from "../controllers/playlist-reorder-controller.js";
import {
  DEFAULT_BREAK_TIMER_MINUTES,
  DEFAULT_PLAYLIST_PANEL_WIDTH,
} from "../models/settings.js";

const MIN_PLAYLIST_WIDTH = 180;
const MAX_PLAYLIST_WIDTH = 500;
import { StateEvents, TabType } from "../services/app-state.js";
import { isSingingCall } from "../models/song.js";
import { formatCountdown, formatClock } from "../utils/format.js";

@customElement("playlist-play")
export class PlaylistPlay extends LitElement {
  /** Whether this component's tab is currently visible. Set by app-shell.
   *  Used to suppress keyboard shortcuts when the tab is in the background
   *  (this component is kept alive across tab switches for its timers). */
  @property({ type: Boolean }) active = false;

  /** User-clicked override; null = default to first unplayed. */
  @state() private selectedIndex: number | null = null;

  /** True from the moment Play is clicked until song play view is ready.
   *  Used to grey out the playlist immediately for feedback, before async work completes. */
  @state() private isStartingPlayback = false;

  // Break timer
  @state() private breakTimerEnabled = true;
  @state() private breakMinutes = DEFAULT_BREAK_TIMER_MINUTES;
  @state() private breakCountdown = 0; // seconds remaining
  @state() private breakTimerRunning = false;

  // Clock
  @state() private clockTime = "";

  /** Playlist panel width (from settings, updated on resize). */
  @state() private playlistWidth = DEFAULT_PLAYLIST_PANEL_WIDTH;

  private reorder = new PlaylistReorderController(this, {
    onReorderComplete: () => {
      this.selectedIndex = null;
    },
  });

  private clockInterval: number | null = null;
  private breakInterval: number | null = null;
  private breakAlarmInterval: number | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.breakMinutes = callerBuddy.state.settings.breakTimerMinutes;
    this.playlistWidth =
      callerBuddy.state.settings.playlistPanelWidth ?? DEFAULT_PLAYLIST_PANEL_WIDTH;
    callerBuddy.state.addEventListener(StateEvents.PLAYLIST_CHANGED, this.refresh);
    callerBuddy.state.addEventListener(StateEvents.SETTINGS_CHANGED, this.onSettingsChanged);
    callerBuddy.state.addEventListener(StateEvents.SONG_ENDED, this.onSongEnded);
    document.addEventListener("keydown", this._boundKeydown);
    this.clockInterval = window.setInterval(() => this.updateClock(), 1000);
    this.updateClock();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this._boundKeydown);
    callerBuddy.state.removeEventListener(StateEvents.PLAYLIST_CHANGED, this.refresh);
    callerBuddy.state.removeEventListener(StateEvents.SETTINGS_CHANGED, this.onSettingsChanged);
    callerBuddy.state.removeEventListener(StateEvents.SONG_ENDED, this.onSongEnded);
    this.stopResize();
    if (this.clockInterval !== null) clearInterval(this.clockInterval);
    this.stopBreakTimer();
  }

  private _boundKeydown = (e: KeyboardEvent) => this.onKeydown(e);

  private onKeydown(e: KeyboardEvent) {
    // This component stays alive while other tabs are active.
    // Only handle keys when our tab is the active one.
    if (!this.active) return;

    const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (inInput) return;

    if (e.key === "Escape") {
      e.preventDefault();
      this.onCloseNowPlayingTab();
      return;
    }

    if (e.ctrlKey && e.key === "r") {
      e.preventDefault();
      this.resetPlayedSongs();
      return;
    }
    if (e.key.toLowerCase() === "s" && this.breakTimerEnabled) {
      e.preventDefault();
      this.onBreakStartStopClick();
      return;
    }
    if (e.key !== "Enter" && e.key !== " ") return;
    if (callerBuddy.state.playlist.length === 0 || callerBuddy.state.currentSong !== null || this.isStartingPlayback) return;
    e.preventDefault();
    this.playSelected();
  }

  private refresh = () => {
    this.requestUpdate();
  };

  private onSettingsChanged = () => {
    this.playlistWidth =
      callerBuddy.state.settings.playlistPanelWidth ?? DEFAULT_PLAYLIST_PANEL_WIDTH;
    this.breakMinutes = callerBuddy.state.settings.breakTimerMinutes;
    this.requestUpdate();
  };

  /** Remove a song from the shared playlist; keep selection index consistent with the new list. */
  private onRemovePlaylistItem(index: number): void {
    const playlist = callerBuddy.state.playlist;
    if (index < 0 || index >= playlist.length) return;
    const sel = this.selectedIndex;
    if (sel !== null) {
      if (sel === index) {
        this.selectedIndex = null;
      } else if (sel > index) {
        this.selectedIndex = sel - 1;
      }
    }
    callerBuddy.state.removeFromPlaylist(index);
  }

  /** The effective selected index: user override or first unplayed. */
  private getSelectedIndex(): number {
    if (this.selectedIndex !== null) return this.selectedIndex;
    const playlist = callerBuddy.state.playlist;
    const played = callerBuddy.state.getPlayedSongPaths();
    const i = playlist.findIndex((s) => !played.has(s.musicFile));
    return i >= 0 ? i : -1; // -1 = all played
  }

  render() {
    const playlist = callerBuddy.state.playlist;
    const isPlayingSong = callerBuddy.state.currentSong !== null;
    const isInactive = isPlayingSong || this.isStartingPlayback;
    const sel = this.getSelectedIndex();
    const playedPaths = callerBuddy.state.getPlayedSongPaths();

    return html`
      <div class="play-view ${isInactive ? "inactive" : ""}">
        <aside class="playlist-panel" style="width: ${this.playlistWidth}px">
          <h2>Playlist</h2>
          ${playlist.length === 0
            ? html`<p class="muted">Playlist is empty.</p>`
            : html`
                <ol
                  class="playlist-list"
                  @dragenter=${this.reorder.onDragEnter}
                  @dragover=${this.reorder.onPlaylistContainerDragOver}
                  @dragleave=${this.reorder.onPlaylistDragLeave}
                  @drop=${this.reorder.onPlaylistDrop}
                >
                  ${playlist.map((song, i) => {
                    const played = playedPaths.has(song.musicFile);
                    const r = this.reorder;
                    return html`
                      <li
                        class="pl-item ${i === sel ? "selected" : ""}
                          ${r.draggingPlaylistIndex === i ? "dragging" : ""}
                          ${r.dragOverIndex === i && r.dropPosition === "above" ? "drop-indicator-above" : ""}
                          ${r.dragOverIndex === i && r.dropPosition === "below" ? "drop-indicator-below" : ""}"
                        draggable="true"
                        @click=${() => (this.selectedIndex = i)}
                        @dblclick=${() => this.playAt(i)}
                        @dragstart=${(e: DragEvent) => r.onPlaylistItemDragStart(e, i)}
                        @dragend=${r.onDragEnd}
                        @dragenter=${r.onDragEnter}
                        @dragover=${(e: DragEvent) => r.onPlaylistDragOver(e, i)}
                      >
                        <label class="pl-check" @click=${(e: Event) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            .checked=${played}
                            title=${played ? "Mark as unplayed" : "Mark as played"}
                            @change=${() =>
                              callerBuddy.state.setSongPlayed(song.musicFile, !played)}
                          />
                        </label>
                        <span class="pl-type ${isSingingCall(song) ? "singing" : "patter"}"
                          title="${isSingingCall(song) ? "Singing call" : "Patter (no lyrics)"}"
                          >${isSingingCall(song) ? "♪" : "♫"}</span
                        >
                        <span class="pl-title">${song.title}</span>
                        <button
                          type="button"
                          class="icon-btn"
                          title="Remove from playlist"
                          @click=${(e: Event) => {
                            e.stopPropagation();
                            this.onRemovePlaylistItem(i);
                          }}
                        >
                          ×
                        </button>
                      </li>
                    `;
                  })}
                </ol>
              `}

          <div class="play-actions">
            <button
              class="primary"
              ?disabled=${playlist.length === 0 || isInactive}
              title="Play selected song (Enter / Space)"
              @click=${() => this.playSelected()}
            >
              ▶ Play
            </button>
            <button
              title="Reset played status for all songs (Ctrl+R)"
              @click=${() => this.resetPlayedSongs()}
            >
              ⟲ Reset
            </button>
          </div>
        </aside>
        <div
          class="resizer"
          title="Drag to resize playlist"
          @mousedown=${this.onResizerMouseDown}
        ></div>

        <!-- Right: Break timer and clock -->
        <section class="info-panel">
          <div class="clock-display">
            <span class="clock-label">Time</span>
            <span class="clock-value">${this.clockTime}</span>
          </div>

          <div class="break-section ${this.breakTimerEnabled ? "" : "timer-disabled"}">
            <h3>Break Timer</h3>
            <div class="break-controls">
              <div class="break-toggle-row">
                <label class="break-toggle"
                  title="When enabled, the break timer counts down automatically after each song ends">
                  <input
                    type="checkbox"
                    .checked=${this.breakTimerEnabled}
                    @change=${this.toggleBreakTimer}
                  />
                  Enabled
                </label>
                <button
                  type="button"
                  class="break-start-stop"
                  title="Start or stop break timer (S)"
                  ?disabled=${!this.breakTimerEnabled}
                  @click=${this.onBreakStartStopClick}
                >
                  ${this.breakTimerRunning ? "Stop" : "Start"}
                </button>
              </div>
              <div class="break-input-row">
                <label>Minutes:</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="any"
                  .value=${String(this.breakMinutes)}
                  @change=${this.onBreakMinutesChange}
                  @keydown=${this.onBreakMinutesKeydown}
                  ?disabled=${!this.breakTimerEnabled}
                />
              </div>
              <div class="countdown time-row ${this.breakTimerRunning && this.breakTimerEnabled ? "" : "countdown-idle"}">
                <span class="time-label">Time left</span>
                <span class="time-value ${this.breakTimerRunning && this.breakCountdown <= 0 ? "alarm" : ""}">
                 ${this.breakTimerRunning && this.breakTimerEnabled
                    ? formatCountdown(this.breakCountdown)
                    : formatCountdown(Math.round(this.breakMinutes * 60))}
                </span>
              </div>
              <button
                type="button"
                class="close-tab-btn"
                title="Close Now Playing (Esc)"
                @click=${this.onCloseNowPlayingTab}
              >
                Close
              </button>
            </div>
          </div>

          ${isInactive
            ? html`<p class="playing-info">${isPlayingSong ? "A song is currently playing…" : "Loading…"}</p>`
            : nothing}
        </section>
      </div>
    `;
  }

  // -- Song playback --------------------------------------------------------

  /** Play song at a specific index (double-click). */
  private playAt(index: number) {
    if (callerBuddy.state.currentSong !== null || this.isStartingPlayback) return;
    this.selectedIndex = index;
    this.playSelected();
  }

  private async playSelected() {
    const playlist = callerBuddy.state.playlist;
    const idx = this.getSelectedIndex();
    if (idx < 0 || idx >= playlist.length) {
      // No song to play (e.g. all songs already played) — play error beep
      callerBuddy.audio.playErrorBeep();
      return;
    }

    this.isStartingPlayback = true;
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "wait";

    try {
      this.stopBreakTimer();
      const song = playlist[idx];
      callerBuddy.state.markSongPlayed(song.musicFile);
      this.selectedIndex = null; // reset to auto-select next unplayed
      await callerBuddy.openSongPlay(song);
    } finally {
      this.isStartingPlayback = false;
      document.body.style.cursor = prevCursor;
    }
  }

  private onSongEnded = () => {
    if (this.breakTimerEnabled) {
      this.startBreakTimer();
    }
  };

  private resetPlayedSongs() {
    this.stopBreakTimer();
    callerBuddy.state.resetPlayedSongs();
    this.selectedIndex = null; // revert to default (first unplayed)
    this.refresh();
  }

  /** Same as closing the "Now Playing" tab from the tab bar or pressing Esc. */
  private onCloseNowPlayingTab() {
    const tab = callerBuddy.state.tabs.find((t) => t.type === TabType.PlaylistPlay);
    if (tab) callerBuddy.state.closeTab(tab.id);
  }

  // -- Break timer ----------------------------------------------------------

  private toggleBreakTimer(e: Event) {
    this.breakTimerEnabled = (e.target as HTMLInputElement).checked;
    if (!this.breakTimerEnabled) {
      this.stopBreakTimer();
    }
  }

  private onBreakStartStopClick() {
    if (this.breakTimerRunning) {
      this.stopBreakTimer();
    } else if (this.breakTimerEnabled) {
      this.startBreakTimer();
    }
  }

  /** Handle Enter inside the Minutes input: commit, stop timer, and consume
   *  the event so it doesn't bubble up to the page-level keydown handler. */
  private onBreakMinutesKeydown(e: KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.stopPropagation();
    // Force the input to fire its change event now
    (e.target as HTMLInputElement).blur();
  }

  private onBreakMinutesChange(e: Event) {
    const v = Number((e.target as HTMLInputElement).value);
    this.breakMinutes = Number.isFinite(v) && v >= 0 ? v : DEFAULT_BREAK_TIMER_MINUTES;
    if (this.breakTimerRunning) {
      this.stopBreakTimer();
    }
    void callerBuddy.updateSetting("breakTimerMinutes", this.breakMinutes);
  }

  private startBreakTimer() {
    this.stopBreakTimer();
    this.breakCountdown = Math.round(this.breakMinutes * 60);
    this.breakTimerRunning = true;
    this.breakInterval = window.setInterval(() => {
      this.breakCountdown--;
      if (this.breakCountdown === 0) {
        this.playBreakAlarm();
      }
    }, 1000);
  }

  private stopBreakTimer() {
    this.breakTimerRunning = false;
    if (this.breakInterval !== null) {
      clearInterval(this.breakInterval);
      this.breakInterval = null;
    }
    if (this.breakAlarmInterval !== null) {
      clearInterval(this.breakAlarmInterval);
      this.breakAlarmInterval = null;
    }
  }

  private playBreakAlarm() {
    callerBuddy.audio.playBeep();
      // Replay every 15 seconds
    this.breakAlarmInterval = window.setInterval(() => {
      callerBuddy.audio.playBeep();
    }, 15_000);
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

  // -- Clock ----------------------------------------------------------------

  private updateClock() {
    this.clockTime = formatClock();
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }

    .play-view {
      display: flex;
      height: 100%;
    }

    .play-view.inactive {
      opacity: 0.5;
      pointer-events: none;
    }

    .play-view.inactive .playlist-panel,
    .play-view.inactive .close-tab-btn {
      pointer-events: auto;
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
      padding: 0;
      list-style: none;
    }

    .pl-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 6px;
      font-size: 0.9rem;
      border-radius: 4px;
      cursor: pointer;
    }

    .pl-item:hover {
      background: var(--cb-hover);
    }

    .pl-item.selected {
      background: var(--cb-accent-subtle);
    }

    .pl-item[draggable="true"] {
      cursor: grab;
    }

    .pl-item.dragging {
      opacity: 0.4;
    }

    .pl-item.drop-indicator-above {
      box-shadow: inset 0 2px 0 0 var(--cb-accent);
    }

    .pl-item.drop-indicator-below {
      box-shadow: inset 0 -2px 0 0 var(--cb-accent);
    }

    .pl-check {
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }

    .pl-check input {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }

    .pl-type {
      width: 16px;
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
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .pl-item .icon-btn {
      flex-shrink: 0;
      background: none;
      border: none;
      color: var(--cb-fg-secondary);
      font-size: 1rem;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      line-height: 1;
    }

    .pl-item .icon-btn:hover {
      color: var(--cb-fg);
      background: var(--cb-hover);
    }

    .play-actions {
      margin-top: 6px;
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .play-actions button {
      padding: 4px 10px;
      font-size: 0.9rem;
      min-width: 4.5em;
      box-sizing: border-box;
    }

    .play-actions button:not(.primary) {
      border-radius: 6px;
      border: 1px solid var(--cb-border);
      background: var(--cb-input-bg);
      color: var(--cb-fg);
      cursor: pointer;
    }

    .play-actions button:not(.primary):hover {
      background: var(--cb-hover);
    }

    /* -- Info panel --------------------------------------------------------- */

    .info-panel {
      flex: 1;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .clock-display {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }

    .clock-label {
      font-size: 0.85rem;
      color: var(--cb-fg-secondary);
    }

    .clock-value {
      font-size: 2rem;
      font-weight: 300;
      font-variant-numeric: tabular-nums;
    }

    .break-section h3 {
      margin: 0 0 8px;
      font-size: 0.95rem;
      font-weight: 600;
    }

    .break-controls {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .break-toggle-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .break-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.9rem;
      cursor: pointer;
    }

    .break-start-stop {
      font-size: 0.8rem;
      padding: 4px 10px;
      border-radius: 4px;
      border: 1px solid var(--cb-border);
      background: var(--cb-input-bg);
      color: var(--cb-fg);
      cursor: pointer;
    }

    .break-start-stop:hover:not(:disabled) {
      background: var(--cb-hover);
    }

    .break-start-stop:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .break-input-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9rem;
    }

    .break-section.timer-disabled h3,
    .break-section.timer-disabled .break-input-row,
    .break-section.timer-disabled .countdown {
      opacity: 0.4;
      pointer-events: none;
    }

    .break-section.timer-disabled .break-toggle {
      opacity: 1;
    }

    .break-input-row input {
      width: 60px;
      padding: 4px 8px;
      border: 1px solid var(--cb-border);
      border-radius: 4px;
      background: var(--cb-input-bg);
      color: var(--cb-fg);
      font-size: 0.9rem;
    }

    .countdown.time-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .break-section .time-label {
      width: 60px;
      font-size: 0.9rem;
    }

    .break-section .time-value {
      font-variant-numeric: tabular-nums;
      font-size: 1rem;
    }

    .countdown-idle .time-value {
      color: var(--cb-fg-secondary);
    }

    .break-section .time-value.alarm {
      color: var(--cb-error);
    }

    .close-tab-btn {
      align-self: flex-start;
      margin-top: 4px;
      padding: 6px 14px;
      font-size: 0.9rem;
      border-radius: 6px;
      border: 1px solid var(--cb-border);
      background: var(--cb-input-bg);
      color: var(--cb-fg);
      cursor: pointer;
    }

    .close-tab-btn:hover {
      background: var(--cb-hover);
    }

    .playing-info {
      color: var(--cb-fg-secondary);
      font-style: italic;
    }

    /* -- Shared styles ------------------------------------------------------ */

    .primary {
      border-radius: 6px;
      border: 1px solid transparent;
      padding: 4px 10px;
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

    .muted {
      color: var(--cb-fg-tertiary);
      font-size: 0.85rem;
    }

    /* -- Narrow layout: playlist on top when width <= 1.2× height ---------- */

    @media (max-aspect-ratio: 6/5) {
      .play-view {
        flex-direction: column;
      }

      .playlist-panel {
        width: auto !important;
        min-width: 0;
        max-height: 50vh;
        max-height: 50dvh;
        border-right: none;
        border-bottom: 1px solid var(--cb-border);
      }

      .resizer {
        display: none;
      }

      .info-panel {
        padding: 12px;
        gap: 16px;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "playlist-play": PlaylistPlay;
  }
}
