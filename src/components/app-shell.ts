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
import { StateEvents, TabType, type EditorTabData, type TabInfo } from "../services/app-state.js";
import { APP_VERSION } from "../version.js";
import { log, getRecentLogs, clearRecentLogs } from "../services/logger.js";

// Side-effect imports to register custom elements
import "./tab-bar.js";
import "./welcome-view.js";
import "./playlist-editor.js";
import "./playlist-play.js";
import "./song-play.js";
import "./song-onboard.js";
import "./help-view.js";

/** Describe an event target compactly for logs (tag, id/class, text snippet). */
function describeTarget(t: EventTarget | null): string {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return "null";
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls =
    typeof el.className === "string" && el.className
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "";
  const txt = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
  return `${tag}${id}${cls}${txt ? ` "${txt}"` : ""}`;
}

@customElement("app-shell")
export class AppShell extends LitElement {
  @state() private showMenu = false;
  @state() private showLogs = false;
  @state() private logCopyStatus = "";

  private _boundKeydown = (e: KeyboardEvent) => this.onKeydown(e);
  private _boundFsChange = () => this.onFullscreenChange();
  private _boundPopstate = () => this.onPopstate();

  /** True on touch-primary installed PWAs (phones/tablets). Cached once. */
  private _isTouchPwa = false;

  /** Set to true when the app intentionally exits fullscreen (Close button).
   *  Prevents auto-reenter from fighting the user's intent. */
  private _closingApp = false;

  private _boundAutoFs = (e: Event) => this.autoEnterFullscreen(e);

  connectedCallback() {
    super.connectedCallback();
    callerBuddy.state.addEventListener(StateEvents.CHANGED, this.onStateChanged);
    document.addEventListener("keydown", this._boundKeydown);
    document.addEventListener("fullscreenchange", this._boundFsChange);

    // Trap the Android back button (and browser back) so it doesn't
    // navigate away from the PWA. We keep a sentinel history entry on
    // top; when the user presses back the sentinel is popped, we
    // re-push it immediately, and optionally perform in-app navigation.
    history.replaceState({ cbSentinel: true }, "");
    history.pushState({ cbSentinel: true }, "");
    window.addEventListener("popstate", this._boundPopstate);

    // On touch-primary installed PWAs, the manifest "display: fullscreen"
    // hides OS chrome but does NOT invoke the Fullscreen API.  Only the API
    // fixes the Android viewport-width bug that makes portrait text tiny.
    // Since requestFullscreen() requires a user gesture, we register a
    // one-shot capture-phase click handler to invoke it on the first tap.
    this._isTouchPwa =
      window.matchMedia("(hover: none) and (pointer: coarse)").matches &&
      (window.matchMedia("(display-mode: fullscreen)").matches ||
        window.matchMedia("(display-mode: standalone)").matches);
    const willRegister = this._isTouchPwa && !this.isFullscreenApi();
    if (willRegister) {
      document.addEventListener("click", this._boundAutoFs, { capture: true, once: true });
    }
    log.info(
      `[fs] init touchPwa=${this._isTouchPwa} fsApi=${this.isFullscreenApi()} ` +
        `mqStandalone=${window.matchMedia("(display-mode: standalone)").matches} ` +
        `mqFullscreen=${window.matchMedia("(display-mode: fullscreen)").matches} ` +
        `mqTouch=${window.matchMedia("(hover: none) and (pointer: coarse)").matches} ` +
        `listener-registered=${willRegister}`,
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    callerBuddy.state.removeEventListener(StateEvents.CHANGED, this.onStateChanged);
    document.removeEventListener("keydown", this._boundKeydown);
    document.removeEventListener("fullscreenchange", this._boundFsChange);
    document.removeEventListener("click", this._boundAutoFs, true);
    window.removeEventListener("popstate", this._boundPopstate);
  }

  /** Called when the browser back button (Android nav bar) is pressed. */
  private onPopstate() {
    log.info(`[ui] back-button pressed`);
    // Re-push the sentinel so the trap stays active for the next press.
    history.pushState({ cbSentinel: true }, "");
    // Use in-app tab back navigation if available.
    void this.handleGoBack();
  }

  /** Invoke the Fullscreen API on the first user gesture (touch PWA only). */
  private autoEnterFullscreen(e?: Event) {
    log.info(
      `[fs] auto-enter click fired (alreadyFs=${this.isFullscreenApi()}) ` +
        `target=${describeTarget(e?.target ?? null)}`,
    );
    if (this.isFullscreenApi()) return;
    this.requestFullscreenApi();
  }

  /** When fullscreen state changes, on touch PWAs re-enter fullscreen on
   *  the next tap — unless the user explicitly chose to close the app. */
  private onFullscreenChange() {
    const fsApi = this.isFullscreenApi();
    const willReregister =
      this._isTouchPwa && !this._closingApp && !fsApi;
    log.info(
      `[fs] change -> ${fsApi ? "IN" : "OUT"} ` +
        `(touchPwa=${this._isTouchPwa} closing=${this._closingApp} ` +
        `reregister=${willReregister})`,
    );
    this.requestUpdate();
    if (!this._isTouchPwa || this._closingApp) return;
    if (!fsApi) {
      document.addEventListener("click", this._boundAutoFs, { capture: true, once: true });
    }
  }

  /** Whether the Fullscreen API is currently active (distinct from the
   *  manifest "display: fullscreen" mode which hides OS chrome but does
   *  not engage the API). */
  private isFullscreenApi(): boolean {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
    };
    return !!(document.fullscreenElement ?? doc.webkitFullscreenElement);
  }

