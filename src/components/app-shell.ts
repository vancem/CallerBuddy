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
 *
 * ── Mobile fullscreen (Fullscreen API) ────────────────────────────────────
 * Manifest `display: fullscreen` is NOT the same as `document.fullscreenElement`.
 * We optionally call `requestFullscreen()` so the user gets a dedicated gesture
 * for that API — see file-top comment in main.ts and BACKLOG.md § "Mobile
 * viewport & fullscreen". We do NOT steal the first tap globally (that broke
 * File System `requestPermission()`, which also requires a user gesture).
 */

import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { callerBuddy } from "../caller-buddy.js";
import { StateEvents, TabType, type EditorTabData, type TabInfo } from "../services/app-state.js";
import { APP_VERSION } from "../version.js";
import { log, getRecentLogs, clearRecentLogs } from "../services/logger.js";
import { isPhoneLikeTouchDevice } from "../utils/device-traits.js";
import { bumpLyricsScale } from "../utils/lyrics-scale.js";

// Side-effect imports to register custom elements
import "./tab-bar.js";
import "./welcome-view.js";
import "./playlist-editor.js";
import "./playlist-play.js";
import "./song-play.js";
import "./song-onboard.js";
import "./help-view.js";

/** Records that the user answered the one-time startup fullscreen prompt. */
const FS_STARTUP_PROMPT_KEY = "callerbuddy.fsStartupPrompt";
/** Avoid nagging if the user dismisses the resume fullscreen prompt. */
const FS_RESUME_DISMISS_TS_KEY = "callerbuddy.fsResumeDismissTs";
/**
 * Session-only fullscreen intent.
 *
 * We intentionally do NOT persist "I want fullscreen" across app restarts because
 * re-entering fullscreen requires a user gesture and can be confusing on launch.
 * The app can still *offer* fullscreen right before opening the playlist editor.
 */
const FS_SESSION_INTENT_KEY = "callerbuddy.fsSessionIntent";

@customElement("app-shell")
export class AppShell extends LitElement {
  @state() private showMenu = false;
  @state() private showLogs = false;
  @state() private logCopyStatus = "";
  /** If we "should be fullscreen" but OS kicked us out, prompt to re-enter. */
  @state() private showFullscreenResumePrompt = false;

  private _boundKeydown = (e: KeyboardEvent) => this.onKeydown(e);
  private _boundFsChange = () => this.onFullscreenChange();
  private _boundPopstate = () => this.onPopstate();
  private _boundAppReengaged = () => this.onAppReengaged();
  private _resumeCheckTimer: number | null = null;

