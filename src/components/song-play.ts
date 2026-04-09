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

import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { callerBuddy } from "../caller-buddy.js";
import { isSingingCall, isPatter, lyricsFilenameFor } from "../models/song.js";
import { formatTime, formatClock } from "../utils/format.js";
import { songPlayStyles } from "./song-play-styles.js";
import {
  renderPatterControls,
  renderSlider,
  renderTransport,
} from "./song-play-partials.js";
import type { Song } from "../models/song.js";
import type { LyricsEditor } from "./lyrics-editor.js";
import { DEFAULT_LYRICS_STYLE } from "../lyrics-default-style.js";
import {
  extractStyleBlock,
  extractBodyContent,
  rewriteBodySelectors,
  wrapLyricsHtml,
} from "../utils/lyrics-html.js";
import "./lyrics-editor.js";

/**
 * Prepare authored HTML lyrics for embedding inside a `.lyrics-content` div.
 *
 * Lyrics files are standalone HTML documents (`<html>`, `<head>`, `<body>`).
 * When injected via `unsafeHTML`, structural tags are discarded by the browser,
 * so `body { … }` CSS rules target the page body instead of the lyrics area.
 * This function extracts the `<style>` and `<body>` content, rewrites `body`
 * selectors to `.lyrics-content`, and returns a fragment ready for injection.
 */
function prepareLyricsHtml(raw: string): string {
  const cssText = extractStyleBlock(raw);
  const rewritten = rewriteBodySelectors(cssText);
  const body = extractBodyContent(raw);
  return (rewritten ? `<style>${rewritten}</style>` : "") + body;
}

function generateLyricsTemplate(song: Song): string {
  const title = song.title || "Untitled";
  const label = song.label || "";
  const labelHtml = label
    ? `&nbsp;<span class="info">(${label})</span>`
    : "";
  const body =
    `<p><h1>${title}</h1>${labelHtml}</p>\n\n` +
    "<h2>Figure</h2>\n<p>\nEnter lyrics here\n</p>";
  return wrapLyricsHtml(
    body,
    DEFAULT_LYRICS_STYLE,
    `${title}${label ? " " + label : ""}`,
  );
}

@customElement("song-play")
export class SongPlay extends LitElement {
  @state() private currentTime = 0;
  @state() private duration = 0;
  @state() private playing = false;
  @state() private lyrics = "";
  @state() private editing = false;
  /** True while lyrics editor DOM differs from last saved baseline (cleared on save). */
  @state() private lyricsModified = false;
  @state() private clockTime = "";

  /** Body HTML snapshot when the editor was opened or last saved (browser-normalized). */
  private lyricsEditorBaselineHtml = "";

  // Total elapsed time while song has been playing (paused time not counted)
  @state() private totalElapsed = 0;
  private firstPlayTime: number | null = null;

  // Loop controls (patter)
  @state() private loopStart = 0;
  @state() private loopEnd = 0;
  private draggingMarker: "start" | "end" | null = null;

  // Patter timer
  @state() private patterTimerEnabled = true;
  @state() private patterMinutes = 5;
  @state() private patterCountdown = 0;
  @state() private patterTimerRunning = false;
  private patterInterval: number | null = null;
  private patterAlarmInterval: number | null = null;
  @state() private patterAlarmFired = false;

  @state() private showLoopHelp = false;
  @state() private showAdjustHelp = false;
  @state() private showPatterTimerHelp = false;

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
    callerBuddy.setSongPlayUnsavedGuard(() => this.runSongPlayUnsavedGuard());
    this.clockInterval = window.setInterval(() => this.updateClock(), 1000);
    this.updateClock();

