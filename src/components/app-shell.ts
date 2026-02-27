/**
 * Root application shell. Manages the Chrome-like tab layout and global controls.
 *
 * Layout:
 *  ┌─────────────────────────────────────────────────────┐
 *  │ [Tab1] [Tab2] [Tab3]                     [⚙ Menu]  │
 *  ├─────────────────────────────────────────────────────┤
 *  │                                                     │
 *  │              Active tab content                     │
 *  │                                                     │
 *  └─────────────────────────────────────────────────────┘
 *
 * See CallerBuddySpec.md §"Basic UI layout" for design rationale.
 */

import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { callerBuddy } from "../caller-buddy.js";
import { StateEvents, TabType, type EditorTabData } from "../services/app-state.js";
import { APP_VERSION } from "../version.js";

// Side-effect imports to register custom elements
import "./tab-bar.js";
import "./welcome-view.js";
import "./playlist-editor.js";
import "./playlist-play.js";
import "./song-play.js";

@customElement("app-shell")
export class AppShell extends LitElement {
  @state() private showMenu = false;

  private _boundKeydown = (e: KeyboardEvent) => this.onKeydown(e);

  connectedCallback() {
    super.connectedCallback();
    callerBuddy.state.addEventListener(StateEvents.CHANGED, this.onStateChanged);
    document.addEventListener("keydown", this._boundKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    callerBuddy.state.removeEventListener(StateEvents.CHANGED, this.onStateChanged);
    document.removeEventListener("keydown", this._boundKeydown);
  }

  /** Global keyboard shortcuts for tab navigation and close.
   *  Uses Ctrl+]/[ instead of Ctrl+Tab because browsers reserve Ctrl+Tab
   *  for browser tab switching and never dispatch it to the page. */
  private onKeydown(e: KeyboardEvent) {
    const inInput =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement;
    if (inInput) return;

    const { tabs, activeTabId } = callerBuddy.state;
    if (tabs.length === 0) return;

    // Ctrl+< or Ctrl+, (back) and Ctrl+> or Ctrl+. (forward).
    const isBack =
      (e.ctrlKey && e.key === "<") ||
      (e.ctrlKey && e.key === ",") ||
      (e.ctrlKey && e.shiftKey && e.code === "Comma");
    const isForward =
      (e.ctrlKey && e.key === ">") ||
      (e.ctrlKey && e.key === ".") ||
      (e.ctrlKey && e.shiftKey && e.code === "Period");
    if (isBack) {
      e.preventDefault();
      if (callerBuddy.state.goBack()) return;
    }
    if (isForward) {
      e.preventDefault();
      if (callerBuddy.state.goForward()) return;
    }
    if (e.ctrlKey && e.key === "]") {
      e.preventDefault();
      const idx = tabs.findIndex((t) => t.id === activeTabId);
      const nextIdx = idx < 0 ? 0 : (idx + 1) % tabs.length;
      callerBuddy.state.activateTab(tabs[nextIdx].id);
      return;
    }
    if (e.ctrlKey && e.key === "[") {
      e.preventDefault();
      const idx = tabs.findIndex((t) => t.id === activeTabId);
      const prevIdx = idx <= 0 ? tabs.length - 1 : idx - 1;
      callerBuddy.state.activateTab(tabs[prevIdx].id);
      return;
    }
    if (e.ctrlKey && e.key === "w") {
      e.preventDefault();
      this.closeActiveTab();
      return;
    }
  }

  private async closeActiveTab() {
    const tab = callerBuddy.state.getActiveTab();
    if (!tab) return;
    if (tab.type === TabType.SongPlay) {
      callerBuddy.closeSongPlay();
      return;
    }
    if (await callerBuddy.state.isRootEditorTab(tab.id)) return;
    callerBuddy.state.closeTab(tab.id);
  }

  private onStateChanged = () => {
    this.requestUpdate();
  };

  render() {
    const { tabs, activeTabId } = callerBuddy.state;
    const activeTab = callerBuddy.state.getActiveTab();

    return html`
      <div class="shell">
        <header class="top-bar">
          <cb-tab-bar
            .tabs=${tabs}
            .activeTabId=${activeTabId}
            @tab-activate=${this.onTabActivate}
            @tab-close=${this.onTabClose}
          ></cb-tab-bar>
          <div class="global-controls">
            <button
              class="menu-btn"
              title="Menu"
              @click=${this.toggleMenu}
              aria-haspopup="true"
              aria-expanded="${this.showMenu}"
            >
              ☰
            </button>
            ${this.showMenu ? this.renderMenu() : nothing}
          </div>
        </header>
        <main class="content">
          ${/* PlaylistPlay is kept alive (hidden when inactive) so its break
              timer, clock, and SONG_ENDED listener survive tab switches.
              All other tabs use normal create/destroy on tab switch. */
            ''}
          ${tabs.some((t) => t.type === TabType.PlaylistPlay)
            ? html`<div class="keep-alive-pane"
                ?hidden=${activeTab?.type !== TabType.PlaylistPlay}>
                <playlist-play .active=${activeTab?.type === TabType.PlaylistPlay}></playlist-play>
              </div>`
            : nothing}
          ${activeTab && activeTab.type !== TabType.PlaylistPlay
            ? this.renderTab(activeTab)
            : nothing}
          ${!activeTab ? this.renderEmpty() : nothing}
        </main>
      </div>
    `;
  }

  /** Render the content for a non-keep-alive tab.
   *  PlaylistPlay is excluded — it is rendered by the keep-alive block above. */
  private renderTab(tab: { type: TabType; data?: unknown }) {
    switch (tab.type) {
      case TabType.Welcome:
        return html`<welcome-view></welcome-view>`;
      case TabType.PlaylistEditor: {
        const data = tab.data as EditorTabData | undefined;
        return html`<playlist-editor .dirHandle=${data?.dirHandle ?? null}></playlist-editor>`;
      }
      case TabType.SongPlay:
        return html`<song-play></song-play>`;
      default:
        return html`<p>Unknown tab type</p>`;
    }
  }

  private renderEmpty() {
    return html`
      <div class="empty">
        <p>No tabs open. Use the menu to get started.</p>
      </div>
    `;
  }

  private renderMenu() {
    return html`
      <div class="menu-overlay" @click=${this.closeMenu}></div>
      <div class="menu" role="menu">
        <button class="menu-item" role="menuitem" @click=${this.onWelcome}>
          Set CallerBuddy folder…
        </button>
        <hr />
        <div class="menu-item version" role="menuitem">
          CallerBuddy v${APP_VERSION}
        </div>
      </div>
    `;
  }

  // -- event handlers -------------------------------------------------------

  private onTabActivate(e: CustomEvent<{ id: string }>) {
    callerBuddy.state.activateTab(e.detail.id);
  }

  private async onTabClose(e: CustomEvent<{ id: string }>) {
    const tab = callerBuddy.state.tabs.find((t) => t.id === e.detail.id);
    if (!tab) return;
    if (tab.type === TabType.SongPlay) {
      callerBuddy.closeSongPlay();
      return;
    }
    if (await callerBuddy.state.isRootEditorTab(tab.id)) return;
    callerBuddy.state.closeTab(e.detail.id);
  }

  private toggleMenu() {
    this.showMenu = !this.showMenu;
  }

  private closeMenu() {
    this.showMenu = false;
  }

  private async onWelcome() {
    this.showMenu = false;
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      await callerBuddy.setRoot(handle);
    } catch {
      // user cancelled or picker unavailable — do nothing
    }
  }

