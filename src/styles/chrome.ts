import { css } from "lit";

/**
 * Shared chrome styles for Lit shadow roots.
 * Include in each component's `static styles` array (index.css does not pierce shadow DOM).
 */

/** Contextual "?" help button next to panel headings. */
export const ctxHelpBtnStyles = css`
  .ctx-help-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1.125rem;
    height: 1.125rem;
    font-size: 0.7rem;
    font-weight: 700;
    border-radius: 50%;
    border: 1px solid var(--cb-accent);
    background: none;
    color: var(--cb-accent);
    cursor: pointer;
    vertical-align: middle;
    margin-left: 6px;
    padding: 0;
    line-height: 1;
  }

  .ctx-help-btn:hover {
    background: none;
    border-color: var(--cb-accent-hover);
    color: var(--cb-accent-hover);
  }
`;

/** Dimmed full-viewport backdrop. Pair with existing *-modal panels. */
export const modalOverlayStyles = css`
  .cb-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 2100;
  }
`;

/** Primary / muted / icon-btn used by playlist and player chrome. */
export const chromeButtonStyles = css`
  .primary {
    border-radius: 6px;
    border: 1px solid transparent;
    padding: 6px 16px;
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

  .icon-btn {
    background: none;
    border: none;
    color: var(--cb-fg-secondary);
    font-size: 1rem;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1;
  }

  .icon-btn:hover {
    color: var(--cb-fg);
    background: var(--cb-hover);
  }
`;

/** Simple OK-only message dialog (replaces window.alert). Sits above other modals. */
export const alertDialogStyles = css`
  .cb-alert-overlay {
    z-index: 2400;
  }

  .cb-alert-dialog {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(92vw, 24rem);
    box-sizing: border-box;
    padding: 1.25rem 1.35rem;
    background: var(--cb-bg);
    color: var(--cb-fg);
    border: 1px solid var(--cb-border);
    border-radius: 10px;
    box-shadow: 0 12px 40px var(--cb-shadow);
    z-index: 2401;
  }

  .cb-alert-body {
    margin: 0 0 1.1rem;
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .cb-alert-actions {
    display: flex;
    flex-direction: column;
  }

  .cb-alert-ok {
    border-radius: 8px;
    border: 1px solid transparent;
    padding: 0.65em 1em;
    font-size: 1rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    background: var(--cb-accent);
    color: var(--cb-fg-on-accent);
  }

  .cb-alert-ok:hover {
    background: var(--cb-accent-hover, var(--cb-accent));
  }
`;