    document.addEventListener("keydown", this._boundKeydown);
    window.addEventListener("blur", this._boundWindowBlur);

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
    window.removeEventListener("blur", this._boundWindowBlur);
    if (this.clockInterval !== null) clearInterval(this.clockInterval);
    if (this.elapsedInterval !== null) clearInterval(this.elapsedInterval);
    this.stopPatterTimer();
    callerBuddy.setSongPlayUnsavedGuard(null);
    callerBuddy.audio.onTimeUpdate(() => {});
    callerBuddy.audio.onEnded(() => {});
    // Tab switch already ran runSongPlayUnsavedGuard; teardown without prompting again.
    void callerBuddy.finalizeSongPlayClose();
  }

  /** Focus the controls panel after first render so keyboard shortcuts work. */
  protected firstUpdated() {
    this.focusControlsPanel();
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has("editing") && this.editing) {
      requestAnimationFrame(() => this.syncLyricsEditorBaselineFromDom());
    }
  }

  private focusControlsPanel() {
    const panel = this.shadowRoot?.querySelector(".right-panel") as HTMLElement | undefined;
    panel?.focus();
  }

  private _boundKeydown = (e: KeyboardEvent) => this.onKeydown(e);
  /**
   * Leaving the browser window closes song play. Disabled while the lyric editor is
   * open (`editing`): native confirm/alert steals focus and fires spurious blurs,
   * and we avoid closing while the user may have unsaved edits in the DOM.
   */
  private _boundWindowBlur = () => {
    if (this.editing) return;
    void callerBuddy.closeSongPlay();
  };

  /** True when the event originated inside an input/textarea/select (including in shadow DOM). */
  private isKeyEventFromFormField(e: KeyboardEvent): boolean {
    return e.composedPath().some(
      (n) =>
        n instanceof HTMLInputElement ||
        n instanceof HTMLTextAreaElement ||
        n instanceof HTMLSelectElement,
    );
  }

  private onKeydown(e: KeyboardEvent) {
    if (this.editing) return;
    // document listener sees retargeted target; use composed path for fields inside this shadow root.
    if (this.isKeyEventFromFormField(e)) return;

    switch (e.key) {
      case " ":
        e.preventDefault();
        this.onPlayPause();
        break;
      case "Enter":
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
    this.syncPlaybackStateIfAudioAlreadyPlaying();
  }

  /** After openSongPlay auto-starts audio, align patter/elapsed state with the transport. */
  private syncPlaybackStateIfAudioAlreadyPlaying() {
    if (!callerBuddy.audio.isPlaying()) return;
    this.applyPlaybackStartedState();
  }

  /** Shared path for first transition from stopped → playing (play button or auto-start). */
  private applyPlaybackStartedState() {
    this.playing = true;
    this.resumePatterTimer();
    if (this.firstPlayTime === null) {
      this.firstPlayTime = Date.now();
      this.startElapsedTimer();
      if (
        this.song &&
        isPatter(this.song) &&
        this.patterTimerEnabled &&
        !this.patterTimerRunning
      ) {
        this.startPatterTimer();
      }
    }
  }

  private beginPlayback() {
    void callerBuddy.audio.play();
    this.applyPlaybackStartedState();
  }

  render() {
    const song = this.song;
    if (!song) return html`<p class="muted">No song loaded.</p>`;

    return html`
      <div class="song-play">
        <!-- Left panel: lyrics or loop controls -->
        <div class="left-panel">
          ${this.editing || isSingingCall(song)
            ? this.renderLyrics()
            : renderPatterControls({
                loopStart: this.loopStart,
                loopEnd: this.loopEnd,
                showLoopHelp: this.showLoopHelp,
                showPatterTimerHelp: this.showPatterTimerHelp,
                patterTimerEnabled: this.patterTimerEnabled,
                patterMinutes: this.patterMinutes,
                patterCountdown: this.patterCountdown,
                toggleLoopHelp: () => {
                  this.showLoopHelp = !this.showLoopHelp;
                },
                togglePatterTimerHelp: () => {
                  this.showPatterTimerHelp = !this.showPatterTimerHelp;
                },
                onLoopBoxKeydown: (which, e) => this.onLoopBoxKeydown(which, e),
                onLoopBtnMousedown: (e) => this.onLoopBtnMousedown(e),
                nudgeLoop: (which, d) => this.nudgeLoop(which, d),
                setLoopFromCurrent: (which) => this.setLoopFromCurrent(which),
                onPatterTimerEnabledChange: (e) =>
                  this.onPatterTimerEnabledChange(e),
                onPatterMinutesChange: (e) => this.onPatterMinutesChange(e),
                onPatterMinutesKeydown: (e) => this.onPatterMinutesKeydown(e),
              })}
        </div>

        <!-- Right panel: controls and info (focus anchor so shortcuts work) -->
        <div class="right-panel" tabindex="-1">
          ${renderTransport({
            playing: this.playing,
            onPlayPause: () => this.onPlayPause(),
            onRestart: () => this.onRestart(),
            onSeekDelta: (s) => this.onSeekDelta(s),
            onGoToEnd: () => this.onGoToEnd(),
          })}
          ${this.renderAdjustments(song)}
          ${this.renderTimeInfo()}
          ${this.renderPlayExtrasRow()}
        </div>

        <!-- Bottom: progress slider -->
        <div class="slider-panel">
          ${renderSlider({
            effectiveDuration: this.getEffectiveDuration(),
            effectiveCurrent: this.getEffectiveCurrentTime(),
            sourceDuration: this.duration,
            loopStart: this.loopStart,
            loopEnd: this.loopEnd,
            loopActive: this.loopEnd > 0,
            onSliderInput: (e) => this.onSliderInput(e),
            onLoopMarkerPointerDown: (which, e) =>
              this.onLoopMarkerPointerDown(which, e),
            onLoopMarkerPointerMove: (e) => this.onLoopMarkerPointerMove(e),
            onLoopMarkerPointerUp: (e) => this.onLoopMarkerPointerUp(e),
          })}
        </div>
      </div>
    `;
  }

  // -- Lyrics ---------------------------------------------------------------

  private renderLyrics() {
    if (this.editing) {
      return this.renderLyricsEditor();
    }
    if (!this.lyrics) {
      return html`<p class="muted centered">No lyrics available.</p>`;
    }
    const song = this.song;
    const isPlainText =
      song?.lyricsFile?.toLowerCase().endsWith(".txt") ?? false;
    if (isPlainText) {
      return html`<div class="lyrics-content lyrics-plain">${this.lyrics}</div>`;
    }
    return html`<div class="lyrics-content">${unsafeHTML(prepareLyricsHtml(this.lyrics))}</div>`;
  }

  // -- Lyrics editor --------------------------------------------------------

  private renderLyricsEditor() {
    const cssText = this.lyrics
      ? extractStyleBlock(this.lyrics)
      : DEFAULT_LYRICS_STYLE;
    const rewrittenCss = rewriteBodySelectors(cssText);

    return html`
      <lyrics-editor
        .bodyHtml=${this.lyrics ? extractBodyContent(this.lyrics) : ""}
        .editorCss=${rewrittenCss}
        .showSaveExit=${true}
        @lyrics-input=${this.onLyricsEditorInput}
        @lyrics-save=${() => void this.onSaveLyrics()}
        @lyrics-exit=${() => void this.onExitLyricsEditor()}
      ></lyrics-editor>
    `;
  }

  /** Edit/create lyrics (when not editing) plus Close — same exit path as Esc / End or track end. */
  private renderPlayExtrasRow() {
    const song = this.song;
    if (!song) return nothing;
    return html`
      <div class="play-extras-row">
        ${this.renderEditLyricsButton()}
        <button
          class="secondary close-play-btn"
          title="Close player and return to playlist (Esc)"
          @click=${this.onGoToEnd}
        >
          Close
        </button>
      </div>
    `;
  }

  private renderEditLyricsButton() {
    if (this.editing) return nothing;
    const song = this.song;
    if (!song) return nothing;
    const hasLyrics = isSingingCall(song);
    return html`
      <button class="secondary edit-lyrics-btn"
        @click=${hasLyrics ? this.onEditLyrics : this.onCreateLyrics}>
        ${hasLyrics ? "Edit Lyrics" : "Create Lyrics"}
      </button>
    `;
  }

  private onEditLyrics() {
    this.editing = true;
  }

  private onCreateLyrics() {
    const song = this.song;
    if (!song) return;
    this.lyrics = generateLyricsTemplate(song);
    this.editing = true;
  }

  private getLyricsEditorComponent(): LyricsEditor | null {
    return this.shadowRoot?.querySelector("lyrics-editor") as LyricsEditor | null;
  }

  private syncLyricsEditorBaselineFromDom() {
    if (!this.editing) return;
    const editor = this.getLyricsEditorComponent();
    if (!editor) return;
    this.lyricsEditorBaselineHtml = editor.getEditorHtml();
    this.lyricsModified = false;
  }

  private onLyricsEditorInput() {
    if (!this.editing) return;
    const editor = this.getLyricsEditorComponent();
    if (!editor) return;
    const dirty = editor.getEditorHtml() !== this.lyricsEditorBaselineHtml;
    if (dirty !== this.lyricsModified) {
      this.lyricsModified = dirty;
    }
  }

  /** Prompt when closing song play while the editor has unsaved edits. Cancel = stay. */
  private async runSongPlayUnsavedGuard(): Promise<boolean> {
    if (!this.editing || !this.lyricsModified) return true;
    const save = window.confirm(
      "You have unsaved lyric changes. Save before closing?",
    );
    if (!save) return false;
    try {
      await this.persistLyricsFromEditor();
      return true;
    } catch {
      window.alert("Could not save lyrics.");
      return false;
    }
  }

  private async persistLyricsFromEditor(): Promise<void> {
    const song = this.song;
    if (!song) return;

    const editor = this.getLyricsEditorComponent();
    if (!editor) return;

    const editedBody = editor.getEditorHtml();
    const cssText = this.lyrics
      ? extractStyleBlock(this.lyrics)
      : DEFAULT_LYRICS_STYLE;
    const title = `${song.title}${song.label ? " " + song.label : ""}`;
    const fullHtml = wrapLyricsHtml(editedBody, cssText, title);

    const lyricsFile = song.lyricsFile || lyricsFilenameFor(song.musicFile);
    await callerBuddy.saveLyrics(song, lyricsFile, fullHtml);

    this.lyrics = fullHtml;
    this.lyricsEditorBaselineHtml = editedBody;
    this.lyricsModified = false;
  }

  private async onSaveLyrics() {
    try {
      await this.persistLyricsFromEditor();
    } catch {
      window.alert("Could not save lyrics.");
    }
  }

  private async onExitLyricsEditor() {
    if (this.lyricsModified) {
      const save = window.confirm(
        "Save lyric changes before exiting the editor?\n\n" +
          "OK: Save and exit\nCancel: Discard changes and exit",
      );
      if (save) {
        try {
          await this.persistLyricsFromEditor();
        } catch {
          window.alert("Could not save lyrics.");
          return;
        }
      } else if (!this.song?.lyricsFile) {
        this.lyrics = "";
      }
    } else if (!this.song?.lyricsFile) {
      this.lyrics = "";
    }
    this.editing = false;
    this.lyricsModified = false;
  }

  // -- Volume / pitch / tempo adjustments -----------------------------------

  private renderAdjustments(song: Song) {
    return html`
      <div class="adjustments">
        <button class="ctx-help-btn adj-help-btn" title="What do these controls do?"
          @click=${() => { this.showAdjustHelp = !this.showAdjustHelp; }}>?</button>
        ${this.showAdjustHelp ? html`
          <div class="ctx-help-panel">
            <strong>Volume</strong> (0&ndash;100): playback loudness.
            <strong>Pitch</strong>: shift in half-steps (+ = higher, &minus; = lower).
            <strong>Tempo</strong>: BPM change from the original speed (+ = faster, &minus; = slower).
            All adjustments are saved per song and apply automatically next time.
            Keys: <kbd>v</kbd>/<kbd>V</kbd> volume, <kbd>p</kbd>/<kbd>P</kbd> pitch,
            <kbd>t</kbd>/<kbd>T</kbd> tempo.
          </div>` : nothing}
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
        <div class="meta-block">
          <div class="meta-row">
            <label
              class="meta-label"
              title="Words or phrases that describe categories this song belongs to, separated by semicolons (for example: Christmas; Patriotic; Plus)."
            >Categories:</label>
            <input
              type="text"
              class="meta-input meta-input-categories"
              title="Words or phrases that describe categories this song belongs to, separated by semicolons (for example: Christmas; Patriotic; Plus)."
              spellcheck="false"
              .value=${song.categories}
              @change=${this.onSongCategoryChange}
            />
          </div>
          <div class="meta-row">
            <label
              class="meta-label"
              title="Preference from 0 to 100: 100 is excellent, 50 is average, and 0 means avoid using this song."
            >Rank</label>
            <input
              type="number"
              class="meta-input meta-input-rank"
              min="0"
              max="100"
              step="1"
              title="Preference from 0 to 100: 100 is excellent, 50 is average, and 0 means avoid using this song."
              .value=${String(song.rank)}
              @change=${this.onSongRankChange}
            />
          </div>
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

  // -- Event handlers -------------------------------------------------------

  private onPlayPause() {
    if (this.playing) {
      callerBuddy.audio.pause();
      this.playing = false;
      this.pausePatterTimer();
    } else {
      this.beginPlayback();
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

  private onSongCategoryChange(e: Event) {
    if (!this.song) return;
    this.song.categories = (e.target as HTMLInputElement).value;
    void callerBuddy.updateSong(this.song);
    this.requestUpdate();
  }

  private onSongRankChange(e: Event) {
    if (!this.song) return;
    const raw = (e.target as HTMLInputElement).value.trim();
    if (raw === "") {
      this.requestUpdate();
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 100) {
      this.requestUpdate();
      return;
    }
    this.song.rank = n;
    void callerBuddy.updateSong(this.song);
    this.requestUpdate();
  }

  // -- Loop controls --------------------------------------------------------

  /** Handle keyboard shortcuts when a loop box has focus. */
  private onLoopBoxKeydown(which: "start" | "end", e: KeyboardEvent) {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        e.stopPropagation();
        this.nudgeLoop(which, e.ctrlKey ? -0.1 : -0.01);
        break;
      case "ArrowRight":
        e.preventDefault();
        e.stopPropagation();
        this.nudgeLoop(which, e.ctrlKey ? 0.1 : 0.01);
        break;
      case "Enter":
        e.preventDefault();
        e.stopPropagation();
        this.setLoopFromCurrent(which);
        break;
    }
  }

  /** Prevent buttons inside loop boxes from stealing focus; focus the box instead. */
  private onLoopBtnMousedown(e: Event) {
    e.preventDefault();
    const box = (e.target as HTMLElement).closest(".loop-box") as HTMLElement | null;
    box?.focus();
  }

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

  // -- Loop marker drag (progress bar) --------------------------------------

  private onLoopMarkerPointerDown(which: "start" | "end", e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.draggingMarker = which;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  private onLoopMarkerPointerMove(e: PointerEvent) {
    if (!this.draggingMarker) return;
    e.preventDefault();
    const container = this.shadowRoot?.querySelector(".slider-container") as HTMLElement | null;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pct * this.duration;
    if (this.draggingMarker === "start") {
      this.loopStart = time;
    } else {
      this.loopEnd = time;
    }
    // Update audio engine live, but don't persist to disk during drag
    callerBuddy.audio.setLoopPoints(this.loopStart, this.loopEnd);
  }

  private onLoopMarkerPointerUp(_e: PointerEvent) {
    if (!this.draggingMarker) return;
    this.draggingMarker = null;
    // Persist to disk now that drag is complete
    this.applyLoopPoints();
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
    void callerBuddy.updateSetting("patterTimerMinutes", this.patterMinutes);
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
    if (this.patterAlarmInterval !== null) {
      clearInterval(this.patterAlarmInterval);
      this.patterAlarmInterval = null;
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
        this.patterAlarmFired = true;
        this.playPatterAlarm();
      }
    }, 1000);
  }

  /** Pause countdown (music paused); keeps remaining time. */
  private pausePatterTimer() {
    if (this.patterInterval !== null) {
      clearInterval(this.patterInterval);
      this.patterInterval = null;
    }
    if (this.patterAlarmInterval !== null) {
      clearInterval(this.patterAlarmInterval);
      this.patterAlarmInterval = null;
    }
  }

  private playPatterAlarm() {
    callerBuddy.audio.playBeep();
    // Replay every 15 seconds (matches break timer)
    this.patterAlarmInterval = window.setInterval(() => {
      callerBuddy.audio.playBeep();
    }, 15_000);
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
    if (this.patterAlarmInterval !== null) {
      clearInterval(this.patterAlarmInterval);
      this.patterAlarmInterval = null;
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

  static styles = songPlayStyles;
}

declare global {
  interface HTMLElementTagNameMap {
    "song-play": SongPlay;
  }
}
