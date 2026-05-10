import { css } from "lit";

/**
 * Styles for the `song-play` view (lyrics, patter/loop, transport, slider).
 * Kept in a separate module to keep `song-play.ts` focused on behavior.
 */
export const songPlayStyles = css`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
      /* Viewport MQs use layout width (~980 on stuck Samsung WebAPK); use container
       * width so stacked controls/lyrics match the real shell width (~360). */
      container-type: inline-size;
      container-name: cb-song-play;
    }

    .song-play {
      --cb-song-splitter-h: 10px;
      --cb-song-vsplitter-w: 10px;
      /* Controls (right-panel) height in narrow layout; set from song-play.ts */
      --cb-song-controls-h: 33%;
      /* Controls (right-panel) width in wide layout; set from song-play.ts */
      --cb-song-controls-w: 320px;
      display: grid;
      grid-template-columns: 1fr var(--cb-song-vsplitter-w) var(--cb-song-controls-w);
      grid-template-rows: 1fr auto;
      height: 100%;
      min-height: 0;
    }

    /* -- Left panel: lyrics or patter controls ----------------------------- */

    .left-panel {
      grid-column: 1;
      grid-row: 1;
      overflow-y: auto;
      border-right: none;
      min-width: 0;
      min-height: 0;
    }

    .lyrics-content {
      width: 100%;
      box-sizing: border-box;
      padding: 16px;
      /* Authored lyric CSS rewrites body selectors to .lyrics-content and may set margin;
         margin is transparent and shows the panel — flush to edges in the player. */
      margin: 0 !important;
    }

    /* CallerBuddy owns lyric styling at runtime (HTML is semantic markup only). */
    .lyrics-content {
      background: lightyellow;
      font-family: Roboto, Arial, sans-serif;
      font-size: var(--cb-lyrics-font-size, 13pt);
      line-height: 140%;
      color: black;
    }

    .lyrics-content h1 {
      font-size: 1.25em;
      display: inline;
    }

    .lyrics-content .info {
      color: blue;
      font-size: 0.75em;
      font-weight: normal;
    }

    .lyrics-content h2 {
      color: red;
      font-size: 1.125em;
      font-weight: normal;
      margin: 0.6em 0 0;
    }

    .lyrics-content p {
      margin: 0 0 0.4em;
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
      width: 5rem;
    }

    .loop-value {
      width: 4.375rem;
      font-variant-numeric: tabular-nums;
      font-family: monospace;
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
      width: 3.75rem;
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
      width: 1.125rem;
      height: 1.125rem;
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
      grid-column: 3;
      grid-row: 1;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      overflow-y: auto;
      min-width: 0;
      min-height: 0;
    }

    .desktop-splitter {
      grid-column: 2;
      grid-row: 1;
      /* Make the hit target wider than the visible line (touch-friendly).
         The extra width can overflow into adjacent grid columns. */
      width: calc(var(--cb-song-vsplitter-w) + 24px);
      margin-left: -12px;
      margin-right: -12px;
      padding: 0 12px;
      box-sizing: border-box;
      height: 100%;
      position: relative;
      z-index: 3;
      background:
        linear-gradient(
          to right,
          transparent,
          var(--cb-border) 45%,
          var(--cb-border) 55%,
          transparent
        );
      background-clip: content-box;
      cursor: col-resize;
      touch-action: none;
      user-select: none;
    }

    .mobile-splitter {
      display: none;
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
      width: 2.25rem;
      height: 2.25rem;
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
      width: 2.75rem;
      height: 2.75rem;
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
      width: 3.75rem;
      font-size: 0.85rem;
      color: var(--cb-fg-secondary);
    }

    .adj-value {
      width: 2.5rem;
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
      width: 3.75rem;
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
      height: 1.75rem;
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

    .primary {
      border-radius: 6px;
      border: 1px solid transparent;
      padding: 6px 14px;
      font-size: 0.85rem;
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

    .practice-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      user-select: none;
      color: var(--cb-fg);
    }

    .practice-toggle input {
      cursor: pointer;
    }

    /* Lyrics editor — unsaved exit prompt (Esc / backdrop / Keep editing = stay) */
    .lyrics-exit-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 2200;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      box-sizing: border-box;
    }

    .lyrics-exit-modal {
      width: min(92vw, 22rem);
      box-sizing: border-box;
      padding: 1.25rem 1.35rem;
      background: var(--cb-bg);
      color: var(--cb-fg);
      border: 1px solid var(--cb-border);
      border-radius: 10px;
      box-shadow: 0 12px 40px var(--cb-shadow);
      z-index: 2201;
    }

    .lyrics-exit-title {
      margin: 0 0 1rem;
      font-size: 1.1rem;
      font-weight: 600;
    }

    .lyrics-exit-actions {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin: 0;
    }

    .lyrics-exit-primary {
      border-radius: 8px;
      border: 1px solid transparent;
      padding: 0.6em 1em;
      font-size: 0.95rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      background: var(--cb-accent);
      color: var(--cb-fg-on-accent);
    }

    .lyrics-exit-danger {
      border-radius: 8px;
      padding: 0.55em 1em;
      font-size: 0.95rem;
      font-family: inherit;
      cursor: pointer;
      background: transparent;
      color: var(--cb-fg);
      border: 1px solid var(--cb-border-strong);
    }

    .lyrics-exit-secondary {
      border-radius: 8px;
      padding: 0.55em 1em;
      font-size: 0.95rem;
      font-family: inherit;
      cursor: pointer;
      background: transparent;
      color: var(--cb-fg);
      border: 1px solid var(--cb-border-strong);
    }

    /* Narrow / phone layout (container width — not viewport; fixes WebAPK innerW≈980) */
    @container cb-song-play (max-width: 700px) {
      .song-play {
        grid-template-columns: 1fr;
        grid-template-rows: var(--cb-song-controls-h) var(--cb-song-splitter-h) 1fr auto;
      }

      .right-panel {
        grid-column: 1;
        grid-row: 1;
        padding: 10px;
        gap: 12px;
        overflow-y: auto;
      }

      .desktop-splitter {
        display: none;
      }

      .mobile-splitter {
        display: block;
        grid-column: 1;
        grid-row: 2;
        height: var(--cb-song-splitter-h);
        background: linear-gradient(
          to bottom,
          transparent,
          var(--cb-border) 45%,
          var(--cb-border) 55%,
          transparent
        );
        cursor: row-resize;
        touch-action: none;
      }

      .left-panel {
        grid-column: 1;
        grid-row: 3;
        border-right: none;
        border-top: 1px solid var(--cb-border);
      }

      .slider-panel {
        grid-column: 1;
        grid-row: 4;
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
