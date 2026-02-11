/**
 * Playlist playback view.
 *
 * Shows the playlist with a cursor, break timer, and clock. When the user
 * clicks "play" on a song, opens the song-play tab.
 *
 * See CallerBuddySpec.md §"PlaylistPlay UI".
 */

import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { callerBuddy } from "../caller-buddy.js";
import { StateEvents } from "../services/app-state.js";
import { isSingingCall } from "../models/song.js";

@customElement("playlist-play")
export class PlaylistPlay extends LitElement {
  @state() private _tick = 0;

  /** Index of the next song to play (the cursor). */
  @state() private cursorIndex = 0;

  /** Set of indices of songs already played (grayed out). */
  @state() private playedIndices = new Set<number>();

  /** Override: the user clicked a specific song to play next. */
  @state() private selectedIndex: number | null = null;

  // Break timer
  @state() private breakTimerEnabled = true;
  @state() private breakMinutes = 5;
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
    this.advanceCursor();
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
    if (e.key !== "Enter" && e.key !== " ") return;
    const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (inInput) return;
    if (callerBuddy.state.playlist.length === 0 || callerBuddy.state.currentSong !== null) return;
    e.preventDefault();
    this.playSelected();
  }

  private refresh = () => {
    this._tick++;
  };

  render() {
    const playlist = callerBuddy.state.playlist;
    const isPlayingSong = callerBuddy.state.currentSong !== null;
    const effectiveIdx = this.selectedIndex ?? this.cursorIndex;

    return html`
      <div class="play-view ${isPlayingSong ? "inactive" : ""}">
        <!-- Left: Playlist with cursor -->
        <aside class="playlist-panel">
          <h2>Playlist</h2>
          ${playlist.length === 0
            ? html`<p class="muted">Playlist is empty.</p>`
            : html`
                <ol class="playlist-list">
                  ${playlist.map((song, i) => {
                    const played = this.playedIndices.has(i);
                    const isCursor = i === effectiveIdx;
                    return html`
                      <li
                        class="pl-item ${played ? "played" : ""} ${isCursor ? "cursor" : ""}"
                        @click=${() => this.selectSong(i)}
                        @dblclick=${() => this.onPlaySongAt(i)}
                      >
                        <span class="pl-indicator">${isCursor ? "▸" : ""}</span>
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
              title="Play next song (Space)"
              @click=${() => this.playSelected()}
            >
              ▶ Play
            </button>
          </div>
        </aside>

        <!-- Right: Break timer and clock -->
        <section class="info-panel">
          <div class="clock-display">
            <span class="clock-label">Time</span>
            <span class="clock-value">${this.clockTime}</span>
          </div>

          <div class="break-section">
            <h3>Break Timer</h3>
            <div class="break-controls">
              <label class="break-toggle">
                <input
                  type="checkbox"
                  .checked=${this.breakTimerEnabled}
                  @change=${this.toggleBreakTimer}
                />
                Enabled
              </label>
              <div class="break-input-row ${this.breakTimerEnabled ? "" : "disabled"}">
                <label>Minutes:</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  .value=${String(this.breakMinutes)}
                  @change=${this.onBreakMinutesChange}
                  ?disabled=${!this.breakTimerEnabled}
                />
              </div>
              ${this.breakTimerRunning
                ? html`
                    <div class="countdown">
                      <span class="countdown-value ${this.breakCountdown <= 0 ? "alarm" : ""}">
                        ${this.formatCountdown(this.breakCountdown)}
                      </span>
                    </div>
                  `
                : nothing}
            </div>
          </div>

          ${isPlayingSong
            ? html`<p class="playing-info">A song is currently playing…</p>`
            : nothing}
        </section>
      </div>
    `;
  }

  // -- Song selection and playback ------------------------------------------

  private selectSong(index: number) {
    this.selectedIndex = index;
  }

  /** Double-click: play the song at this index (same as selecting and clicking Play). */
  private onPlaySongAt(index: number) {
    if (callerBuddy.state.currentSong !== null) return;
    this.selectSong(index);
    this.playSelected();
  }

  private async playSelected() {
    const playlist = callerBuddy.state.playlist;
    const idx = this.selectedIndex ?? this.cursorIndex;
    if (idx < 0 || idx >= playlist.length) return;

    this.stopBreakTimer();
    const song = playlist[idx];
    this.playedIndices.add(idx);
    this.selectedIndex = null;
    await callerBuddy.openSongPlay(song);
  }

  private onSongEnded = () => {
    this.advanceCursor();
    // Start break timer if enabled
    if (this.breakTimerEnabled) {
      this.startBreakTimer();
    }
  };

  /** Move cursor to the first non-played song. */
  private advanceCursor() {
    const playlist = callerBuddy.state.playlist;
    for (let i = 0; i < playlist.length; i++) {
      if (!this.playedIndices.has(i)) {
        this.cursorIndex = i;
        return;
      }
    }
    this.cursorIndex = playlist.length; // all played
  }

  // -- Break timer ----------------------------------------------------------

  private toggleBreakTimer(e: Event) {
    this.breakTimerEnabled = (e.target as HTMLInputElement).checked;
    if (!this.breakTimerEnabled) {
      this.stopBreakTimer();
    }
  }

  private onBreakMinutesChange(e: Event) {
    this.breakMinutes = Number((e.target as HTMLInputElement).value) || 5;
  }

  private startBreakTimer() {
    this.stopBreakTimer();
    this.breakCountdown = this.breakMinutes * 60;
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
    const now = new Date();
    this.clockTime = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // -- Formatting -----------------------------------------------------------

  private formatCountdown(totalSeconds: number): string {
    const abs = Math.abs(totalSeconds);
    const sign = totalSeconds < 0 ? "-" : "";
    const min = Math.floor(abs / 60);
    const sec = abs % 60;
    return `${sign}${min}:${sec.toString().padStart(2, "0")}`;
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
      border-right: 1px solid var(--cb-border, #333);
      display: flex;
      flex-direction: column;
      padding: 12px;
      background: var(--cb-panel-bg, #1e1e2e);
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
      background: rgba(255, 255, 255, 0.06);
    }

    .pl-item.played {
      opacity: 0.4;
      text-decoration: line-through;
    }

    .pl-item.cursor {
      background: rgba(100, 108, 255, 0.15);
    }

    .pl-indicator {
      width: 16px;
      text-align: center;
      font-size: 0.9rem;
      color: var(--cb-accent, #646cff);
    }

    .pl-type {
      width: 16px;
      text-align: center;
    }

    .pl-type.singing {
      color: #66bbff;
    }

    .pl-type.patter {
      color: #ffaa44;
    }

    .pl-title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .play-actions {
      margin-top: 12px;
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
      color: rgba(255, 255, 255, 0.5);
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

    .break-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.9rem;
      cursor: pointer;
    }

    .break-input-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9rem;
    }

    .break-input-row.disabled {
      opacity: 0.4;
    }

    .break-input-row input {
      width: 60px;
      padding: 4px 8px;
      border: 1px solid var(--cb-border, #555);
      border-radius: 4px;
      background: var(--cb-input-bg, #2a2a3e);
      color: var(--cb-fg, #fff);
      font-size: 0.9rem;
    }

    .countdown-value {
      font-size: 1.8rem;
      font-weight: 300;
      font-variant-numeric: tabular-nums;
    }

    .countdown-value.alarm {
      color: #f66;
    }

    .playing-info {
      color: rgba(255, 255, 255, 0.5);
      font-style: italic;
    }

    /* -- Shared styles ------------------------------------------------------ */

    .primary {
      border-radius: 6px;
      border: 1px solid transparent;
      padding: 8px 20px;
      font-size: 1rem;
      font-weight: 500;
      background: var(--cb-accent, #646cff);
      color: #fff;
      cursor: pointer;
    }

    .primary:hover:not(:disabled) {
      background: #535bf2;
    }

    .primary:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .muted {
      color: rgba(255, 255, 255, 0.4);
      font-size: 0.85rem;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "playlist-play": PlaylistPlay;
  }
}
