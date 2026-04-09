import { css } from "lit";

/**
 * Styles for the `song-play` view (lyrics, patter/loop, transport, slider).
 * Kept in a separate module to keep `song-play.ts` focused on behavior.
 */
export const songPlayStyles = css`
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
      width: 100%;
      box-sizing: border-box;
      padding: 16px;
    }

    /* :where() gives these defaults zero specificity so authored HTML styles
       (e.g. background: lightyellow from a lyrics file) can override them. */
    :where(.lyrics-content) {
      font-size: 1rem;
      line-height: 1.7;
      background: var(--cb-bg);
      color: var(--cb-fg);
    }

    .lyrics-content.lyrics-plain {
      white-space: pre-wrap;
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

    .loop-box {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 0.9rem;
      padding: 8px;
      border: 2px solid var(--cb-border);
      border-radius: 6px;
      outline: none;
      cursor: default;
      transition: border-color 0.15s;
    }

    .loop-box:focus {
      border-color: var(--cb-accent);
      box-shadow: 0 0 0 1px var(--cb-accent);
    }

    .loop-box label {
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

    /* -- Contextual help --------------------------------------------------- */

    .ctx-help-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      font-size: 0.7rem;
      font-weight: 700;
      border-radius: 50%;
      border: 1px solid var(--cb-border);
      background: var(--cb-input-bg);
      color: var(--cb-fg-secondary);
      cursor: pointer;
      vertical-align: middle;
      margin-left: 6px;
      padding: 0;
      line-height: 1;
    }

    .ctx-help-btn:hover {
      background: var(--cb-hover);
      color: var(--cb-fg);
    }

    .adj-help-btn {
      align-self: flex-end;
      margin-bottom: 2px;
    }

    .ctx-help-panel {
      font-size: 0.8rem;
      line-height: 1.5;
      color: var(--cb-fg-secondary);
      background: var(--cb-hover);
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 6px;
    }

    .ctx-help-panel kbd {
      display: inline-block;
      padding: 1px 4px;
      font-family: inherit;
      font-size: 0.8em;
      background: var(--cb-input-bg);
      border: 1px solid var(--cb-border);
      border-radius: 3px;
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

    .meta-block {
      margin-top: 4px;
      padding-top: 10px;
      border-top: 1px solid var(--cb-border);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .meta-row {
      display: grid;
      grid-template-columns: 7.5rem 1fr;
      gap: 8px;
      align-items: center;
    }

    .meta-label {
      font-size: 0.85rem;
      color: var(--cb-fg-secondary);
    }

    .meta-input {
      padding: 4px 8px;
      border: 1px solid var(--cb-border);
      border-radius: 4px;
      background: var(--cb-input-bg);
      color: var(--cb-fg);
      font-size: 0.85rem;
    }

    .meta-input-categories {
      flex: 1;
      min-width: 0;
    }

    .meta-input-rank {
      width: 4.5rem;
      font-variant-numeric: tabular-nums;
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
    }

    .slider-track {
      position: absolute;
      inset: 0;
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
      top: -2px;
      bottom: -2px;
      width: 2px;
      padding: 0 5px;
      margin-left: -6px;
      box-sizing: content-box;
      background-clip: content-box;
      z-index: 3;
      cursor: ew-resize;
      touch-action: none;
    }

    .loop-marker:hover {
      padding: 0 4px;
      margin-left: -5px;
      border-left: 1px solid;
      border-right: 1px solid;
    }

    .loop-marker.start {
      background-color: var(--cb-success);
    }

    .loop-marker.start:hover {
      border-color: var(--cb-success);
    }

    .loop-marker.end {
      background-color: var(--cb-error);
    }

    .loop-marker.end:hover {
      border-color: var(--cb-error);
    }

    .slider-input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
      margin: 0;
      z-index: 1;
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

    .play-extras-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }

    /* -- Narrow / phone layout --------------------------------------------- */

    @media (max-width: 700px) {
      .song-play {
        grid-template-columns: 1fr;
        grid-template-rows: auto 1fr auto;
      }

      .right-panel {
        grid-column: 1;
        grid-row: 1;
        padding: 10px;
        gap: 12px;
        overflow-y: visible;
      }

      .left-panel {
        grid-column: 1;
        grid-row: 2;
        border-right: none;
        border-top: 1px solid var(--cb-border);
      }

      .slider-panel {
        grid-column: 1;
        grid-row: 3;
      }

      .transport {
        flex-wrap: wrap;
      }

      .patter-controls {
        max-width: none;
      }

      .loop-box {
        flex-wrap: wrap;
      }
    }
`;