  static styles = css`
    :host {
      display: block;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
    }

    .shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--cb-bg);
      color: var(--cb-fg);
      font-family: system-ui, -apple-system, sans-serif;
    }

    .top-bar {
      display: flex;
      align-items: stretch;
      background: var(--cb-tab-bar-bg);
      border-bottom: 1px solid var(--cb-border);
    }

    cb-tab-bar {
      flex: 1;
      min-width: 0;
    }

    .global-controls {
      position: relative;
      display: flex;
      align-items: center;
      padding: 0 8px;
    }

    .menu-btn {
      background: none;
      border: none;
      color: var(--cb-fg);
      font-size: 1.2rem;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
    }

    .menu-btn:hover {
      background: var(--cb-hover);
    }

    .menu-overlay {
      position: fixed;
      inset: 0;
      z-index: 999;
    }

    .menu {
      position: absolute;
      top: 100%;
      right: 0;
      background: var(--cb-menu-bg);
      border: 1px solid var(--cb-border);
      border-radius: 6px;
      box-shadow: 0 4px 16px var(--cb-shadow);
      z-index: 1000;
      min-width: 220px;
      padding: 4px 0;
    }

    .menu-item {
      display: block;
      width: 100%;
      padding: 8px 16px;
      text-align: left;
      background: none;
      border: none;
      color: var(--cb-fg);
      font-size: 0.9rem;
      cursor: pointer;
      white-space: nowrap;
    }

    .menu-item:hover {
      background: var(--cb-accent);
      color: var(--cb-fg-on-accent);
    }

    .menu-item.version {
      color: var(--cb-fg-tertiary);
      font-size: 0.8rem;
      cursor: default;
    }

    .menu-item.version:hover {
      background: none;
      color: var(--cb-fg-tertiary);
    }

    .menu hr {
      border: none;
      border-top: 1px solid var(--cb-border);
      margin: 4px 0;
    }

    .content {
      flex: 1;
      overflow: auto;
    }

    /* PlaylistPlay is kept alive across tab switches so its break timer
       and event listeners survive. Hidden via [hidden] when not active. */
    .keep-alive-pane {
      height: 100%;
    }

    .keep-alive-pane[hidden] {
      display: none;
    }

    .empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--cb-fg-tertiary);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "app-shell": AppShell;
  }
}
