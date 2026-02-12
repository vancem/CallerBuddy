/**
 * Playlist playback view.
 *
 * Shows the playlist with selection highlighting, break timer, and clock.
 * Played songs show a checked checkbox. The selected song defaults to the first
 * unplayed song; clicking a song overrides the selection. Play/Enter/Space
 * plays the selected song. S starts/stops the break timer.
 *
 * See CallerBuddySpec.md §"PlaylistPlay UI".
 */

import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { callerBuddy } from "../caller-buddy.js";
import { DEFAULT_BREAK_TIMER_MINUTES } from "../models/settings.js";
import { StateEvents } from "../services/app-state.js";
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

  // Break timer
  @state() private breakTimerEnabled = true;
  @state() private breakMinutes = DEFAULT_BREAK_TIMER_MINUTES;
  @state() private breakCountdown = 0; // seconds remaining
  @state() private breakTimerRunning = false;

  // Clock
  @state() private clockTime = "";

  private clockInterval: number | null = null;
  private breakInterval: number | null = null;
  private breakAlarmInterval: number | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.breakMinutes = callerBuddy.state.settings.breakTimerMinutes;
    callerBuddy.state.addEventListener(StateEvents.PLAYLIST_CHANGED, this.refresh);
    callerBuddy.state.addEventListener(StateEvents.SONG_ENDED, this.onSongEnded);
    document.addEventListener("keydown", this._boundKeydown);
    this.clockInterval = window.setInterval(() => this.updateClock(), 1000);
    this.updateClock();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this._boundKeydown);
    callerBuddy.state.removeEventListener(StateEvents.PLAYLIST_CHANGED, this.refresh);
    callerBuddy.state.removeEventListener(StateEvents.SONG_ENDED, this.onSongEnded);
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
    if (callerBuddy.state.playlist.length === 0 || callerBuddy.state.currentSong !== null) return;
    e.preventDefault();
    this.playSelected();
  }

  private refresh = () => {
    this.requestUpdate();
  };

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
    const sel = this.getSelectedIndex();
    const playedPaths = callerBuddy.state.getPlayedSongPaths();

    return html`
      <div class="play-view ${isPlayingSong ? "inactive" : ""}">
        <aside class="playlist-panel">
          <h2>Playlist</h2>
          ${playlist.length === 0
            ? html`<p class="muted">Playlist is empty.</p>`
            : html`
                <ol class="playlist-list">
                  ${playlist.map((song, i) => {
                    const played = playedPaths.has(song.musicFile);
                    return html`
                      <li
                        class="pl-item ${i === sel ? "selected" : ""}"
                        @click=${() => (this.selectedIndex = i)}
                        @dblclick=${() => this.playAt(i)}
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
                          >${isSingingCall(song) ? "♪" : "♫"}</span
                        >
                        <span class="pl-title">${song.title}</span>
                      </li>
                    `;
                  })}
                </ol>
              `}

          <div class="play-actions">
            <button
              class="primary"
              ?disabled=${playlist.length === 0 || isPlayingSong}
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
                <label class="break-toggle">
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
            </div>
          </div>

          ${isPlayingSong
            ? html`<p class="playing-info">A song is currently playing…</p>`
            : nothing}
        </section>
      </div>
    `;
  }

  // -- Song playback --------------------------------------------------------

  /** Play song at a specific index (double-click). */
  private playAt(index: number) {
    if (callerBuddy.state.currentSong !== null) return;
    this.selectedIndex = index;
    this.playSelected();
  }

  private async playSelected() {
    const playlist = callerBuddy.state.playlist;
    const idx = this.getSelectedIndex();
    if (idx < 0 || idx >= playlist.length) return;

    this.stopBreakTimer();
    const song = playlist[idx];
    callerBuddy.state.markSongPlayed(song.musicFile);
    this.selectedIndex = null; // reset to auto-select next unplayed

    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "wait";
    try {
      await callerBuddy.openSongPlay(song);
    } finally {
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
    // Replay every 20 seconds per spec
    this.breakAlarmInterval = window.setInterval(() => {
      callerBuddy.audio.playBeep();
    }, 20_000);
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

    /* -- Playlist panel ---------------------------------------------------- */

    .playlist-panel {
      width: 280px;
      min-width: 220px;
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
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .play-actions {
      margin-top: 12px;
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .play-actions button:not(.primary) {
      border-radius: 6px;
      border: 1px solid var(--cb-border);
      padding: 8px 16px;
      font-size: 0.9rem;
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

    .playing-info {
      color: var(--cb-fg-secondary);
      font-style: italic;
    }

    /* -- Shared styles ------------------------------------------------------ */

    .primary {
      border-radius: 6px;
      border: 1px solid transparent;
      padding: 8px 20px;
      font-size: 1rem;
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
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "playlist-play": PlaylistPlay;
  }
}
