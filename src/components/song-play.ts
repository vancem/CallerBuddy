/**
 * Single-song playback view.
 *
 * Layout:
 *  ┌──────────────────────────┬──────────────────────────┐
 *  │  Lyrics (or loop ctrl)   │  Transport controls      │
 *  │                          │  Volume / Pitch / Tempo   │
 *  │                          │  Time info + clock        │
 *  ├──────────────────────────┴──────────────────────────┤
 *  │  Progress slider (7 segments)                       │
 *  └────────────────────────────────────────────────────-┘
 *
 * For patter (no lyrics), the left area shows loop controls and a patter timer.
 *
 * See CallerBuddySpec.md §"playSong UI".
 */

import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { callerBuddy } from "../caller-buddy.js";
import { isSingingCall, isPatter } from "../models/song.js";
import { formatTime, formatCountdown, formatClock } from "../utils/format.js";
import type { Song } from "../models/song.js";

@customElement("song-play")
export class SongPlay extends LitElement {
  @state() private currentTime = 0;
  @state() private duration = 0;
  @state() private playing = false;
  @state() private lyrics = "";
  @state() private clockTime = "";

  // Total elapsed time while song has been playing (paused time not counted)
  @state() private totalElapsed = 0;
  private firstPlayTime: number | null = null;

  // Loop controls (patter)
  @state() private loopStart = 0;
  @state() private loopEnd = 0;

  // Patter timer
  @state() private patterTimerEnabled = true;
  @state() private patterMinutes = 5;
  @state() private patterCountdown = 0;
  @state() private patterTimerRunning = false;
  private patterInterval: number | null = null;
  @state() private patterAlarmFired = false;

  private clockInterval: number | null = null;
  private elapsedInterval: number | null = null;

  get song(): Song | null {
    return callerBuddy.state.currentSong;
  }

  /** Tempo ratio from song delta (matches audio engine: (ref + delta) / ref, clamped 0.5–2). */
  private getTempoRatio(): number {
    const song = this.song;
    if (!song) return 1;
    const ref = song.originalTempo > 0 ? song.originalTempo : 128;
    return Math.max(0.5, Math.min(2, (ref + song.deltaTempo) / ref));
  }

  /** Playback duration in seconds (source duration / tempo ratio). */
  private getEffectiveDuration(): number {
    const ratio = this.getTempoRatio();
    return ratio > 0 ? this.duration / ratio : this.duration;
  }

  /** Playback position in seconds (source position / tempo ratio). */
  private getEffectiveCurrentTime(): number {
    const ratio = this.getTempoRatio();
    return ratio > 0 ? this.currentTime / ratio : this.currentTime;
  }

  /** Effective BPM (original + delta) for display. */
  private getEffectiveBPM(): number {
    const song = this.song;
    if (!song) return 0;
    const ref = song.originalTempo > 0 ? song.originalTempo : 128;
    return ref + song.deltaTempo;
  }

