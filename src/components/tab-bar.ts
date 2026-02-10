/**
 * Chrome-like tab bar component.
 * Renders a row of tabs with click-to-activate and close buttons.
 * See CallerBuddySpec.md §"Basic UI layout" for the Chrome-browser analogy.
 */

import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { TabInfo } from "../services/app-state.js";

@customElement("cb-tab-bar")
export class CbTabBar extends LitElement {
  @property({ type: Array })
  tabs: TabInfo[] = [];

  @property({ type: String })
  activeTabId = "";

  render() {
    return html`
      <div class="tab-bar" role="tablist">
        ${this.tabs.map(
          (tab) => html`
            <div
              class="tab ${tab.id === this.activeTabId ? "active" : ""}"
              role="tab"
              aria-selected="${tab.id === this.activeTabId}"
              tabindex="0"
              title="${tab.title}"
              @click=${() => this.onTabClick(tab.id)}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") this.onTabClick(tab.id);
              }}
            >
              <span class="tab-title">${tab.title}</span>
              ${tab.closable
                ? html`
                    <button
                      class="close-btn"
                      title="Close tab (Ctrl+W)"
                      @click=${(e: Event) => {
                        e.stopPropagation();
                        this.onCloseClick(tab.id);
                      }}
                    >
                      ×
                    </button>
                  `
                : ""}
            </div>
          `,
        )}
      </div>
    `;
  }

  private onTabClick(id: string) {
    this.dispatchEvent(
      new CustomEvent("tab-activate", { detail: { id }, bubbles: true, composed: true }),
    );
  }

  private onCloseClick(id: string) {
    this.dispatchEvent(
      new CustomEvent("tab-close", { detail: { id }, bubbles: true, composed: true }),
    );
  }

  static styles = css`
    :host {
      display: block;
    }

    .tab-bar {
      display: flex;
      background: var(--cb-tab-bar-bg, #1e1e2e);
      border-bottom: 1px solid var(--cb-border, #333);
      overflow-x: auto;
      min-height: 36px;
    }

    .tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      font-size: 0.85rem;
      color: var(--cb-tab-fg, rgba(255, 255, 255, 0.6));
      cursor: pointer;
      border-right: 1px solid var(--cb-border, #333);
      white-space: nowrap;
      user-select: none;
      transition: background-color 0.15s;
    }

    .tab:hover {
      background: var(--cb-tab-hover, rgba(255, 255, 255, 0.06));
    }

    .tab.active {
      color: var(--cb-tab-active-fg, #fff);
      background: var(--cb-tab-active-bg, #242434);
      border-bottom: 2px solid var(--cb-accent, #646cff);
    }

    .tab-title {
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .close-btn {
      background: none;
      border: none;
      color: inherit;
      font-size: 1rem;
      line-height: 1;
      padding: 0 2px;
      cursor: pointer;
      border-radius: 3px;
      opacity: 0.5;
    }

    .close-btn:hover {
      opacity: 1;
      background: rgba(255, 255, 255, 0.12);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "cb-tab-bar": CbTabBar;
  }
}