  private requestFullscreenApi() {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const requestFS =
      el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
    log.info(
      `[fs] requestFullscreen called (haveStandard=${!!el.requestFullscreen} ` +
        `haveWebkit=${!!el.webkitRequestFullscreen})`,
    );
    const result = requestFS?.();
    if (result && typeof result.then === "function") {
      result.then(
        () => log.info(`[fs] requestFullscreen resolved`),
        (err: unknown) => {
          const e = err as { name?: string; message?: string } | null;
          log.warn(
            `[fs] requestFullscreen rejected name=${e?.name} message=${e?.message}`,
          );
        },
      );
    } else {
      log.info(`[fs] requestFullscreen returned non-promise (legacy webkit)`);
    }
  }

  private exitFullscreenApi(): Promise<void> | undefined {
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void>;
    };
    const exitFS =
      document.exitFullscreen?.bind(document) ??
      doc.webkitExitFullscreen?.bind(document);
    log.info(
      `[fs] exitFullscreen called (haveStandard=${!!document.exitFullscreen} ` +
        `haveWebkit=${!!doc.webkitExitFullscreen})`,
    );
    const result = exitFS?.();
    if (result && typeof result.then === "function") {
      return result.then(
        () => log.info(`[fs] exitFullscreen resolved`),
        (err: unknown) => {
          const e = err as { name?: string; message?: string } | null;
          log.warn(
            `[fs] exitFullscreen rejected name=${e?.name} message=${e?.message}`,
          );
        },
      );
    }
    log.info(`[fs] exitFullscreen returned non-promise (legacy webkit)`);
    return undefined;
  }

  private toggleFullscreen() {
    this.showMenu = false;
    const wasIn = this.isFullscreenApi();
    log.info(
      `[ui] menu: ${wasIn ? "In Window" : "Full Screen"} ` +
        `(toggle, wasIn=${wasIn})`,
    );
    log.info(`[fs] menu toggle (was ${wasIn ? "IN" : "OUT"})`);
    if (wasIn) {
      this.exitFullscreenApi();
    } else {
      this.requestFullscreenApi();
    }
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
      log.info(`[ui] key Ctrl+< (back)`);
      e.preventDefault();
      void this.handleGoBack();
      return;
    }
    if (isForward) {
      log.info(`[ui] key Ctrl+> (forward)`);
      e.preventDefault();
      void this.handleGoForward();
      return;
    }
    if (e.ctrlKey && e.key === "]") {
      log.info(`[ui] key Ctrl+] (next tab)`);
      e.preventDefault();
      void this.activateAdjacentTab(tabs, activeTabId, "next");
      return;
    }
    if (e.ctrlKey && e.key === "[") {
      log.info(`[ui] key Ctrl+[ (prev tab)`);
      e.preventDefault();
      void this.activateAdjacentTab(tabs, activeTabId, "prev");
      return;
    }
    if (e.ctrlKey && e.key === "w") {
      log.info(`[ui] key Ctrl+W (close tab)`);
      e.preventDefault();
      this.closeActiveTab();
      return;
    }
  }

  private async handleGoBack() {
    const active = callerBuddy.state.getActiveTab();
    const targetId = callerBuddy.state.peekBackTarget();
    if (
      active?.type === TabType.SongPlay &&
      targetId &&
      targetId !== callerBuddy.state.activeTabId
    ) {
      const ok = await callerBuddy.runSongPlayUnsavedGuard();
      if (!ok) return;
    }
    callerBuddy.state.goBack();
  }

  private async handleGoForward() {
    const active = callerBuddy.state.getActiveTab();
    const targetId = callerBuddy.state.peekForwardTarget();
    if (
      active?.type === TabType.SongPlay &&
      targetId &&
      targetId !== callerBuddy.state.activeTabId
    ) {
      const ok = await callerBuddy.runSongPlayUnsavedGuard();
      if (!ok) return;
    }
    callerBuddy.state.goForward();
  }

  /** Ctrl+] / Ctrl+[ : switch tab with unsaved-lyrics guard when leaving song play. */
  private async activateAdjacentTab(
    tabs: { id: string }[],
    activeTabId: string,
    dir: "next" | "prev",
  ) {
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const nextIdx =
      dir === "next"
        ? idx < 0
          ? 0
          : (idx + 1) % tabs.length
        : idx <= 0
          ? tabs.length - 1
          : idx - 1;
    const nextId = tabs[nextIdx].id;
    const active = callerBuddy.state.getActiveTab();
    if (active?.type === TabType.SongPlay && nextId !== activeTabId) {
      const ok = await callerBuddy.runSongPlayUnsavedGuard();
      if (!ok) return;
    }
    callerBuddy.state.activateTab(nextId);
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
        ${this.showLogs ? this.renderLogModal() : nothing}
      </div>
    `;
  }

  /** Render the content for a non-keep-alive tab.
   *  PlaylistPlay is excluded — it is rendered by the keep-alive block above. */
  private renderTab(tab: TabInfo) {
    switch (tab.type) {
      case TabType.Welcome:
        return html`<welcome-view></welcome-view>`;
      case TabType.PlaylistEditor: {
        const data = tab.data as EditorTabData | undefined;
        return html`<playlist-editor
          .dirHandle=${data?.dirHandle ?? null}
          .editorClosable=${tab.closable}
          .tabId=${tab.id}
        ></playlist-editor>`;
      }
      case TabType.SongPlay:
        return html`<song-play></song-play>`;
      case TabType.SongOnboard:
        return html`<song-onboard></song-onboard>`;
      case TabType.Help:
        return html`<help-view></help-view>`;
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
        <button class="menu-item" role="menuitem" @click=${this.onImportSongZip}>
          Import Song from ZIP…
        </button>
        <button class="menu-item" role="menuitem" @click=${this.onImportSongFolder}>
          Import Song from Folder…
        </button>
        <button class="menu-item" role="menuitem" @click=${this.toggleFullscreen}>
          ${this.isFullscreenApi() ? "In Window" : "Full Screen"}
        </button>
        <hr />
        <button class="menu-item" role="menuitem" @click=${this.onHelp}
          title="Open help documentation with walkthroughs and keyboard shortcuts">
          Help
        </button>
        <button class="menu-item" role="menuitem" @click=${this.onShowLogs}
          title="Show recent diagnostic log lines">
          Show Logs
        </button>
        <button class="menu-item" role="menuitem" @click=${this.onClose}>
          Close
        </button>
        <hr />
        <div class="menu-item version" role="menuitem">
          CallerBuddy v${APP_VERSION}
        </div>
      </div>
    `;
  }

  private renderLogModal() {
    const lines = getRecentLogs();
    const text = lines.join("\n");
    return html`
      <div class="log-overlay" @click=${this.closeLogs}></div>
      <div class="log-modal" role="dialog" aria-label="Recent logs"
           @click=${(e: Event) => e.stopPropagation()}>
        <header class="log-header">
          <span class="log-title">Logs (${lines.length})</span>
          <span class="log-status">${this.logCopyStatus}</span>
          <button class="log-btn" @click=${this.copyLogs} title="Copy all logs to clipboard">
            Copy
          </button>
          <button class="log-btn" @click=${this.clearLogs} title="Clear log buffer">
            Clear
          </button>
          <button class="log-btn" @click=${this.closeLogs} title="Close log viewer">
            Close
          </button>
        </header>
        <pre class="log-body">${text || "(no logs yet)"}</pre>
      </div>
    `;
  }

  private onShowLogs() {
    log.info(`[ui] menu: Show Logs`);
    this.showMenu = false;
    this.logCopyStatus = "";
    this.showLogs = true;
  }

  private closeLogs() {
    log.info(`[ui] logs: close`);
    this.showLogs = false;
  }

  private async copyLogs() {
    log.info(`[ui] logs: copy`);
    const text = getRecentLogs().join("\n");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        this.logCopyStatus = "Copied!";
      } else {
        // Fallback for environments without async clipboard support.
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        this.logCopyStatus = "Copied!";
      }
    } catch {
      this.logCopyStatus = "Copy failed";
    }
    setTimeout(() => {
      this.logCopyStatus = "";
    }, 2000);
  }

  private clearLogs() {
    log.info(`[ui] logs: clear`);
    clearRecentLogs();
    this.logCopyStatus = "Cleared";
    this.requestUpdate();
    setTimeout(() => {
      this.logCopyStatus = "";
    }, 1500);
  }

  // -- event handlers -------------------------------------------------------

  private async onTabActivate(e: CustomEvent<{ id: string }>) {
    const id = e.detail.id;
    log.info(`[ui] tab-activate id=${id}`);
    const active = callerBuddy.state.getActiveTab();
    if (active?.type === TabType.SongPlay && id !== active.id) {
      const ok = await callerBuddy.runSongPlayUnsavedGuard();
      if (!ok) return;
    }
    callerBuddy.state.activateTab(id);
  }

  private async onTabClose(e: CustomEvent<{ id: string }>) {
    log.info(`[ui] tab-close id=${e.detail.id}`);
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
    log.info(`[ui] menu ${this.showMenu ? "open" : "close"} (hamburger)`);
  }

  private closeMenu() {
    log.info(`[ui] menu close (overlay click)`);
    this.showMenu = false;
  }

  private async onWelcome() {
    log.info(`[ui] menu: Set CallerBuddy folder`);
    this.showMenu = false;
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      await callerBuddy.setRoot(handle);
    } catch {
      // user cancelled or picker unavailable — do nothing
    }
  }

  private async onImportSongZip() {
    log.info(`[ui] menu: Import Song from ZIP`);
    this.showMenu = false;
    if (!callerBuddy.state.rootHandle) {
      alert("Please set a CallerBuddy folder first.");
      return;
    }
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [
          {
            description: "ZIP archives",
            accept: { "application/zip": [".zip"] },
          },
        ],
        multiple: false,
      });
      const file = await fileHandle.getFile();
      await callerBuddy.openSongOnboard(file);
    } catch {
      // user cancelled or picker unavailable
    }
  }

  private async onImportSongFolder() {
    log.info(`[ui] menu: Import Song from Folder`);
    this.showMenu = false;
    if (!callerBuddy.state.rootHandle) {
      alert("Please set a CallerBuddy folder first.");
      return;
    }
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: "read" });
      await callerBuddy.openSongOnboardFromFolder(dirHandle);
    } catch {
      // user cancelled or picker unavailable
    }
  }

  private onHelp() {
    log.info(`[ui] menu: Help`);
    this.showMenu = false;
    callerBuddy.state.openSingletonTab(TabType.Help, "Help");
  }

  private async onClose() {
    log.info(`[ui] menu: Close`);
    this.showMenu = false;
    log.info(
      `[fs] onClose: setting _closingApp=true ` +
        `(wasFs=${this.isFullscreenApi()} touchPwa=${this._isTouchPwa})`,
    );
    this._closingApp = true;
    document.removeEventListener("click", this._boundAutoFs, true);
    if (this.isFullscreenApi()) {
      await this.exitFullscreenApi();
    }
    log.info(`[fs] onClose: calling window.close()`);
    window.close();
  }

  static styles = css`
    :host {
      display: block;
      height: 100vh;
      height: 100dvh;
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

    /* ── In-app log viewer ───────────────────────────────────────────── */
    .log-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 2000;
    }

    .log-modal {
      position: fixed;
      inset: 4% 4%;
      display: flex;
      flex-direction: column;
      background: var(--cb-bg);
      color: var(--cb-fg);
      border: 1px solid var(--cb-border);
      border-radius: 8px;
      box-shadow: 0 8px 32px var(--cb-shadow);
      z-index: 2001;
      overflow: hidden;
    }

    .log-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--cb-tab-bar-bg);
      border-bottom: 1px solid var(--cb-border);
      flex-wrap: wrap;
    }

    .log-title {
      font-weight: 600;
      flex: 1;
      min-width: 0;
    }

    .log-status {
      color: var(--cb-success);
      font-size: 0.85rem;
      min-width: 0;
    }

    .log-btn {
      background: var(--cb-bg);
      color: var(--cb-fg);
      border: 1px solid var(--cb-border-strong);
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 0.9rem;
      cursor: pointer;
    }

    .log-btn:hover {
      background: var(--cb-hover);
    }

    .log-body {
      flex: 1;
      margin: 0;
      padding: 12px;
      overflow: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.78rem;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
      background: var(--cb-panel-bg);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "app-shell": AppShell;
  }
}