  connectedCallback() {
    super.connectedCallback();
    this.clockInterval = window.setInterval(() => this.updateClock(), 1000);
    this.updateClock();

    document.addEventListener("keydown", this._boundKeydown);

    // Listen for time updates from audio engine
    callerBuddy.audio.onTimeUpdate((t) => {
      this.currentTime = t;
      this.duration = callerBuddy.audio.getDuration();
      this.playing = callerBuddy.audio.isPlaying();
    });

    callerBuddy.audio.onEnded(() => {
      this.playing = false;
      this.stopPatterTimer();
      // Auto-close: return to playlist play
      callerBuddy.closeSongPlay();
    });

    // Load lyrics and song state
    this.initSong();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this._boundKeydown);
    if (this.clockInterval !== null) clearInterval(this.clockInterval);
    if (this.elapsedInterval !== null) clearInterval(this.elapsedInterval);
    this.stopPatterTimer();
  }

  /** Focus the controls panel after first render so keyboard shortcuts work. */
  protected firstUpdated() {
    this.focusControlsPanel();
  }

  private focusControlsPanel() {
    const panel = this.shadowRoot?.querySelector(".right-panel") as HTMLElement | undefined;
    panel?.focus();
  }

  private _boundKeydown = (e: KeyboardEvent) => this.onKeydown(e);

  private onKeydown(e: KeyboardEvent) {
    const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;

    switch (e.key) {
      case " ":
        if (inInput) return;
        e.preventDefault();
        this.onPlayPause();
        break;
      case "Enter":
        if (inInput) return;
        e.preventDefault();
        this.onPlayPause();
        break;
      case "Home":
        e.preventDefault();
        this.onRestart();
        break;
      case "End":
      case "Escape":
        e.preventDefault();
        this.onGoToEnd();
        break;
      case "ArrowLeft":
        e.preventDefault();
        this.onSeekDelta(e.ctrlKey ? -5 : -2);
        break;
      case "ArrowRight":
        e.preventDefault();
        this.onSeekDelta(e.ctrlKey ? 5 : 2);
        break;
      case "V":
        e.preventDefault();
        this.adjustVolume(5);
        break;
      case "v":
        e.preventDefault();
        this.adjustVolume(-5);
        break;
      case "P":
        e.preventDefault();
        this.adjustPitch(1);
        break;
      case "p":
        e.preventDefault();
        this.adjustPitch(-1);
        break;
      case "T":
        e.preventDefault();
        this.adjustTempo(1);
        break;
      case "t":
        e.preventDefault();
        this.adjustTempo(-1);
        break;
      default:
        break;
    }
  }

  private async initSong() {
    const song = this.song;
    if (!song) return;

    this.loopStart = song.loopStartTime;
    this.loopEnd = song.loopEndTime;
    this.patterMinutes = callerBuddy.state.settings.patterTimerMinutes;
    this.patterCountdown = this.patterMinutes * 60;

    if (isSingingCall(song)) {
      this.lyrics = await callerBuddy.loadLyrics(song);
    }

    this.duration = callerBuddy.audio.getDuration();
  }

  render() {
    const song = this.song;
    if (!song) return html`<p class="muted">No song loaded.</p>`;

    return html`
      <div class="song-play">
        <!-- Left panel: lyrics or loop controls -->
        <div class="left-panel">
          ${isSingingCall(song)
            ? this.renderLyrics()
            : this.renderPatterControls()}
        </div>

        <!-- Right panel: controls and info (focus anchor so shortcuts work) -->
        <div class="right-panel" tabindex="-1">
          ${this.renderTransport()}
          ${this.renderAdjustments(song)}
          ${this.renderTimeInfo()}
        </div>

        <!-- Bottom: progress slider -->
        <div class="slider-panel">
          ${this.renderSlider()}
        </div>
      </div>
    `;
  }

  // -- Lyrics ---------------------------------------------------------------

  private renderLyrics() {
    if (!this.lyrics) {
      return html`<p class="muted centered">No lyrics available.</p>`;
    }
    const song = this.song;
    const isPlainText =
      song?.lyricsFile?.toLowerCase().endsWith(".txt") ?? false;
    if (isPlainText) {
      return html`<div class="lyrics-content lyrics-plain">${this.lyrics}</div>`;
    }
    // Render HTML/MD lyrics in a container
    return html`<div class="lyrics-content">${unsafeHTML(this.lyrics)}</div>`;
  }

  // -- Patter controls (loop + timer) ---------------------------------------

  private renderPatterControls() {
    return html`
      <div class="patter-controls">
        <h3>Loop Controls</h3>
        <div class="loop-row">
          <label>Loop Start:</label>
          <span class="loop-value">${this.loopStart.toFixed(2)}s</span>
          <button class="nudge" title="-100ms" @click=${() => this.nudgeLoop("start", -0.1)}>◄◄</button>
          <button class="nudge" title="-10ms" @click=${() => this.nudgeLoop("start", -0.01)}>◄</button>
          <button class="nudge" title="Set to current position"
            @click=${() => this.setLoopFromCurrent("start")}>Set</button>
          <button class="nudge" title="+10ms" @click=${() => this.nudgeLoop("start", 0.01)}>►</button>
          <button class="nudge" title="+100ms" @click=${() => this.nudgeLoop("start", 0.1)}>►►</button>
        </div>
        <div class="loop-row">
          <label>Loop End:</label>
          <span class="loop-value">${this.loopEnd.toFixed(2)}s</span>
          <button class="nudge" title="-100ms" @click=${() => this.nudgeLoop("end", -0.1)}>◄◄</button>
          <button class="nudge" title="-10ms" @click=${() => this.nudgeLoop("end", -0.01)}>◄</button>
          <button class="nudge" title="Set to current position"
            @click=${() => this.setLoopFromCurrent("end")}>Set</button>
          <button class="nudge" title="+10ms" @click=${() => this.nudgeLoop("end", 0.01)}>►</button>
          <button class="nudge" title="+100ms" @click=${() => this.nudgeLoop("end", 0.1)}>►►</button>
        </div>
        <div class="loop-status ${this.loopEnd > 0 ? "active" : "inactive"}">
          ${this.loopEnd > 0 ? "Looping active" : "Looping inactive (set Loop End to enable)"}
        </div>

        <hr />

        <h3>Patter Timer</h3>
        <div class="patter-timer-controls ${this.patterTimerEnabled ? "" : "timer-disabled"}">
          <div class="patter-toggle-row">
            <label class="patter-toggle">
              <input
                type="checkbox"
                .checked=${this.patterTimerEnabled}
                @change=${this.onPatterTimerEnabledChange}
              />
              Enabled
            </label>
          </div>
          <div class="patter-row">
            <label>Duration (min):</label>
            <input
              type="number"
              min="1"
              max="15"
              step="0.5"
              .value=${String(this.patterMinutes)}
              @change=${this.onPatterMinutesChange}
              @keydown=${this.onPatterMinutesKeydown}
            />
          </div>
          <div class="patter-countdown ${!this.patterTimerEnabled ? "disabled" : ""} ${this.patterCountdown <= 0 ? "overtime" : ""}">
            ${formatCountdown(this.patterCountdown)}
          </div>
        </div>
      </div>
    `;
  }

  // -- Transport controls ---------------------------------------------------

  private renderTransport() {
    return html`
      <div class="transport">
        <button class="ctrl-btn" title="Restart (Home)" @click=${this.onRestart}>⏮</button>
        <button class="ctrl-btn" title="Back 5s (Ctrl+←)" @click=${() => this.onSeekDelta(-5)}>⏪</button>
        <button class="ctrl-btn" title="Back 2s (←)" @click=${() => this.onSeekDelta(-2)}>◄</button>
        <button class="ctrl-btn play-btn" title="${this.playing ? "Pause (Space)" : "Play (Space)"}"
          @click=${this.onPlayPause}>
          ${this.playing ? "⏸" : "▶"}
        </button>
        <button class="ctrl-btn" title="Forward 2s (→)" @click=${() => this.onSeekDelta(2)}>►</button>
        <button class="ctrl-btn" title="Forward 5s (Ctrl+→)" @click=${() => this.onSeekDelta(5)}>⏩</button>
        <button class="ctrl-btn" title="Go to end (End)" @click=${this.onGoToEnd}>⏭</button>
      </div>
    `;
  }

  // -- Volume / pitch / tempo adjustments -----------------------------------

  private renderAdjustments(song: Song) {
    return html`
      <div class="adjustments">
        <div class="adj-row">
          <span class="adj-label">Volume</span>
          <button class="adj-btn" title="Decrease volume (v)" @click=${() => this.adjustVolume(-5)}>◄</button>
          <span class="adj-value">${song.volume}</span>
          <button class="adj-btn" title="Increase volume (V)" @click=${() => this.adjustVolume(5)}>►</button>
        </div>
        <div class="adj-row">
          <span class="adj-label">Pitch</span>
          <button class="adj-btn" title="Decrease pitch (p)" @click=${() => this.adjustPitch(-1)}>◄</button>
          <span class="adj-value">${song.pitch > 0 ? "+" : ""}${song.pitch}</span>
          <button class="adj-btn" title="Increase pitch (P)" @click=${() => this.adjustPitch(1)}>►</button>
        </div>
        <div class="adj-row">
          <span class="adj-label">Tempo</span>
          <button class="adj-btn" title="Decrease tempo (t)" @click=${() => this.adjustTempo(-1)}>◄</button>
          <span class="adj-value">${song.deltaTempo > 0 ? "+" : ""}${song.deltaTempo}</span>
          <button class="adj-btn" title="Increase tempo (T)" @click=${() => this.adjustTempo(1)}>►</button>
          <span class="adj-hint">${this.getEffectiveBPM() > 0 ? `${this.getEffectiveBPM()} BPM` : ""}</span>
        </div>
      </div>
    `;
  }

  // -- Time info and clock --------------------------------------------------

  private renderTimeInfo() {
    const effectivePosition = this.getEffectiveCurrentTime();
    const effectiveDuration = this.getEffectiveDuration();
    return html`
      <div class="time-info">
        <div class="time-row">
          <span class="time-label">Position</span>
          <span class="time-value">${formatTime(effectivePosition)}</span>
        </div>
        <div class="time-row">
          <span class="time-label">Duration</span>
          <span class="time-value">${formatTime(effectiveDuration)}</span>
        </div>
        <div class="time-row">
          <span class="time-label">Elapsed</span>
          <span class="time-value">${formatTime(this.totalElapsed)}</span>
        </div>
        <div class="time-row clock-row">
          <span class="time-label">Time</span>
          <span class="time-value clock">${this.clockTime}</span>
        </div>
      </div>
    `;
  }

  // -- Progress slider (7 segments) -----------------------------------------

  private renderSlider() {
    const effectiveDuration = this.getEffectiveDuration();
    const effectiveCurrent = this.getEffectiveCurrentTime();
    const pct = effectiveDuration > 0 ? (effectiveCurrent / effectiveDuration) * 100 : 0;
    // Loop markers (in source time, so use source duration for placement)
    const loopStartPct = this.duration > 0 ? (this.loopStart / this.duration) * 100 : 0;
    const loopEndPct = this.duration > 0 ? (this.loopEnd / this.duration) * 100 : 0;

    return html`
      <div class="slider-container">
        <!-- 7-segment background -->
        <div class="segments">
          ${[0, 1, 2, 3, 4, 5, 6].map(
            (i) => html`
              <div
                class="segment ${i % 2 === 0 ? "even" : "odd"}"
                style="width: ${100 / 7}%"
              ></div>
            `,
          )}
        </div>

        <!-- Progress bar (by effective playback position) -->
        <div class="progress" style="width: ${pct}%"></div>

        <!-- Loop markers -->
        ${this.loopEnd > 0
          ? html`
              <div class="loop-marker start" style="left: ${loopStartPct}%"
                title="Loop start: ${this.loopStart.toFixed(2)}s"></div>
              <div class="loop-marker end" style="left: ${loopEndPct}%"
                title="Loop end: ${this.loopEnd.toFixed(2)}s"></div>
            `
          : nothing}

        <!-- Clickable overlay: range in effective time so cursor matches playback -->
        <input
          type="range"
          class="slider-input"
          min="0"
          max=${effectiveDuration || 1}
          step="0.1"
          .value=${String(effectiveCurrent)}
          @input=${this.onSliderInput}
          title="Song position"
        />
      </div>
    `;
  }

  // -- Event handlers -------------------------------------------------------

  private onPlayPause() {
    if (this.playing) {
      callerBuddy.audio.pause();
      this.playing = false;
      this.pausePatterTimer();
    } else {
      callerBuddy.audio.play();
      this.playing = true;
      this.resumePatterTimer();
      if (this.firstPlayTime === null) {
        this.firstPlayTime = Date.now();
        this.startElapsedTimer();
        // Start patter timer automatically if this is patter
        if (this.song && isPatter(this.song) && this.patterTimerEnabled && !this.patterTimerRunning) {
          this.startPatterTimer();
        }
      }
    }
  }

  private onRestart() {
    callerBuddy.audio.seek(0);
    this.currentTime = 0;
    this.resetPatterTimer();
    if (this.patterTimerEnabled && this.playing && this.song && isPatter(this.song)) {
      this.startPatterTimer();
    }
  }

  private onSeekDelta(seconds: number) {
    const newTime = Math.max(0, Math.min(this.currentTime + seconds, this.duration));
    callerBuddy.audio.seek(newTime);
    this.currentTime = newTime;
  }

  private onGoToEnd() {
    callerBuddy.audio.seek(this.duration);
    this.currentTime = this.duration;
    this.stopPatterTimer();
    callerBuddy.closeSongPlay();
  }

  private onSliderInput(e: Event) {
    const effectiveValue = Number((e.target as HTMLInputElement).value);
    const ratio = this.getTempoRatio();
    const sourceTime = effectiveValue * ratio;
    callerBuddy.audio.seek(sourceTime);
    this.currentTime = sourceTime;
  }

  // -- Adjustment handlers --------------------------------------------------

  private adjustVolume(delta: number) {
    if (!this.song) return;
    const newVol = Math.max(0, Math.min(100, this.song.volume + delta));
    this.song.volume = newVol;
    callerBuddy.audio.setVolume(newVol);
    this.requestUpdate();
    callerBuddy.updateSong(this.song);
  }

  private adjustPitch(delta: number) {
    if (!this.song) return;
    this.song.pitch += delta;
    callerBuddy.audio.setPitch(this.song.pitch);
    this.requestUpdate();
    callerBuddy.updateSong(this.song);
  }

  private adjustTempo(delta: number) {
    if (!this.song) return;
    this.song.deltaTempo += delta;
    callerBuddy.audio.setTempo(this.song.deltaTempo, this.song.originalTempo);
    this.requestUpdate();
    callerBuddy.updateSong(this.song);
  }

  // -- Loop controls --------------------------------------------------------

  private nudgeLoop(which: "start" | "end", delta: number) {
    if (which === "start") {
      this.loopStart = Math.max(0, this.loopStart + delta);
    } else {
      this.loopEnd = Math.max(0, this.loopEnd + delta);
    }
    this.applyLoopPoints();
  }

  private setLoopFromCurrent(which: "start" | "end") {
    if (which === "start") {
      this.loopStart = this.currentTime;
    } else {
      this.loopEnd = this.currentTime;
    }
    this.applyLoopPoints();
  }

  private applyLoopPoints() {
    callerBuddy.audio.setLoopPoints(this.loopStart, this.loopEnd);
    if (this.song) {
      this.song.loopStartTime = this.loopStart;
      this.song.loopEndTime = this.loopEnd;
      callerBuddy.updateSong(this.song);
    }
  }

  // -- Patter timer ---------------------------------------------------------

  /** Handle Enter inside the Duration input: commit and consume the event so
   *  it doesn't bubble up to the page-level keydown handler. */
  private onPatterMinutesKeydown(e: KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.stopPropagation();
    (e.target as HTMLInputElement).blur();
  }

  private onPatterMinutesChange(e: Event) {
    this.patterMinutes = Number((e.target as HTMLInputElement).value) || 5;
    this.resetPatterTimer();
    if (this.patterTimerEnabled && this.playing && this.song && isPatter(this.song)) {
      this.startPatterTimer();
    }
  }

  private onPatterTimerEnabledChange(e: Event) {
    const enabled = (e.target as HTMLInputElement).checked;
    this.patterTimerEnabled = enabled;
    if (!enabled) {
      this.stopPatterTimer();
    } else {
      this.resetPatterTimer();
      if (this.playing && this.song && isPatter(this.song)) {
        this.startPatterTimer();
      }
    }
  }

  /** Set countdown to duration and clear running state; does not start tick. */
  private resetPatterTimer() {
    this.patterCountdown = this.patterMinutes * 60;
    this.patterTimerRunning = false;
    this.patterAlarmFired = false;
    if (this.patterInterval !== null) {
      clearInterval(this.patterInterval);
      this.patterInterval = null;
    }
  }

  private startPatterTimer() {
    this.patterCountdown = this.patterMinutes * 60;
    this.patterTimerRunning = true;
    this.patterAlarmFired = false;
    if (this.playing) {
      this.startPatterTick();
    }
  }

  /** Start the 1s tick; only runs while music is playing. */
  private startPatterTick() {
    if (this.patterInterval !== null) return;
    this.patterInterval = window.setInterval(() => {
      this.patterCountdown--;
      if (this.patterCountdown === 0 && !this.patterAlarmFired) {
        callerBuddy.audio.playBeep();
        this.patterAlarmFired = true; // only beep once per spec
      }
    }, 1000);
  }

  /** Pause countdown (music paused); keeps remaining time. */
  private pausePatterTimer() {
    if (this.patterInterval !== null) {
      clearInterval(this.patterInterval);
      this.patterInterval = null;
    }
  }

  /** Resume countdown when music resumes. */
  private resumePatterTimer() {
    if (this.patterTimerEnabled && this.patterTimerRunning && this.playing && this.patterInterval === null) {
      this.startPatterTick();
    }
  }

  private stopPatterTimer() {
    this.patterTimerRunning = false;
    if (this.patterInterval !== null) {
      clearInterval(this.patterInterval);
      this.patterInterval = null;
    }
  }

  // -- Elapsed timer --------------------------------------------------------

  private startElapsedTimer() {
    this.elapsedInterval = window.setInterval(() => {
      if (this.playing) {
        this.totalElapsed += 1;
      }
    }, 1000);
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

    .song-play {
      display: grid;
      grid-template-columns: 1fr 320px;
      grid-template-rows: 1fr auto;
      height: 100%;
    }

    /* -- Left panel: lyrics or patter controls ----------------------------- */

    .left-panel {
      grid-column: 1;
      grid-row: 1;
      overflow-y: auto;
      border-right: 1px solid var(--cb-border);
    }

    .lyrics-content {
      font-size: 1rem;
      line-height: 1.7;
      width: 100%;
      box-sizing: border-box;
      background: var(--cb-bg);
      color: var(--cb-fg);
      padding: 16px;
    }

    .lyrics-content.lyrics-plain {
      white-space: pre-wrap;
    }

    .lyrics-content h1,
    .lyrics-content h2,
    .lyrics-content h3 {
      color: var(--cb-fg);
    }

    .lyrics-content a {
      color: var(--cb-accent);
    }

    .lyrics-content a:visited {
      color: var(--cb-accent-hover);
    }

    .lyrics-content hr {
      border-color: var(--cb-border);
    }

    /* -- Patter controls --------------------------------------------------- */

    .patter-controls {
      max-width: 500px;
      margin: 0 auto;
      padding: 16px;
    }

    .patter-controls h3 {
      margin: 0 0 8px;
      font-size: 1rem;
    }

    .patter-controls hr {
      border: none;
      border-top: 1px solid var(--cb-border);
      margin: 16px 0;
    }

    .loop-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 0.9rem;
    }

    .loop-row label {
      width: 80px;
    }

    .loop-value {
      width: 70px;
      font-variant-numeric: tabular-nums;
      font-family: monospace;
    }

    .loop-status {
      font-size: 0.85rem;
      padding: 4px 8px;
      border-radius: 4px;
      margin-top: 4px;
    }

    .loop-status.active {
      color: var(--cb-success);
      background: var(--cb-success-bg);
    }

    .loop-status.inactive {
      color: var(--cb-fg-tertiary);
    }

    .nudge {
      padding: 4px 8px;
      border: 1px solid var(--cb-border);
      border-radius: 4px;
      background: var(--cb-input-bg);
      color: var(--cb-fg);
      cursor: pointer;
      font-size: 0.8rem;
    }

    .nudge:hover {
      background: var(--cb-hover);
    }

    .patter-timer-controls.timer-disabled .patter-row,
    .patter-timer-controls.timer-disabled .patter-countdown {
      opacity: 0.5;
    }

    .patter-timer-controls .patter-toggle {
      opacity: 1;
    }

    .patter-toggle-row {
      margin-bottom: 8px;
    }

    .patter-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.9rem;
      cursor: pointer;
    }

    .patter-toggle input {
      cursor: pointer;
    }

    .patter-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9rem;
    }

    .patter-row input {
      width: 60px;
      padding: 4px 8px;
      border: 1px solid var(--cb-border);
      border-radius: 4px;
      background: var(--cb-input-bg);
      color: var(--cb-fg);
    }

    .patter-countdown {
      font-size: 2rem;
      font-weight: 300;
      font-variant-numeric: tabular-nums;
      margin-top: 8px;
    }

    .patter-countdown.disabled {
      color: var(--cb-fg-tertiary);
    }

    .patter-countdown.overtime {
      color: var(--cb-error);
    }

    .patter-countdown.disabled.overtime {
      color: var(--cb-fg-tertiary);
    }

    /* -- Right panel: controls and info ------------------------------------ */

    .right-panel {
      grid-column: 2;
      grid-row: 1;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      overflow-y: auto;
    }

    /* -- Transport controls ------------------------------------------------ */

    .transport {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }

    .ctrl-btn {
      background: none;
      border: 1px solid var(--cb-border);
      color: var(--cb-fg);
      font-size: 1.1rem;
      width: 36px;
      height: 36px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .ctrl-btn:hover {
      background: var(--cb-hover);
    }

    .ctrl-btn.play-btn {
      width: 44px;
      height: 44px;
      font-size: 1.3rem;
      background: var(--cb-accent);
      color: var(--cb-fg-on-accent);
      border-color: transparent;
    }

    .ctrl-btn.play-btn:hover {
      background: var(--cb-accent-hover);
    }

    /* -- Adjustments (volume/pitch/tempo) ---------------------------------- */

    .adjustments {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .adj-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .adj-label {
      width: 60px;
      font-size: 0.85rem;
      color: var(--cb-fg-secondary);
    }

    .adj-value {
      width: 40px;
      text-align: center;
      font-variant-numeric: tabular-nums;
      font-weight: 500;
    }

    .adj-btn {
      background: none;
      border: 1px solid var(--cb-border);
      color: var(--cb-fg);
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85rem;
    }

    .adj-btn:hover {
      background: var(--cb-hover);
    }

    .adj-hint {
      font-size: 0.75rem;
      color: var(--cb-fg-tertiary);
      margin-left: 4px;
    }

    /* -- Time info --------------------------------------------------------- */

    .time-info {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .time-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .time-label {
      width: 60px;
      font-size: 0.8rem;
      color: var(--cb-fg-secondary);
    }

    .time-value {
      font-variant-numeric: tabular-nums;
      font-size: 1rem;
    }

    .time-value.clock {
      font-size: 1.3rem;
      font-weight: 300;
    }

    /* -- Progress slider --------------------------------------------------- */

    .slider-panel {
      grid-column: 1 / -1;
      grid-row: 2;
      padding: 8px 12px 12px;
      border-top: 1px solid var(--cb-border);
    }

    .slider-container {
      position: relative;
      height: 28px;
      border-radius: 4px;
      overflow: hidden;
    }

    .segments {
      display: flex;
      position: absolute;
      inset: 0;
    }

    .segment.even {
      background: var(--cb-segment-even);
    }

    .segment.odd {
      background: var(--cb-segment-odd);
    }

    .progress {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      background: var(--cb-progress);
      pointer-events: none;
      transition: width 0.1s linear;
    }

    .loop-marker {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      z-index: 2;
    }

    .loop-marker.start {
      background: var(--cb-success);
    }

    .loop-marker.end {
      background: var(--cb-error);
    }

    .slider-input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
      margin: 0;
    }

    /* -- Shared ------------------------------------------------------------ */

    .secondary {
      border-radius: 6px;
      border: 1px solid var(--cb-border);
      padding: 6px 14px;
      font-size: 0.85rem;
      background: transparent;
      color: var(--cb-fg);
      cursor: pointer;
    }

    .secondary:hover {
      background: var(--cb-hover);
    }

    .muted {
      color: var(--cb-fg-tertiary);
    }

    .centered {
      text-align: center;
      padding: 3rem;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "song-play": SongPlay;
  }
}
