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
import {
  isSingingCall,
  isPatter,
  lyricsFilenameFor,
  effectiveAudioLoopPoints,
  clampPatterLoopRegion,
} from "../models/song.js";
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
  wrapLyricsHtml,
} from "../utils/lyrics-html.js";
import { tempoRatioFromSong } from "../utils/play-history.js";
import { bumpLyricsScale } from "../utils/lyrics-scale.js";
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
  const body = extractBodyContent(raw);
  // CallerBuddy owns lyric styling at runtime. The lyric file may include a
  // <style> block so that opening the HTML directly in a browser looks good,
  // but in-app we treat lyrics as semantic markup only (h1/h2/p/.info/etc).
  return body;
}

/** Tooltip for practice checkbox + label (same text on both for reliable hover/focus hints). */
const PRACTICE_MODE_TOOLTIP =
  "When practice is on, the song is not counted in play history (last used / how often played). (Ctrl+P)";

const AUTO_PAUSE_ON_BLUR_TOOLTIP =
  "When checked, playback pauses when this window loses focus (switching apps or tabs). Uncheck to keep playing in the background.";

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
  /** Unsaved-changes prompt when exiting the lyrics editor or closing the player with dirty lyrics. */
  @state() private lyricsExitConfirmOpen = false;
  @state() private clockTime = "";

  /** Set while `runSongPlayUnsavedGuard` is showing the shared dialog (song end, tab nav, Close, etc.). */
  private lyricsExitPendingGuardResolve: ((allowed: boolean) => void) | null = null;
  private lyricsUnsavedGuardPromise: Promise<boolean> | null = null;

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
  @state() private patterMinutes = 6;
  @state() private patterCountdown = 0;
  @state() private patterTimerRunning = false;
  private patterInterval: number | null = null;
  private patterAlarmInterval: number | null = null;
  @state() private patterAlarmFired = false;

  @state() private showLoopHelp = false;
  @state() private showAdjustHelp = false;
  @state() private showPatterTimerHelp = false;

  // Phone portrait split: controls (top) vs lyrics (bottom)
  @state() private mobileControlsSplitPct = 1 / 3;
  private draggingMobileSplit = false;
  private mobileSplitPointerId: number | null = null;

  // Landscape / wide split: lyrics (left) vs controls (right)
  @state() private desktopControlsWidthPx = 320;
  private draggingDesktopSplit = false;
  private desktopSplitPointerId: number | null = null;

  private clockInterval: number | null = null;
  private elapsedInterval: number | null = null;

  /** Re-run split math when host width/height changes (ResizeObserver; viewport MQs lie on WebAPK). */
  private _layoutResizeObs: ResizeObserver | null = null;

  /** Root `.song-play` surface — capture pointerdown to blur editor before focus moves to a control. */
  private _songPlaySurface: HTMLElement | null = null;
  private _boundSongPlayPointerCapture = (e: PointerEvent) =>
    this.onSongPlayPointerCapture(e);

  get song(): Song | null {
    return callerBuddy.state.currentSong;
  }

  /** Tempo ratio from song delta (matches audio engine: (ref + delta) / ref, clamped 0.5–2). */
  private getTempoRatio(): number {
    const song = this.song;
    if (!song) return 1;
    return tempoRatioFromSong(song);
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
    callerBuddy.beginSongPlaySession();
    callerBuddy.setSongPlayUnsavedGuard(() => this.runSongPlayUnsavedGuard());
    this.clockInterval = window.setInterval(() => this.updateClock(), 1000);
    this.updateClock();

    document.addEventListener("keydown", this._boundKeydown);
    document.addEventListener("keydown", this._boundLyricsExitDialogKeydown, true);
    window.addEventListener("blur", this._boundWindowBlur);
    window.addEventListener("resize", this._boundWindowResize);
    document.addEventListener("visibilitychange", this._boundVisibilityChange);

    this._layoutResizeObs = new ResizeObserver(() => {
      this.applyMobileSplitLayoutVars();
      this.applyDesktopSplitLayoutVars();
    });
    this._layoutResizeObs.observe(this);

    const saved = window.localStorage.getItem("cbSongPlayMobileControlsSplitPct");
    if (saved) {
      const n = Number(saved);
      if (Number.isFinite(n)) {
        this.mobileControlsSplitPct = Math.max(0.2, Math.min(0.75, n));
      }
    }

    const savedDesktop = window.localStorage.getItem(
      "cbSongPlayDesktopControlsWidthPx",
    );
    if (savedDesktop) {
      const n = Number(savedDesktop);
      if (Number.isFinite(n)) {
        this.desktopControlsWidthPx = Math.max(240, Math.min(520, n));
      }
    }

    // Listen for time updates from audio engine
    callerBuddy.audio.onTimeUpdate((t) => {
      this.currentTime = t;
      const newDur = callerBuddy.audio.getDuration();
      const durChanged = newDur !== this.duration;
      this.duration = newDur;
      this.playing = callerBuddy.audio.isPlaying();
      if (durChanged) {
        this.syncImplicitPatterLoopIfNeeded();
      }
      callerBuddy.tickSongPlaySession(callerBuddy.audio.isPlaying());
    });

    callerBuddy.audio.onEnded(() => {
      this.playing = false;
      this.stopPatterTimer();
      callerBuddy.markSongPlayNaturalEnd();
      // Auto-close: return to playlist play
      void callerBuddy.closeSongPlay();
    });

    // Load lyrics and song state
    this.initSong();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._songPlaySurface?.removeEventListener(
      "pointerdown",
      this._boundSongPlayPointerCapture,
      { capture: true },
    );
    this._songPlaySurface = null;
    this._layoutResizeObs?.disconnect();
    this._layoutResizeObs = null;
    document.removeEventListener("keydown", this._boundKeydown);
    document.removeEventListener("keydown", this._boundLyricsExitDialogKeydown, true);
    window.removeEventListener("blur", this._boundWindowBlur);
    window.removeEventListener("resize", this._boundWindowResize);
    document.removeEventListener("visibilitychange", this._boundVisibilityChange);
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
    this.applyMobileSplitLayoutVars();
    this.applyDesktopSplitLayoutVars();
    this._songPlaySurface = this.shadowRoot?.querySelector(".song-play") as HTMLElement | null;
    this._songPlaySurface?.addEventListener(
      "pointerdown",
      this._boundSongPlayPointerCapture,
      { capture: true },
    );
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has("lyricsExitConfirmOpen") && this.lyricsExitConfirmOpen) {
      requestAnimationFrame(() => this.focusLyricsExitDefaultButton());
    }
    if (changed.has("editing") && this.editing) {
      requestAnimationFrame(() => this.syncLyricsEditorBaselineFromDom());
    }
    if (changed.has("mobileControlsSplitPct")) {
      this.applyMobileSplitLayoutVars();
      window.localStorage.setItem(
        "cbSongPlayMobileControlsSplitPct",
        String(this.mobileControlsSplitPct),
      );
    }
    if (changed.has("desktopControlsWidthPx")) {
      this.applyDesktopSplitLayoutVars();
      window.localStorage.setItem(
        "cbSongPlayDesktopControlsWidthPx",
        String(this.desktopControlsWidthPx),
      );
    }
  }

  private focusControlsPanel() {
    const panel = this.shadowRoot?.querySelector(".right-panel") as HTMLElement | undefined;
    panel?.focus();
  }

  private _boundKeydown = (e: KeyboardEvent) => this.onKeydown(e);
  /** Capture phase: Esc / Del / Enter (when needed) while the unsaved-lyrics dialog is open. */
  private _boundLyricsExitDialogKeydown = (e: KeyboardEvent) => {
    if (!this.lyricsExitConfirmOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.dismissLyricsExitDialogKeepEditing();
      return;
    }
    if (
      e.key === "Delete" &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault();
      e.stopPropagation();
      this.onLyricsExitConfirmDiscard();
      return;
    }
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !this.eventPathIncludesLyricsExitModal(e)
    ) {
      e.preventDefault();
      e.stopPropagation();
      void this.onLyricsExitConfirmSave();
    }
  };

  private focusLyricsExitDefaultButton() {
    const btn = this.shadowRoot?.querySelector(
      ".lyrics-exit-form .lyrics-exit-primary",
    ) as HTMLButtonElement | null;
    btn?.focus();
  }

  /** True if the event path goes through the lyrics exit dialog panel (not the dimmed backdrop). */
  private eventPathIncludesLyricsExitModal(e: Event): boolean {
    return e.composedPath().some(
      (n) =>
        n instanceof HTMLElement && n.classList.contains("lyrics-exit-modal"),
    );
  }

  private onLyricsExitFormSubmit(e: Event) {
    e.preventDefault();
    void this.onLyricsExitConfirmSave();
  }

  /** Completes a pending `runSongPlayUnsavedGuard` wait. @returns whether a guard was pending. */
  private resolveLyricsUnsavedGuardIfPending(allowed: boolean): boolean {
    const r = this.lyricsExitPendingGuardResolve;
    if (!r) return false;
    this.lyricsExitPendingGuardResolve = null;
    this.lyricsUnsavedGuardPromise = null;
    r(allowed);
    return true;
  }

  /** Close the unsaved dialog without saving; abort player close if guard is pending; focus the lyric surface. */
  private dismissLyricsExitDialogKeepEditing() {
    this.lyricsExitConfirmOpen = false;
    this.resolveLyricsUnsavedGuardIfPending(false);
    void this.updateComplete.then(() => this.focusLyricsEditorEditableSurface());
  }

  private focusLyricsEditorEditableSurface() {
    if (!this.editing) return;
    const le = this.getLyricsEditorComponent();
    const surface = le?.shadowRoot?.querySelector(
      ".lyrics-editor.lyrics-content",
    ) as HTMLElement | null;
    surface?.focus();
  }
  /** When the window loses focus, pause audio but keep the player open (if auto-pause is on). */
  private _boundWindowBlur = () => {
    if (!callerBuddy.getAutoPauseOnWindowBlur()) return;
    this.pausePlayback();
  };

  /**
   * Browsers often suspend AudioContext when the tab is hidden; resume when
   * visible so playback/UI recover when "Auto-Pause" is off (we did not call pause).
   */
  private _boundVisibilityChange = () => {
    if (document.visibilityState !== "visible") return;
    void callerBuddy.audio.ensureContextRunning().then(() => this.requestUpdate());
  };

  private _boundWindowResize = () => {
    this.applyMobileSplitLayoutVars();
    this.applyDesktopSplitLayoutVars();
  };

  private isNarrowLayout(): boolean {
    const w = this.getBoundingClientRect().width;
    if (w >= 16) {
      return w <= 700;
    }
    const short = Math.min(screen.width, screen.height);
    const inner = window.innerWidth;
    if (inner > short * 1.2 && window.matchMedia("(orientation: portrait)").matches) {
      return true;
    }
    return window.matchMedia("(max-width: 700px)").matches;
  }

  private applyMobileSplitLayoutVars() {
    if (!this.isNarrowLayout()) return;
    const root = this.shadowRoot?.querySelector(".song-play") as HTMLElement | null;
    if (!root) return;

    const slider = this.shadowRoot?.querySelector(".slider-panel") as HTMLElement | null;
    const sliderH = slider ? slider.getBoundingClientRect().height : 0;
    const splitterH = 10; // keep in sync with CSS --cb-song-splitter-h
    const totalH = root.getBoundingClientRect().height;
    const available = Math.max(0, totalH - sliderH - splitterH);

    const pct = Math.max(0.2, Math.min(0.75, this.mobileControlsSplitPct));
    const controlsPx = Math.round(available * pct);
    root.style.setProperty("--cb-song-controls-h", `${controlsPx}px`);
  }

  private applyDesktopSplitLayoutVars() {
    if (this.isNarrowLayout()) return;
    const root = this.shadowRoot?.querySelector(".song-play") as HTMLElement | null;
    if (!root) return;

    const splitterW = 10; // keep in sync with CSS --cb-song-vsplitter-w
    const totalW = root.getBoundingClientRect().width;
    // Keep a sane minimum left area for lyrics; clamp controls width accordingly.
    const minLyricsW = 260;
    const maxControls = Math.max(240, Math.min(520, totalW - splitterW - minLyricsW));
    const w = Math.max(240, Math.min(maxControls, this.desktopControlsWidthPx));
    root.style.setProperty("--cb-song-controls-w", `${Math.round(w)}px`);
  }

  /**
   * True when shortcuts should yield to native typing or widget behavior.
   * Range sliders are excluded so play/pause, seek, etc. work from the progress bar.
   */
  private shouldYieldShortcutsToFocusedControl(e: KeyboardEvent): boolean {
    return e.composedPath().some((n) => {
      if (n instanceof HTMLTextAreaElement || n instanceof HTMLSelectElement) {
        return true;
      }
      if (n instanceof HTMLInputElement) {
        const t = n.type;
        if (t === "range") return false;
        return true;
      }
      return false;
    });
  }

  /** Shadow-inclusive: true when the event came from inside `<lyrics-editor>`. */
  private eventTargetIsInsideLyricsEditor(e: Event): boolean {
    return e.composedPath().some(
      (n) => n instanceof HTMLElement && n.tagName === "LYRICS-EDITOR",
    );
  }

  /** Clear focus from the editor surface so the caret/ring follow clicks elsewhere. */
  private blurLyricsEditorFocus() {
    const editor = this.getLyricsEditorComponent();
    if (!editor) return;
    let el: Element | null = document.activeElement;
    while (el && el !== document.body) {
      const root = el.getRootNode();
      if (root instanceof ShadowRoot && root.host === editor) {
        (el as HTMLElement).blur();
        return;
      }
      if (el === editor) {
        editor.blur();
        return;
      }
      el = el.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
    }
  }

  /** Runs in capture phase so the editor blurs before the clicked button/slider takes focus. */
  private onSongPlayPointerCapture(e: PointerEvent) {
    if (!this.editing) return;
    if (this.eventTargetIsInsideLyricsEditor(e)) return;
    this.blurLyricsEditorFocus();
  }

  private onKeydown(e: KeyboardEvent) {
    /** Lyrics exit modal — focus may be on Save (inside shadow DOM); bubble reaches here and would otherwise steal Enter/Space/Esc for transport. */
    if (this.lyricsExitConfirmOpen) return;
    if (this.eventTargetIsInsideLyricsEditor(e)) return;
    // document listener sees retargeted target; use composed path for fields inside this shadow root.
    if (this.shouldYieldShortcutsToFocusedControl(e)) return;
    // Match prior behavior: while the editor is open, global Esc does not close the player
    // (Esc exits the editor when focus is inside it — handled there with stopPropagation).
    if (this.editing && e.key === "Escape") return;

    /** Lyrics font scale — Alt avoids browser Ctrl+/Ctrl− zoom shortcuts. */
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const increase =
        e.key === "+" ||
        e.key === "=" ||
        e.code === "Equal" ||
        e.code === "NumpadAdd";
      const decrease =
        e.key === "-" ||
        e.code === "Minus" ||
        e.code === "NumpadSubtract";
      if (increase) {
        e.preventDefault();
        void bumpLyricsScale(1.1);
        return;
      }
      if (decrease) {
        e.preventDefault();
        void bumpLyricsScale(1 / 1.1);
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "p") {
      e.preventDefault();
      this.onTogglePractice();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "e") {
      e.preventDefault();
      const song = this.song;
      if (!song) return;
      if (isSingingCall(song)) this.onEditLyrics();
      else this.onCreateLyrics();
      return;
    }

    if (
      (e.ctrlKey || e.metaKey) &&
      !e.altKey &&
      e.key.toLowerCase() === "t" &&
      this.song &&
      isPatter(this.song)
    ) {
      e.preventDefault();
      this.togglePatterTimerEnabled();
      return;
    }

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
      case ".":
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
        if (e.ctrlKey || e.metaKey) break;
        e.preventDefault();
        this.adjustPitch(1);
        break;
      case "p":
        if (e.ctrlKey || e.metaKey) break;
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

    const dur = callerBuddy.audio.getDuration();
    const eff = effectiveAudioLoopPoints(song, dur);
    this.loopStart = eff.start;
    this.loopEnd = eff.end;
    this.patterMinutes = callerBuddy.state.settings.patterTimerMinutes;
    this.patterCountdown = this.patterMinutes * 60;

    if (isSingingCall(song)) {
      this.lyrics = await callerBuddy.loadLyrics(song);
    }

    this.duration = dur;
    callerBuddy.audio.setLoopPoints(this.loopStart, this.loopEnd);
    this.syncPlaybackStateIfAudioAlreadyPlaying();
  }

  /**
   * When patter uses implicit full-file loop (loopEndTime ≤ 0), refresh UI/engine if duration changes.
   */
  private syncImplicitPatterLoopIfNeeded() {
    const song = this.song;
    if (!song || !isPatter(song) || song.loopEndTime > 0) return;
    const eff = effectiveAudioLoopPoints(song, this.duration);
    if (eff.start !== this.loopStart || eff.end !== this.loopEnd) {
      this.loopStart = eff.start;
      this.loopEnd = eff.end;
      callerBuddy.audio.setLoopPoints(eff.start, eff.end);
      this.requestUpdate();
    }
  }

  /** Clamp patter loop markers to legal range after UI edits. */
  private clampPatterLoopIfNeeded() {
    const song = this.song;
    if (!song || !isPatter(song) || this.duration <= 0) return;
    const c = clampPatterLoopRegion(this.loopStart, this.loopEnd, this.duration);
    if (c.start !== this.loopStart || c.end !== this.loopEnd) {
      this.loopStart = c.start;
      this.loopEnd = c.end;
    }
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
      if (this.song && isPatter(this.song) && !this.patterTimerRunning) {
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
      ${this.lyricsExitConfirmOpen ? this.renderLyricsExitConfirm() : nothing}
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

        <div
          class="desktop-splitter"
          role="separator"
          aria-label="Resize lyrics and controls"
          aria-orientation="vertical"
          @pointerdown=${this.onDesktopSplitterPointerDown}
          @pointermove=${this.onDesktopSplitterPointerMove}
          @pointerup=${this.onDesktopSplitterPointerUp}
          @pointercancel=${this.onDesktopSplitterPointerUp}
        ></div>

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

        <div
          class="mobile-splitter"
          role="separator"
          aria-label="Resize controls and lyrics"
          aria-orientation="horizontal"
          @pointerdown=${this.onMobileSplitterPointerDown}
          @pointermove=${this.onMobileSplitterPointerMove}
          @pointerup=${this.onMobileSplitterPointerUp}
          @pointercancel=${this.onMobileSplitterPointerUp}
        ></div>

        <!-- Bottom: progress slider -->
        <div class="slider-panel">
          ${renderSlider({
            effectiveDuration: this.getEffectiveDuration(),
            effectiveCurrent: this.getEffectiveCurrentTime(),
            sourceDuration: this.duration,
            loopStart: this.loopStart,
            loopEnd: this.loopEnd,
            loopActive:
              isPatter(song)
                ? this.duration > 0 && this.loopEnd > this.loopStart
                : this.loopEnd > 0,
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

  private onMobileSplitterPointerDown(e: PointerEvent) {
    if (!this.isNarrowLayout()) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.draggingMobileSplit = true;
    this.mobileSplitPointerId = e.pointerId;
    this.onMobileSplitterPointerMove(e);
  }

  private onMobileSplitterPointerMove(e: PointerEvent) {
    if (!this.draggingMobileSplit) return;
    if (
      this.mobileSplitPointerId !== null &&
      e.pointerId !== this.mobileSplitPointerId
    ) {
      return;
    }
    e.preventDefault();
    if (!this.isNarrowLayout()) return;

    const root = this.shadowRoot?.querySelector(".song-play") as HTMLElement | null;
    if (!root) return;
    const slider = this.shadowRoot?.querySelector(".slider-panel") as HTMLElement | null;

    const rootRect = root.getBoundingClientRect();
    const sliderH = slider ? slider.getBoundingClientRect().height : 0;
    const splitterH = 10; // keep in sync with CSS --cb-song-splitter-h
    const available = Math.max(1, rootRect.height - sliderH - splitterH);

    // y is the desired bottom edge of the controls pane.
    const y = Math.max(0, Math.min(available, e.clientY - rootRect.top));
    const pct = y / available;
    this.mobileControlsSplitPct = Math.max(0.2, Math.min(0.75, pct));
  }

  private onMobileSplitterPointerUp(e: PointerEvent) {
    if (!this.draggingMobileSplit) return;
    if (
      this.mobileSplitPointerId !== null &&
      e.pointerId !== this.mobileSplitPointerId
    ) {
      return;
    }
    this.draggingMobileSplit = false;
    this.mobileSplitPointerId = null;
  }

  private onDesktopSplitterPointerDown(e: PointerEvent) {
    if (this.isNarrowLayout()) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.draggingDesktopSplit = true;
    this.desktopSplitPointerId = e.pointerId;
    this.onDesktopSplitterPointerMove(e);
  }

  private onDesktopSplitterPointerMove(e: PointerEvent) {
    if (!this.draggingDesktopSplit) return;
    if (
      this.desktopSplitPointerId !== null &&
      e.pointerId !== this.desktopSplitPointerId
    ) {
      return;
    }
    e.preventDefault();
    if (this.isNarrowLayout()) return;

    const root = this.shadowRoot?.querySelector(".song-play") as HTMLElement | null;
    if (!root) return;
    const rect = root.getBoundingClientRect();

    const splitterW = 10; // keep in sync with CSS --cb-song-vsplitter-w
    const x = Math.max(0, Math.min(rect.width - splitterW, e.clientX - rect.left));
    const controlsW = Math.max(0, rect.width - splitterW - x);
    this.desktopControlsWidthPx = Math.max(240, Math.min(520, controlsW));
  }

  private onDesktopSplitterPointerUp(e: PointerEvent) {
    if (!this.draggingDesktopSplit) return;
    if (
      this.desktopSplitPointerId !== null &&
      e.pointerId !== this.desktopSplitPointerId
    ) {
      return;
    }
    this.draggingDesktopSplit = false;
    this.desktopSplitPointerId = null;
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

  private renderLyricsExitConfirm() {
    return html`
      <div
        class="lyrics-exit-overlay"
        @click=${(e: MouseEvent) => {
          if (e.target !== e.currentTarget) return;
          this.dismissLyricsExitDialogKeepEditing();
        }}
      >
        <div
          class="lyrics-exit-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lyrics-exit-title"
          @click=${(e: Event) => e.stopPropagation()}
        >
          <h2 id="lyrics-exit-title" class="lyrics-exit-title">Unsaved lyric changes</h2>
          <form
            class="lyrics-exit-actions lyrics-exit-form"
            @submit=${(e: Event) => this.onLyricsExitFormSubmit(e)}
          >
            <button type="submit" class="lyrics-exit-primary">Save and exit (Enter)</button>
            <button
              type="button"
              class="lyrics-exit-danger"
              @click=${() => this.onLyricsExitConfirmDiscard()}
            >
              Discard and exit (DEL)
            </button>
            <button
              type="button"
              class="lyrics-exit-secondary"
              @click=${() => this.dismissLyricsExitDialogKeepEditing()}
            >
              Keep editing (ESC)
            </button>
          </form>
        </div>
      </div>
    `;
  }

  private async onLyricsExitConfirmSave() {
    try {
      await this.persistLyricsFromEditor();
    } catch {
      window.alert("Could not save lyrics.");
      return;
    }
    this.lyricsExitConfirmOpen = false;
    this.resolveLyricsUnsavedGuardIfPending(true);
    this.editing = false;
  }

  private onLyricsExitConfirmDiscard() {
    this.lyricsExitConfirmOpen = false;
    if (!this.song?.lyricsFile) {
      this.lyrics = "";
    }
    this.lyricsModified = false;
    this.resolveLyricsUnsavedGuardIfPending(true);
    this.editing = false;
  }

  private renderLyricsEditor() {
    return html`
      <lyrics-editor
        .bodyHtml=${this.lyrics ? extractBodyContent(this.lyrics) : ""}
        .editorCss=${""}
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
    const practice = callerBuddy.getPracticeMode();
    const autoPauseBlur = callerBuddy.getAutoPauseOnWindowBlur();
    return html`
      <div class="play-extras-row">
        <div class="play-extras-checks">
          <label class="song-play-extras-toggle" title=${PRACTICE_MODE_TOOLTIP}>
            <input
              type="checkbox"
              .checked=${practice}
              title=${PRACTICE_MODE_TOOLTIP}
              @change=${this.onPracticeChange}
            />
            Practice
          </label>
          <label class="song-play-extras-toggle" title=${AUTO_PAUSE_ON_BLUR_TOOLTIP}>
            <input
              type="checkbox"
              .checked=${autoPauseBlur}
              title=${AUTO_PAUSE_ON_BLUR_TOOLTIP}
              @change=${this.onAutoPauseBlurChange}
            />
            Auto-Pause
          </label>
        </div>
        <div class="play-extras-actions">
          ${this.renderEditLyricsButton()}
          <button
            class="primary close-play-btn"
            title="Close player and return to playlist (Esc)"
            @click=${this.onGoToEnd}
          >
            Close
          </button>
        </div>
      </div>
    `;
  }

  private onPracticeChange(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    callerBuddy.setPracticeMode(checked);
    this.requestUpdate();
  }

  private onAutoPauseBlurChange(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    callerBuddy.setAutoPauseOnWindowBlur(checked);
    this.requestUpdate();
  }

  private onTogglePractice() {
    callerBuddy.setPracticeMode(!callerBuddy.getPracticeMode());
    this.requestUpdate();
  }

  private renderEditLyricsButton() {
    if (this.editing) return nothing;
    const song = this.song;
    if (!song) return nothing;
    const hasLyrics = isSingingCall(song);
    return html`
      <button
        class="secondary edit-lyrics-btn"
        title=${hasLyrics ? "Edit lyrics (Ctrl+E)" : "Create lyrics (Ctrl+E)"}
        @click=${hasLyrics ? this.onEditLyrics : this.onCreateLyrics}
      >
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

  /**
   * Prompt when closing song play while the lyrics editor has unsaved edits.
   * Uses the same dialog as leaving the editor: save, discard and leave, or stay.
   */
  private async runSongPlayUnsavedGuard(): Promise<boolean> {
    if (!this.editing || !this.lyricsModified) return true;
    if (!this.lyricsUnsavedGuardPromise) {
      this.lyricsUnsavedGuardPromise = new Promise<boolean>((resolve) => {
        this.lyricsExitPendingGuardResolve = resolve;
      });
      this.lyricsExitConfirmOpen = true;
      this.requestUpdate();
    }
    return await this.lyricsUnsavedGuardPromise;
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
    if (this.lyricsExitConfirmOpen) return;
    if (this.lyricsModified) {
      this.lyricsExitConfirmOpen = true;
      return;
    }
    if (!this.song?.lyricsFile) {
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
      this.pausePlayback();
    } else {
      this.beginPlayback();
    }
  }

  private pausePlayback() {
    if (!this.playing) return;
    callerBuddy.audio.pause();
    this.playing = false;
    this.pausePatterTimer();
  }

  private onRestart() {
    callerBuddy.audio.seek(0);
    this.currentTime = 0;
    this.resetPatterTimer();
    if (this.playing && this.song && isPatter(this.song)) {
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
    this.clampPatterLoopIfNeeded();
    this.applyLoopPoints();
  }

  private setLoopFromCurrent(which: "start" | "end") {
    if (which === "start") {
      this.loopStart = this.currentTime;
    } else {
      this.loopEnd = this.currentTime;
    }
    this.clampPatterLoopIfNeeded();
    this.applyLoopPoints();
  }

  private applyLoopPoints() {
    if (this.song && isPatter(this.song) && this.duration > 0) {
      this.clampPatterLoopIfNeeded();
    }
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
    if (this.song && isPatter(this.song)) {
      this.clampPatterLoopIfNeeded();
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
    this.patterMinutes = Number((e.target as HTMLInputElement).value) || 6;
    this.resetPatterTimer();
    if (this.playing && this.song && isPatter(this.song)) {
      this.startPatterTimer();
    }
    void callerBuddy.updateSetting("patterTimerMinutes", this.patterMinutes);
  }

  private onPatterTimerEnabledChange(e: Event) {
    this.setPatterTimerEnabled((e.target as HTMLInputElement).checked);
  }

  private togglePatterTimerEnabled() {
    this.setPatterTimerEnabled(!this.patterTimerEnabled);
  }

  private setPatterTimerEnabled(enabled: boolean) {
    if (this.patterTimerEnabled === enabled) return;
    this.patterTimerEnabled = enabled;
    if (!enabled) {
      this.stopPatterAlarm();
    } else if (
      this.patterTimerRunning &&
      this.patterCountdown <= 0 &&
      this.patterAlarmFired
    ) {
      this.playPatterAlarm();
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
    this.stopPatterAlarm();
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
        if (this.patterTimerEnabled) {
          this.playPatterAlarm();
        }
      }
    }, 1000);
  }

  /** Pause countdown (music paused); keeps remaining time. */
  private pausePatterTimer() {
    if (this.patterInterval !== null) {
      clearInterval(this.patterInterval);
      this.patterInterval = null;
    }
    this.stopPatterAlarm();
  }

  private stopPatterAlarm() {
    if (this.patterAlarmInterval !== null) {
      clearInterval(this.patterAlarmInterval);
      this.patterAlarmInterval = null;
    }
  }

  private playPatterAlarm() {
    if (!this.patterTimerEnabled) return;
    callerBuddy.audio.playBeep();
    // Replay every 15 seconds (matches break timer)
    this.patterAlarmInterval = window.setInterval(() => {
      callerBuddy.audio.playBeep();
    }, 15_000);
  }

  /** Resume countdown when music resumes. */
  private resumePatterTimer() {
    if (this.patterTimerRunning && this.playing && this.patterInterval === null) {
      this.startPatterTick();
    }
  }

  private stopPatterTimer() {
    this.patterTimerRunning = false;
    if (this.patterInterval !== null) {
      clearInterval(this.patterInterval);
      this.patterInterval = null;
    }
    this.stopPatterAlarm();
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
