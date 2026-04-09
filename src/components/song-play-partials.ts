/**
 * Template partials for `<song-play>`: patter/loop panel, transport row, progress slider.
 * Keeps the main component file smaller without changing behavior.
 */

import { html, nothing, type TemplateResult } from "lit";
import { formatCountdown } from "../utils/format.js";

export type PatterControlsCtx = {
  loopStart: number;
  loopEnd: number;
  showLoopHelp: boolean;
  showPatterTimerHelp: boolean;
  patterTimerEnabled: boolean;
  patterMinutes: number;
  patterCountdown: number;
  toggleLoopHelp: () => void;
  togglePatterTimerHelp: () => void;
  onLoopBoxKeydown: (which: "start" | "end", e: KeyboardEvent) => void;
  onLoopBtnMousedown: (e: Event) => void;
  nudgeLoop: (which: "start" | "end", delta: number) => void;
  setLoopFromCurrent: (which: "start" | "end") => void;
  onPatterTimerEnabledChange: (e: Event) => void;
  onPatterMinutesChange: (e: Event) => void;
  onPatterMinutesKeydown: (e: KeyboardEvent) => void;
};

export function renderPatterControls(ctx: PatterControlsCtx): TemplateResult {
  return html`
    <div class="patter-controls">
      <h3>Loop Controls
        <button class="ctx-help-btn" title="What are loop controls?"
          @click=${ctx.toggleLoopHelp}>?</button>
      </h3>
      ${ctx.showLoopHelp ? html`
        <div class="ctx-help-panel">
          Looping repeats a section of the music seamlessly so patter can
          run as long as you need. Set <strong>Loop Start</strong> and
          <strong>Loop End</strong> to define the region. Click
          <strong>Set</strong> to capture the current playback position,
          then fine-tune with the nudge buttons (&plusmn;10ms or &plusmn;100ms).
          Looping activates when Loop End is greater than zero. Points are saved per song.
        </div>` : nothing}
      <div class="loop-box" tabindex="0"
           title="Click to focus \u2014 ←/→ nudge \u00b110ms, Ctrl+←/→ nudge \u00b1100ms, Enter = Set"
           @keydown=${(e: KeyboardEvent) => ctx.onLoopBoxKeydown("start", e)}>
        <label>Loop Start:</label>
        <span class="loop-value">${ctx.loopStart.toFixed(2)}s</span>
        <button class="nudge" tabindex="-1" title="Nudge \u2212100ms (Ctrl+\u2190)"
          @mousedown=${ctx.onLoopBtnMousedown}
          @click=${() => ctx.nudgeLoop("start", -0.1)}>\u25c4\u25c4</button>
        <button class="nudge" tabindex="-1" title="Nudge \u221210ms (\u2190)"
          @mousedown=${ctx.onLoopBtnMousedown}
          @click=${() => ctx.nudgeLoop("start", -0.01)}>\u25c4</button>
        <button class="nudge set-btn" tabindex="-1" title="Set to current position (Enter)"
          @mousedown=${ctx.onLoopBtnMousedown}
          @click=${() => ctx.setLoopFromCurrent("start")}>Set</button>
        <button class="nudge" tabindex="-1" title="Nudge +10ms (\u2192)"
          @mousedown=${ctx.onLoopBtnMousedown}
          @click=${() => ctx.nudgeLoop("start", 0.01)}>\u25ba</button>
        <button class="nudge" tabindex="-1" title="Nudge +100ms (Ctrl+\u2192)"
          @mousedown=${ctx.onLoopBtnMousedown}
          @click=${() => ctx.nudgeLoop("start", 0.1)}>\u25ba\u25ba</button>
      </div>
      <div class="loop-box" tabindex="0"
           title="Click to focus \u2014 ←/→ nudge \u00b110ms, Ctrl+←/→ nudge \u00b1100ms, Enter = Set"
           @keydown=${(e: KeyboardEvent) => ctx.onLoopBoxKeydown("end", e)}>
        <label>Loop End:</label>
        <span class="loop-value">${ctx.loopEnd.toFixed(2)}s</span>
        <button class="nudge" tabindex="-1" title="Nudge \u2212100ms (Ctrl+\u2190)"
          @mousedown=${ctx.onLoopBtnMousedown}
          @click=${() => ctx.nudgeLoop("end", -0.1)}>\u25c4\u25c4</button>
        <button class="nudge" tabindex="-1" title="Nudge \u221210ms (\u2190)"
          @mousedown=${ctx.onLoopBtnMousedown}
          @click=${() => ctx.nudgeLoop("end", -0.01)}>\u25c4</button>
        <button class="nudge set-btn" tabindex="-1" title="Set to current position (Enter)"
          @mousedown=${ctx.onLoopBtnMousedown}
          @click=${() => ctx.setLoopFromCurrent("end")}>Set</button>
        <button class="nudge" tabindex="-1" title="Nudge +10ms (\u2192)"
          @mousedown=${ctx.onLoopBtnMousedown}
          @click=${() => ctx.nudgeLoop("end", 0.01)}>\u25ba</button>
        <button class="nudge" tabindex="-1" title="Nudge +100ms (Ctrl+\u2192)"
          @mousedown=${ctx.onLoopBtnMousedown}
          @click=${() => ctx.nudgeLoop("end", 0.1)}>\u25ba\u25ba</button>
      </div>
      <div class="loop-status ${ctx.loopEnd > 0 ? "active" : "inactive"}">
        ${ctx.loopEnd > 0 ? "Looping active" : "Looping inactive (set Loop End to enable)"}
      </div>

      <hr />

      <h3>Patter Timer
        <button class="ctx-help-btn" title="What is the patter timer?"
          @click=${ctx.togglePatterTimerHelp}>?</button>
      </h3>
      ${ctx.showPatterTimerHelp ? html`
        <div class="ctx-help-panel">
          The patter timer counts down while the music plays. Set the
          duration in minutes. When it reaches zero a chime sounds once,
          and the counter continues into negative (red) so you can see
          how far over time you are. Your duration setting is saved.
        </div>` : nothing}
      <div class="patter-timer-controls ${ctx.patterTimerEnabled ? "" : "timer-disabled"}">
        <div class="patter-toggle-row">
          <label class="patter-toggle">
            <input
              type="checkbox"
              .checked=${ctx.patterTimerEnabled}
              @change=${ctx.onPatterTimerEnabledChange}
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
            .value=${String(ctx.patterMinutes)}
            @change=${ctx.onPatterMinutesChange}
            @keydown=${ctx.onPatterMinutesKeydown}
          />
        </div>
        <div class="patter-countdown ${!ctx.patterTimerEnabled ? "disabled" : ""} ${ctx.patterCountdown <= 0 ? "overtime" : ""}">
          ${formatCountdown(ctx.patterCountdown)}
        </div>
      </div>
    </div>
  `;
}

