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