  connectedCallback() {
    super.connectedCallback();
    callerBuddy.state.addEventListener(StateEvents.CHANGED, this.onStateChanged);
    document.addEventListener("keydown", this._boundKeydown);
    document.addEventListener("fullscreenchange", this._boundFsChange);
    window.addEventListener("focus", this._boundAppReengaged);
    window.addEventListener("pageshow", this._boundAppReengaged);
    document.addEventListener("visibilitychange", this._boundAppReengaged);

    // Trap the Android back button (and browser back) so it doesn't
    // navigate away from the PWA.
    //
    // Implementation detail:
    // - Keep exactly one forward "sentinel" history entry.
    // - When the user presses system back, the browser pops to the base entry and
    //   fires `popstate`. We immediately bounce forward via history.go(1), so the
    //   browser-level history never actually moves (prevents "exit app" at root).
    history.replaceState({ cbSentinel: "base" }, "");
    history.pushState({ cbSentinel: "sentinel" }, "");
    window.addEventListener("popstate", this._boundPopstate);

    // Legacy cleanup: older builds persisted fullscreen intent in localStorage,
    // which caused an immediate "resume fullscreen?" prompt on next launch.
    // We now treat fullscreen intent as session-only, so clear persisted flags.
    try {
      localStorage.removeItem(FS_STARTUP_PROMPT_KEY);
      localStorage.removeItem(FS_RESUME_DISMISS_TS_KEY);
    } catch {
      /* ignore */
    }

    log.info(
      `[fs] init fsApi=${this.isFullscreenApi()} ` +
        `touchInstalledPwa=${this.isTouchInstalledPwa()} ` +
        `startupPrompt=disabled`,
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    callerBuddy.state.removeEventListener(StateEvents.CHANGED, this.onStateChanged);
    document.removeEventListener("keydown", this._boundKeydown);
    document.removeEventListener("fullscreenchange", this._boundFsChange);
    window.removeEventListener("popstate", this._boundPopstate);
    window.removeEventListener("focus", this._boundAppReengaged);
    window.removeEventListener("pageshow", this._boundAppReengaged);
    document.removeEventListener("visibilitychange", this._boundAppReengaged);
    if (this._resumeCheckTimer !== null) {
      window.clearTimeout(this._resumeCheckTimer);
      this._resumeCheckTimer = null;
    }
  }

  /** Touch device + installed PWA (standalone or manifest fullscreen). */
  private isTouchInstalledPwa(): boolean {
    const isTouch =
      window.matchMedia("(pointer: coarse)").matches ||
      (navigator.maxTouchPoints ?? 0) > 0;
    return (
      isTouch &&
      (window.matchMedia("(display-mode: fullscreen)").matches ||
        window.matchMedia("(display-mode: standalone)").matches)
    );
  }

  /** Called when the browser back button (Android nav bar) is pressed. */
  private onPopstate() {
    log.info(`[ui] back-button pressed`);
    // Cancel the browser-level back navigation by bouncing forward.
    try {
      history.go(1);
    } catch {
      /* ignore */
    }

    // Use in-app tab back navigation if available; otherwise ignore the press.
    if (!callerBuddy.state.peekBackTarget()) {
      log.info(`[ui] back-button ignored (no in-app back target)`);
      return;
    }
    void this.handleGoBack();
  }

  /** Refresh menu label ("Full Screen" vs "Exit FullScreen"). OS may exit FS anytime. */
  private onFullscreenChange() {
    log.info(`[fs] change -> ${this.isFullscreenApi() ? "IN" : "OUT"}`);
    this.requestUpdate();
  }

  /** Whether the user preference implies we "should" be in Fullscreen API. */
  private prefersFullscreenApi(): boolean {
    try {
      return sessionStorage.getItem(FS_SESSION_INTENT_KEY) === "1";
    } catch {
      return false;
    }
  }

  /** Called when returning from lock/app switch/navigation away. */
  private onAppReengaged() {
    // Ignore transitions while hidden; we only care when coming back.
    if (document.visibilityState && document.visibilityState !== "visible") return;

    // Debounce: focus + visibilitychange often fire together.
    if (this._resumeCheckTimer !== null) window.clearTimeout(this._resumeCheckTimer);
    this._resumeCheckTimer = window.setTimeout(() => {
      this._resumeCheckTimer = null;
      this.maybePromptResumeFullscreen();
    }, 50);
  }

  private maybePromptResumeFullscreen() {
    // Keep it narrow: only do this on phone-class touch devices running installed PWA.
    if (!this.isTouchInstalledPwa() || !isPhoneLikeTouchDevice()) return;
    if (!this.prefersFullscreenApi()) return;
    if (this.isFullscreenApi()) return;

    // If the user just dismissed this, don't nag immediately.
    const now = Date.now();
    try {
      const last = Number(localStorage.getItem(FS_RESUME_DISMISS_TS_KEY) ?? "0");
      if (Number.isFinite(last) && now - last < 2 * 60_000) return;
    } catch {
      /* ignore */
    }

    log.info(`[fs] reengaged: expected fullscreen, currently OUT -> prompt`);
    this.showFullscreenResumePrompt = true;
    this.requestUpdate();
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

  /** @returns Promise settled when the browser has accepted or rejected the request. */
  private requestFullscreenApi(): Promise<void> {
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
      return result.then(
        () => log.info(`[fs] requestFullscreen resolved`),
        (err: unknown) => {
          const e = err as { name?: string; message?: string } | null;
          log.warn(
            `[fs] requestFullscreen rejected name=${e?.name} message=${e?.message}`,
          );
        },
      );
    }
    log.info(`[fs] requestFullscreen returned non-promise (legacy webkit)`);
    return Promise.resolve();
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
      `[ui] menu: ${wasIn ? "Exit FullScreen" : "Full Screen"} ` +
        `(toggle, wasIn=${wasIn})`,
    );
    log.info(`[fs] menu toggle (was ${wasIn ? "IN" : "OUT"})`);
    if (wasIn) {
      try {
        sessionStorage.removeItem(FS_SESSION_INTENT_KEY);
      } catch {
        /* ignore */
      }
      this.exitFullscreenApi();
    } else {
      try {
        sessionStorage.setItem(FS_SESSION_INTENT_KEY, "1");
      } catch {
        /* ignore */
      }
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
              type="button"
              class="menu-btn"
              title="Menu"
              @click=${this.toggleMenu}
              aria-haspopup="true"
              aria-expanded="${this.showMenu}"
            >
              ☰
            </button>
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
        ${this.showMenu ? this.renderMenu() : nothing}
        ${this.showFullscreenResumePrompt
          ? this.renderFullscreenResumePrompt()
          : nothing}
        ${this.showLogs ? this.renderLogModal() : nothing}
      </div>
    `;
  }

  private onFullscreenResumeYes() {
    log.info(`[ui] fs-resume: Enter full screen`);
    this.showFullscreenResumePrompt = false;
    this.requestFullscreenApi();
  }

  private onFullscreenResumeNo() {
    log.info(`[ui] fs-resume: Not now`);
    this.showFullscreenResumePrompt = false;
    try {
      localStorage.setItem(FS_RESUME_DISMISS_TS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }

  private renderFullscreenResumePrompt() {
    return html`
      <div
        class="fs-startup-overlay fs-resume-overlay"
        @click=${this.onFullscreenResumeNo}
      ></div>
      <div
        class="fs-startup-modal fs-resume-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fs-resume-title"
        @click=${(e: Event) => e.stopPropagation()}
      >
        <h2 id="fs-resume-title" class="fs-startup-title">
          Full screen ended
        </h2>
        <p class="fs-startup-body">
          Your device left full screen while CallerBuddy was in the background.
          Re-enter full screen?
        </p>
        <div class="fs-startup-actions">
          <button
            type="button"
            class="fs-startup-primary"
            autofocus
            @click=${this.onFullscreenResumeYes}
          >
            Re-enter full screen
          </button>
          <button
            type="button"
            class="fs-startup-secondary"
            @click=${this.onFullscreenResumeNo}
          >
            Not now
          </button>
        </div>
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
          ${this.isFullscreenApi() ? "Exit FullScreen" : "Full Screen"}
        </button>
        <button
          class="menu-item"
          role="menuitem"
          title="Increase lyrics text size by ~10%. (Alt++)"
          @click=${this.onLyricsLarger}
        >
          Lyrics larger (Alt++)
        </button>
        <button
          class="menu-item"
          role="menuitem"
          title="Decrease lyrics text size by ~10%. (Alt+−)"
          @click=${this.onLyricsSmaller}
        >
          Lyrics smaller (Alt+-)
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
        <hr />
        <div class="menu-item version" role="menuitem">
          CallerBuddy v${APP_VERSION}
        </div>
      </div>
    `;
  }

  private onLyricsLarger = async () => {
    const next = await bumpLyricsScale(1.1);
    log.info(`[ui] menu: Lyrics larger scale=${next.toFixed(3)}`);
    this.showMenu = false;
  };

  private onLyricsSmaller = async () => {
    const next = await bumpLyricsScale(0.9);
    log.info(`[ui] menu: Lyrics smaller scale=${next.toFixed(3)}`);
    this.showMenu = false;
  };

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

  static styles = css`
    :host {
      display: block;
      height: 100vh;
      height: 100dvh;
      width: 100vw;
      box-sizing: border-box;
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
      /* Stack above <main class="content"> so the hamburger menu (and overlay)
       * are not painted underneath tab body — later siblings win when z-index ties. */
      position: relative;
      z-index: 20;
      flex-shrink: 0;
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
      flex-shrink: 0;
      z-index: 1;
    }

    .menu-btn {
      background: none;
      border: none;
      color: var(--cb-fg);
      font-size: 1.2rem;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      flex-shrink: 0;
      position: relative;
      z-index: 2;
    }

    .menu-btn:hover {
      background: var(--cb-hover);
    }

    /* Rendered after <main> so stacking is never under tab body; blocks clicks below. */
    .menu-overlay {
      position: fixed;
      inset: 0;
      z-index: 5000;
      background: transparent;
    }

    .menu {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 2.75rem);
      right: max(8px, env(safe-area-inset-right, 0px));
      background: var(--cb-menu-bg);
      border: 1px solid var(--cb-border);
      border-radius: 6px;
      box-shadow: 0 4px 16px var(--cb-shadow);
      z-index: 5001;
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
      min-height: 0;
      overflow: auto;
      position: relative;
      z-index: 0;
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

    /* ── Startup fullscreen prompt (above tabs & menu) ───────────────── */
    .fs-startup-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      z-index: 2100;
    }

    .fs-startup-modal {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(92vw, 22rem);
      max-height: min(85vh, 24rem);
      overflow: auto;
      box-sizing: border-box;
      padding: 1.25rem 1.35rem;
      background: var(--cb-bg);
      color: var(--cb-fg);
      border: 1px solid var(--cb-border);
      border-radius: 10px;
      box-shadow: 0 12px 40px var(--cb-shadow);
      z-index: 2101;
    }

    .fs-startup-title {
      margin: 0 0 0.75rem;
      font-size: 1.15rem;
      font-weight: 600;
    }

    .fs-startup-body {
      margin: 0 0 1.1rem;
      font-size: 0.95rem;
      line-height: 1.5;
      color: var(--cb-fg);
    }

    .fs-startup-actions {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .fs-startup-primary {
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

    .fs-startup-secondary {
      border-radius: 8px;
      padding: 0.55em 1em;
      font-size: 0.95rem;
      font-family: inherit;
      cursor: pointer;
      background: transparent;
      color: var(--cb-fg);
      border: 1px solid var(--cb-border-strong);
    }

    .fs-resume-overlay {
      z-index: 2140;
    }

    .fs-resume-modal {
      z-index: 2141;
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