export type TransportCtx = {
  playing: boolean;
  onPlayPause: () => void;
  onRestart: () => void;
  onSeekDelta: (seconds: number) => void;
  onGoToEnd: () => void;
};

export function renderTransport(ctx: TransportCtx): TemplateResult {
  return html`
    <div class="transport">
      <button class="ctrl-btn" title="Restart (Home)" @click=${ctx.onRestart}>⏮</button>
      <button class="ctrl-btn" title="Back 5s (Ctrl+←)" @click=${() => ctx.onSeekDelta(-5)}>⏪</button>
      <button class="ctrl-btn" title="Back 2s (←)" @click=${() => ctx.onSeekDelta(-2)}>◄</button>
      <button class="ctrl-btn play-btn" title="${ctx.playing ? "Pause (Space)" : "Play (Space)"}"
        @click=${ctx.onPlayPause}>
        ${ctx.playing ? "⏸" : "▶"}
      </button>
      <button class="ctrl-btn" title="Forward 2s (→)" @click=${() => ctx.onSeekDelta(2)}>►</button>
      <button class="ctrl-btn" title="Forward 5s (Ctrl+→)" @click=${() => ctx.onSeekDelta(5)}>⏩</button>
      <button class="ctrl-btn" title="Go to end (End)" @click=${ctx.onGoToEnd}>⏭</button>
    </div>
  `;
}

export type SliderCtx = {
  effectiveDuration: number;
  effectiveCurrent: number;
  sourceDuration: number;
  loopStart: number;
  loopEnd: number;
  loopActive: boolean;
  onSliderInput: (e: Event) => void;
  onLoopMarkerPointerDown: (which: "start" | "end", e: PointerEvent) => void;
  onLoopMarkerPointerMove: (e: PointerEvent) => void;
  onLoopMarkerPointerUp: (e: PointerEvent) => void;
};

export function renderSlider(ctx: SliderCtx): TemplateResult {
  const pct =
    ctx.effectiveDuration > 0
      ? (ctx.effectiveCurrent / ctx.effectiveDuration) * 100
      : 0;
  const loopStartPct =
    ctx.sourceDuration > 0 ? (ctx.loopStart / ctx.sourceDuration) * 100 : 0;
  const loopEndPct =
    ctx.sourceDuration > 0 ? (ctx.loopEnd / ctx.sourceDuration) * 100 : 0;

  return html`
    <div class="slider-container">
      <div class="slider-track">
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
        <div class="progress" style="width: ${pct}%"></div>
      </div>

      ${ctx.loopActive
        ? html`
            <div class="loop-marker start" style="left: ${loopStartPct}%"
              title="Loop start: ${ctx.loopStart.toFixed(2)}s \u2014 drag to reposition"
              @pointerdown=${(e: PointerEvent) => ctx.onLoopMarkerPointerDown("start", e)}
              @pointermove=${ctx.onLoopMarkerPointerMove}
              @pointerup=${ctx.onLoopMarkerPointerUp}
            ></div>
            <div class="loop-marker end" style="left: ${loopEndPct}%"
              title="Loop end: ${ctx.loopEnd.toFixed(2)}s \u2014 drag to reposition"
              @pointerdown=${(e: PointerEvent) => ctx.onLoopMarkerPointerDown("end", e)}
              @pointermove=${ctx.onLoopMarkerPointerMove}
              @pointerup=${ctx.onLoopMarkerPointerUp}
            ></div>
          `
        : nothing}

      <input
        type="range"
        class="slider-input"
        min="0"
        max=${ctx.effectiveDuration || 1}
        step="0.1"
        .value=${String(ctx.effectiveCurrent)}
        @input=${ctx.onSliderInput}
        title="Song position"
      />
    </div>
  `;
}
