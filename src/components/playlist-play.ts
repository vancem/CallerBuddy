/**
 * Playlist playback view.
 *
 * Shows the playlist with selection highlighting, break timer, and clock.
 * Played songs show a checked checkbox. The selected song defaults to the first
 * unplayed song; clicking a song overrides the selection. ArrowUp/ArrowDown
 * move the selection; Home/← and End/→ jump to the first/last song. Play/Enter/Space
 * plays the selected song. Delete removes
 * the selected song. M toggles the selected song's played checkbox. B toggles the break timer on/off; S starts/stops
 * the break timer countdown. Esc closes the tab.
 *
 * See CallerBuddySpec.md §"PlaylistPlay UI".
 */

import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { callerBuddy } from "../caller-buddy.js";
import {
  chromeButtonStyles,
  ctxHelpBtnStyles,
} from "../styles/chrome.js";
import { PlaylistReorderController } from "../controllers/playlist-reorder-controller.js";
import { PanelResizeController } from "../controllers/panel-resize-controller.js";
import {
  DEFAULT_BREAK_TIMER_MINUTES,
  DEFAULT_PLAYLIST_PANEL_HEIGHT,
  DEFAULT_PLAYLIST_PANEL_WIDTH,
} from "../models/settings.js";
import { WakeLockService } from "../services/wake-lock.js";
import { StateEvents, TabType } from "../services/app-state.js";
import { isSingingCall } from "../models/song.js";
import { formatCountdown, formatClock } from "../utils/format.js";
import { openHelpSection } from "../utils/ui-help.js";
import {
  HostLayoutResizeController,
  isHostPortraitLayout,
} from "../utils/host-portrait-layout.js";

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

  /** Re-render when host box changes so width/height styles match @container aspect flip. */
  private _hostLayoutRo = new HostLayoutResizeController(this);

  private reorder = new PlaylistReorderController(this, {
    onReorderComplete: () => {
      this.selectedIndex = null;
    },
  });

  /** True when the break timer was running but paused because the window lost focus. */
  private breakPausedByBlur = false;

  private breakWakeLock = new WakeLockService();

  private clockInterval: number | null = null;
  private breakInterval: number | null = null;
  private breakAlarmInterval: number | null = null;
  /** Stops {@link breakAlarmInterval} after {@link breakMinutes} from alarm start. */
  private breakAlarmStopTimeout: number | null = null;

  connectedCallback() {
    super.connectedCallback();
    void this._hostLayoutRo;
    this.breakMinutes = callerBuddy.state.settings.breakTimerMinutes;
    this.resizerX.width =
      callerBuddy.state.settings.playlistPanelWidth ?? DEFAULT_PLAYLIST_PANEL_WIDTH;
    this.resizerY.size =
      callerBuddy.state.settings.playlistPanelHeight ?? DEFAULT_PLAYLIST_PANEL_HEIGHT;
    callerBuddy.state.addEventListener(StateEvents.PLAYLIST_CHANGED, this.refresh);
    callerBuddy.state.addEventListener(StateEvents.SETTINGS_CHANGED, this.onSettingsChanged);
    callerBuddy.state.addEventListener(StateEvents.SONG_ENDED, this.onSongEnded);
    callerBuddy.state.addEventListener(StateEvents.CHANGED, this.refresh);
    document.addEventListener("keydown", this._boundKeydown);
    window.addEventListener("blur", this._boundWindowBlur);
    window.addEventListener("focus", this._boundWindowFocus);
    this.clockInterval = window.setInterval(() => this.updateClock(), 1000);
    this.updateClock();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this._boundKeydown);
    window.removeEventListener("blur", this._boundWindowBlur);
    window.removeEventListener("focus", this._boundWindowFocus);
    callerBuddy.state.removeEventListener(StateEvents.PLAYLIST_CHANGED, this.refresh);
    callerBuddy.state.removeEventListener(StateEvents.SETTINGS_CHANGED, this.onSettingsChanged);
    callerBuddy.state.removeEventListener(StateEvents.SONG_ENDED, this.onSongEnded);
    callerBuddy.state.removeEventListener(StateEvents.CHANGED, this.refresh);
    if (this.clockInterval !== null) clearInterval(this.clockInterval);
    this.stopBreakTimer();
    this.breakWakeLock.dispose();
  }

  private _boundKeydown = (e: KeyboardEvent) => this.onKeydown(e);

  private _boundWindowBlur = () => {
    if (this.breakTimerRunning && this.breakInterval !== null) {
      this.pauseBreakTimer();
      this.breakPausedByBlur = true;
    }
  };

  private _boundWindowFocus = () => {
    if (this.breakPausedByBlur) {
      this.breakPausedByBlur = false;
      this.resumeBreakTimer();
    }
  };

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
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "b") {
      e.preventDefault();
      this.toggleBreakTimerEnabled();
      return;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      this.onBreakStartStopClick();
      return;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "m") {
      e.preventDefault();
      this.toggleSelectedPlayed();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      this.moveSelection(e.key === "ArrowDown" ? 1 : -1, e);
      return;
    }
    if (
      e.key === "Home" ||
      e.key === "ArrowLeft" ||
      e.key === "End" ||
      e.key === "ArrowRight"
    ) {
      this.jumpSelection(
        e.key === "Home" || e.key === "ArrowLeft" ? "first" : "last",
        e,
      );
      return;
    }
    if (e.key === "Delete") {
      const idx = this.getSelectedIndex();
      if (idx < 0) return;
      e.preventDefault();
      this.onRemovePlaylistItem(idx);
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
    this.resizerX.width =
      callerBuddy.state.settings.playlistPanelWidth ?? DEFAULT_PLAYLIST_PANEL_WIDTH;
    this.resizerY.size =
      callerBuddy.state.settings.playlistPanelHeight ?? DEFAULT_PLAYLIST_PANEL_HEIGHT;
    this.breakMinutes = callerBuddy.state.settings.breakTimerMinutes;
    this.requestUpdate();
  };

  /** Remove a song from the shared playlist; keep selection on a nearby row. */
  private onRemovePlaylistItem(index: number): void {
    const playlist = callerBuddy.state.playlist;
    if (index < 0 || index >= playlist.length) return;

    const selected = this.getSelectedIndex();
    const nextLength = playlist.length - 1;

    if (selected === index) {
      this.selectedIndex =
        nextLength === 0 ? null : Math.min(index, nextLength - 1);
      queueMicrotask(() => this.scrollSelectedItemIntoView());
    } else if (this.selectedIndex !== null && this.selectedIndex > index) {
      this.selectedIndex = this.selectedIndex - 1;
    }

    callerBuddy.state.removeFromPlaylist(index);
  }

  /** The effective selected index: user override or first unplayed. */
  private getSelectedIndex(): number {
    if (this.selectedIndex !== null) return this.selectedIndex;
    const playlist = callerBuddy.state.playlist;
    const i = playlist.findIndex((s) => !callerBuddy.state.isPlaylistEntryPlayed(s));
    return i >= 0 ? i : -1; // -1 = all played
  }

  /** Move keyboard selection up or down in the playlist. */
  private moveSelection(delta: 1 | -1, e: KeyboardEvent) {
    const playlist = callerBuddy.state.playlist;
    if (playlist.length === 0) return;
    let idx = this.getSelectedIndex();
    if (idx < 0) {
      idx = delta > 0 ? 0 : playlist.length - 1;
    } else {
      idx = Math.min(playlist.length - 1, Math.max(0, idx + delta));
    }
    this.setKeyboardSelection(idx, e);
  }

  /** Jump keyboard selection to the first or last playlist row. */
  private jumpSelection(which: "first" | "last", e: KeyboardEvent) {
    const playlist = callerBuddy.state.playlist;
    if (playlist.length === 0) return;
    this.setKeyboardSelection(which === "first" ? 0 : playlist.length - 1, e);
  }

  private setKeyboardSelection(index: number, e: KeyboardEvent) {
    e.preventDefault();
    this.selectedIndex = index;
    queueMicrotask(() => this.scrollSelectedItemIntoView());
  }

  private scrollSelectedItemIntoView() {
    const idx = this.getSelectedIndex();
    if (idx < 0) return;
    const items = this.renderRoot.querySelectorAll(".pl-item");
    (items[idx] as HTMLElement | undefined)?.scrollIntoView({
      block: "nearest",
      behavior: "auto",
    });
  }

  /** Toggle the selected playlist row's played checkbox without starting playback. */
  private toggleSelectedPlayed() {
    const playlist = callerBuddy.state.playlist;
    const idx = this.getSelectedIndex();
    if (idx < 0 || idx >= playlist.length) return;
    const song = playlist[idx];
    callerBuddy.state.setSongPlayed(song, !callerBuddy.state.isPlaylistEntryPlayed(song));
  }

  render() {
    const playlist = callerBuddy.state.playlist;
    const isPlayingSong = callerBuddy.state.currentSong !== null;
    const isInactive = isPlayingSong || this.isStartingPlayback;
    const sel = this.getSelectedIndex();
    const isPortrait = isHostPortraitLayout(this);
    const playlistPanelStyle = isPortrait
      ? `height: ${this.resizerY.size}px`
      : `width: ${this.resizerX.width}px`;

    return html`
      <div class="play-view ${isInactive ? "inactive" : ""}">
        <aside class="playlist-panel" style="${playlistPanelStyle}">
          <div class="panel-heading">
            <h2>Performing Playlist</h2>
            <button
              class="ctx-help-btn"
              title="Help for the whole Now Playing page"
              @click=${() => openHelpSection("now-playing")}
            >?</button>
          </div>
          ${playlist.length === 0
            ? html`<div class="empty-playlist">
                <p class="muted">
                  No songs in playlist. Add songs in the Playlist Editor, then
                  press Play (or &lt;Enter&gt;).
                </p>
              </div>`
            : html`
                <div class="playlist-body">
                  <ol
                    class="playlist-list"
                    @dragenter=${this.reorder.onDragEnter}
                    @dragover=${this.reorder.onPlaylistContainerDragOver}
                    @dragleave=${this.reorder.onPlaylistDragLeave}
                    @drop=${this.reorder.onPlaylistDrop}
                  >
                    ${playlist.map((song, i) => {
                      const played = callerBuddy.state.isPlaylistEntryPlayed(song);
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
                              title=${played ? "Mark as unplayed (M)" : "Mark as played (M)"}
                              @change=${() =>
                                callerBuddy.state.setSongPlayed(song, !played)}
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
                  <div class="playlist-shortcut-hint" aria-hidden="true">
                    <p class="muted">Type &lt;Enter&gt; to play next song</p>
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
            <button
              type="button"
              class="close-tab-btn"
              title="Close Now Playing (Esc)"
              @click=${this.onCloseNowPlayingTab}
            >
              Close
            </button>
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

        <!-- Right: Break timer and clock -->
        <section class="info-panel">
          <div class="clock-block">
            <div class="clock-display">
              <span class="clock-label">Time:</span>
              <span class="clock-value">${this.clockTime}</span>
            </div>
            <div class="last-song time-row">
              <span class="time-label" title="The clock time the last song ended (break started)">Last Song:</span>
              <span class="time-value">${this.formatLastSongEnded()}</span>
            </div>
          </div>

          <div class="break-section">
            <h3>Break Timer</h3>
            <div class="break-controls">
              <div class="break-toggle-row">
                <label class="break-toggle"
                  title="When enabled, plays a chime at zero and every 30 sec thereafter (B)">
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
                />
              </div>
              <div class="countdown time-row ${this.breakTimerRunning ? "" : "countdown-idle"}">
                <span class="time-label">Time left:</span>
                <span class="time-value ${this.breakTimerRunning && this.breakCountdown <= 0 ? "alarm" : ""}">
                 ${this.breakTimerRunning
                    ? formatCountdown(this.breakCountdown)
                    : formatCountdown(Math.round(this.breakMinutes * 60))}
                </span>
              </div>
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
      await callerBuddy.openSongPlay(song);
      if (callerBuddy.state.currentSong !== null) {
        callerBuddy.state.markSongPlayed(song);
        this.selectedIndex = null; // reset to auto-select next unplayed
      }
    } finally {
      this.isStartingPlayback = false;
      document.body.style.cursor = prevCursor;
    }
  }

  private onSongEnded = () => {
    this.startBreakTimer();
  };

  private resetPlayedSongs() {
    this.stopBreakTimer();
    callerBuddy.state.resetPlayedSongs();
    this.selectedIndex = null; // revert to default (first unplayed)
    this.refresh();
  }

  /** Same as closing the "Now Playing" tab from the tab bar or pressing Esc. */
  private onCloseNowPlayingTab() {
    callerBuddy.state.closeTabByType(TabType.PlaylistPlay);
  }

  // -- Break timer ----------------------------------------------------------

  private toggleBreakTimer(e: Event) {
    this.setBreakTimerEnabled((e.target as HTMLInputElement).checked);
  }

  private toggleBreakTimerEnabled() {
    this.setBreakTimerEnabled(!this.breakTimerEnabled);
  }

  private setBreakTimerEnabled(enabled: boolean) {
    if (this.breakTimerEnabled === enabled) return;
    this.breakTimerEnabled = enabled;
    if (!enabled) {
      this.stopBreakAlarm();
    } else if (this.breakTimerRunning && this.breakCountdown <= 0) {
      this.playBreakAlarm();
    }
  }

  private onBreakStartStopClick() {
    if (this.breakTimerRunning) {
      this.stopBreakTimer();
    } else {
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
    this.breakPausedByBlur = false;
    this.startBreakTick();
    void this.breakWakeLock.acquire();
  }

  private startBreakTick() {
    if (this.breakInterval !== null) return;
    this.breakInterval = window.setInterval(() => {
      this.breakCountdown--;
      if (this.breakCountdown === 0 && this.breakTimerEnabled) {
        this.playBreakAlarm();
      }
    }, 1000);
  }

  private stopBreakTimer() {
    this.breakTimerRunning = false;
    this.breakPausedByBlur = false;
    if (this.breakInterval !== null) {
      clearInterval(this.breakInterval);
      this.breakInterval = null;
    }
    this.stopBreakAlarm();
    void this.breakWakeLock.release();
  }

  private stopBreakAlarm() {
    if (this.breakAlarmInterval !== null) {
      clearInterval(this.breakAlarmInterval);
      this.breakAlarmInterval = null;
    }
    if (this.breakAlarmStopTimeout !== null) {
      clearTimeout(this.breakAlarmStopTimeout);
      this.breakAlarmStopTimeout = null;
    }
  }

  /** Pause the break timer tick without resetting countdown (used on window blur). */
  private pauseBreakTimer() {
    if (this.breakInterval !== null) {
      clearInterval(this.breakInterval);
      this.breakInterval = null;
    }
    this.stopBreakAlarm();
  }

  /** Resume the break timer tick from where it left off (used on window focus). */
  private resumeBreakTimer() {
    if (!this.breakTimerRunning || this.breakInterval !== null) return;
    this.startBreakTick();
  }

  private playBreakAlarm() {
    if (!this.breakTimerEnabled) return;
    callerBuddy.audio.playBeep();
    // Replay every 30 seconds; stop after break-length wall time so it cannot run forever.
    this.breakAlarmInterval = window.setInterval(() => {
      callerBuddy.audio.playBeep();
    }, 30_000);
    if (this.breakAlarmStopTimeout !== null) {
      clearTimeout(this.breakAlarmStopTimeout);
    }
    const capMs = Math.max(0, Math.round(this.breakMinutes * 60 * 1000));
    this.breakAlarmStopTimeout = window.setTimeout(() => {
      this.breakAlarmStopTimeout = null;
      if (this.breakAlarmInterval !== null) {
        clearInterval(this.breakAlarmInterval);
        this.breakAlarmInterval = null;
      }
    }, capMs);
  }

  // -- Clock ----------------------------------------------------------------

  private updateClock() {
    this.clockTime = formatClock();
  }

  /** HH:MM when the last qualifying play ended, or em dash if none yet. */
  private formatLastSongEnded(): string {
    const ms = callerBuddy.state.lastSongEndedMs;
    return ms !== null ? formatClock(ms) : "—";
  }

  static styles = [
    ctxHelpBtnStyles,
    chromeButtonStyles,
    css`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
      /* Viewport aspect MQs see bogus sizes on Samsung WebAPK; use host box. */
      container-type: size;
      container-name: cb-playlist-play;
    }

    .play-view {
      display: flex;
      height: 100%;
      min-height: 0;
      position: relative;
    }

    .play-view.inactive {
      opacity: 0.5;
      pointer-events: none;
    }

    .play-view.inactive .playlist-panel {
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
      background: var(--cb-now-playing-panel-bg);
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

    .empty-playlist {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 60px;
      margin: 4px 0;
    }

    .empty-playlist .muted {
      margin: 0;
      padding: 12px;
      text-align: center;
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
      padding: 0;
      list-style: none;
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
      width: 1rem;
      height: 1rem;
      cursor: pointer;
    }

    .pl-type {
      width: 1rem;
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

    .play-actions button {
      padding: 4px 10px;
      font-size: 0.9rem;
      min-width: 4.5em;
      box-sizing: border-box;
    }

    .play-actions button:not(.primary) {
      border-radius: 6px;
      border: 1px solid var(--cb-btn-border);
      background: var(--cb-btn-bg);
      color: var(--cb-fg);
      cursor: pointer;
    }

    .play-actions button:not(.primary):hover {
      background: var(--cb-btn-bg-hover);
    }

    /* -- Info panel --------------------------------------------------------- */

    .info-panel {
      flex: 1;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .clock-block {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .clock-display {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }

    .clock-label {
      font-size: 0.9rem;
      color: var(--cb-fg-secondary);
    }

    .clock-value {
      font-size: 2rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .last-song.time-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .last-song .time-label {
      font-size: 0.9rem;
      color: var(--cb-fg-secondary);
    }

    .last-song .time-value {
      font-variant-numeric: tabular-nums;
      font-size: 1rem;
      color: var(--cb-fg-secondary);
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
      border: 1px solid var(--cb-btn-border);
      background: var(--cb-btn-bg);
      color: var(--cb-fg);
      cursor: pointer;
    }

    .break-start-stop:hover:not(:disabled) {
      background: var(--cb-btn-bg-hover);
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
      width: 3.75rem;
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

    .playing-info {
      color: var(--cb-fg-secondary);
      font-style: italic;
    }

    /* Narrow layout: playlist on top when host is taller than wide (not viewport MQ). */

    @container cb-playlist-play (max-aspect-ratio: 6/5) {
      .play-view {
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

      .info-panel {
        flex: 2 1 0;
        min-height: 0;
        padding: 12px;
        gap: 16px;
      }

      .resizer {
        width: 100%;
        height: 6px;
        cursor: row-resize;
        border-left: none;
        border-top: 1px solid var(--cb-border);
        touch-action: none;
      }
    }
  `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "playlist-play": PlaylistPlay;
  }
}
