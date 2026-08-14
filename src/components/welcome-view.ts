/**
 * Welcome / initialization screen.
 *
 * Shown on first launch or when the stored CallerBuddyRoot handle needs a
 * fresh permission gesture. New users get an in-app "Instructions to Create
 * CallerBuddySongs" popup (screenshots + steps) that walks them through the
 * OS folder picker, since the File System Access API can't create a subfolder
 * of Documents directly (Chrome blocks Documents/Downloads/Desktop as the
 * picker's own target). Returning users open their existing folder directly.
 *
 * If a stored handle exists but permission is not yet granted, the page
 * offers "Reconnect to this folder" or "Reset CallerBuddy" (same reset as
 * the hamburger menu) instead of the full Features / New / Returning copy.
 *
 * When a folder is chosen (or reconnect succeeds), CallerBuddy activates the
 * root, opens the playlist editor, and dismisses this tab so it cannot be
 * reached again via Back — Reset CallerBuddy reloads into a fresh Welcome.
 *
 * See CallerBuddySpec.md §"Welcome Screen UI".
 */

import { LitElement, css, html } from "lit";
import type { PropertyValues } from "lit";
import { customElement, state } from "lit/decorators.js";
import { callerBuddy } from "../caller-buddy.js";
import { TabType } from "../services/app-state.js";
import {
  DIR_PICKER_ROOT_ID,
  resetCallerBuddyBrowserState,
} from "../services/file-system-service.js";
import { APP_VERSION } from "../version.js";
import { log } from "../services/logger.js";

/**
 * Resolve a `public/` asset URL under the app's base path. Used for the
 * instructions-popup screenshots so they are plain <img> fetches, made only
 * when the popup is opened (not bundled, not precached by the service worker).
 */
function assetUrl(name: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${name}`;
}

@customElement("welcome-view")
export class WelcomeView extends LitElement {
  @state() private folderName = "";
  @state() private pickerError = "";
  @state() private loading = false;
  /** "Instructions to Create CallerBuddySongs Folder" popup (New Users). */
  @state() private showInstructions = false;

  connectedCallback() {
    super.connectedCallback();
    // If there is an existing root handle, show its name
    if (callerBuddy.state.rootHandle) {
      this.folderName = callerBuddy.state.rootHandle.name;
    }
  }

  protected override firstUpdated(_changed: PropertyValues<this>): void {
    super.firstUpdated(_changed);
    this.tryFocusPrimaryAction();
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    const c = changed as unknown as Map<PropertyKey, unknown>;
    if (
      (c.has("loading") && !this.loading) ||
      c.has("showInstructions") ||
      c.has("folderName")
    ) {
      this.tryFocusPrimaryAction();
    }
  }

  /**
   * Focus whichever button is the primary action for the current state, so
   * pressing Enter activates it: the instructions popup's "Open
   * CallerBuddySongs" button when it's open, "Reconnect to this folder" when
   * a stored handle needs a gesture, otherwise the Returning Users "Open
   * CallerBuddySongs" button.
   */
  private tryFocusPrimaryAction() {
    if (this.loading) return;
    queueMicrotask(() => {
      const selector = this.showInstructions
        ? "button.instructions-open"
        : this.folderName
          ? "button.welcome-reconnect"
          : "button.welcome-open";
      const btn = this.renderRoot.querySelector(
        selector,
      ) as HTMLButtonElement | null;
      if (btn && !btn.disabled) btn.focus();
    });
  }

  /** True when init found a stored root handle that still needs a user gesture. */
  private get needsReconnect(): boolean {
    return !!this.folderName;
  }

  render() {
    return html`
      <div class="welcome">
        <header class="hero">
          <h1>CallerBuddy</h1>
          <p class="tagline">
            CallerBuddy lets square dance callers play and manage their music
            for performances.
          </p>
        </header>

        ${this.needsReconnect
          ? this.renderReconnect()
          : this.renderFirstLaunch()}

        ${this.pickerError
          ? html`<p class="error" role="alert">${this.pickerError}</p>`
          : ""}

        <p class="version" aria-label="App version">v${APP_VERSION}</p>
      </div>

      ${this.showInstructions ? this.renderInstructions() : ""}
    `;
  }

  /**
   * Stored CallerBuddyRoot exists but permission needs a click: skip the
   * marketing / New+Returning Users copy and offer reconnect or full reset.
   */
  private renderReconnect() {
    return html`
      <section class="section">
        <h2>Returning User</h2>
        <p>Detected an existing CallerBuddySongs folder</p>
        <p class="chosen">
          Current folder: <strong>${this.folderName}</strong>
        </p>
        <div class="actions">
          <button
            type="button"
            class="primary welcome-reconnect"
            @click=${this.reconnect}
            ?disabled=${this.loading}
          >
            ${this.loading ? "Loading…" : "Reconnect to this folder"}
          </button>
          <button
            type="button"
            class="secondary"
            title="Keeps song data. Clears settings and resets to first launch state"
            @click=${this.resetCallerBuddy}
            ?disabled=${this.loading}
          >
            Reset CallerBuddy
          </button>
        </div>
      </section>
    `;
  }

  private renderFirstLaunch() {
    return html`
      <p class="features-label">Features include</p>
      <ul class="features">
        <li>
          It is absolutely FREE, it even comes with a FREE demo patter and
          singing call.
        </li>
        <li>
          Setup is trivial, you are literally running CallerBuddy in the
          browser right now!
        </li>
        <li>
          Works on Windows, MacOS, Chromebooks, Android phones (sorry no
          IPhone).
        </li>
        <li>
          Works offline so you can play music without network access.
        </li>
        <li>
          Music can be in the cloud, safe and available anywhere, but
          available offline.
        </li>
        <li>
          Tracks what music you have used recently, so you don’t repeat
          yourself.
        </li>
        <li>
          Adding songs is trivial (point it at the ZIP you bought, 90% of the
          work is done).
        </li>
      </ul>

      <section class="section">
        <h2>New Users</h2>
        <p>
          If you are new to CallerBuddy, the best way to learn more is to
          just try it out. You don't even need to install anything; you
          just need an empty CallerBuddySongs folder. Just click on
          <button
            type="button"
            class="secondary inline-btn"
            @click=${this.openInstructions}
          >
            Instructions to Create CallerBuddySongs Folder
          </button>
          to get started.
        </p>
      </section>

      <section class="section">
        <h2>Returning Users</h2>
        <p>
          If you have a CallerBuddySongs folder, all you need to do is
          <button
            type="button"
            class="primary inline-btn welcome-open"
            @click=${this.pickFolder}
            ?disabled=${this.loading}
          >
            ${this.loading ? "Loading…" : "Open CallerBuddySongs"}
          </button>
        </p>
      </section>

      <section class="section">
        <h2>Learning More</h2>
        <p>
          If you just want to learn more before taking the plunge,
          <button
            type="button"
            class="text-link"
            @click=${() => this.openHelp("welcome-to-callerbuddy")}
          >
            View CallerBuddy Help
          </button>.
        </p>
      </section>
    `;
  }

  private renderInstructions() {
    return html`
      <div
        class="prompt-overlay"
        @click=${this.closeInstructions}
      ></div>
      <div
        class="prompt-modal instructions-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="instructions-title"
      >
        <button
          type="button"
          class="modal-close"
          aria-label="Close"
          @click=${this.closeInstructions}
        >
          &times;
        </button>
        <h2 id="instructions-title" class="prompt-title">
          Create a CallerBuddySongs Folder
        </h2>
        <p class="prompt-body">
          To set up CallerBuddy for the first time, you need a new
          empty folder where CallerBuddy can put songs. CallerBuddy
          wants to do this in a way where you don't have to trust
          CallerBuddy at all (only the browser), so CallerBuddy asks
          the browser to open this folder, and that brings up the
          following dialog. (The image is for windows, the other platforms 
          are analogous)
        </p>
        <img
          class="instructions-img instructions-img-folder"
          src=${assetUrl("CreateCallerBuddySongsFolder.png")}
          alt="Browser folder picker: click New folder, type the name CallerBuddySongs, then click Select Folder"
        />
        <p class="prompt-body">
          You can use the “New Folder” functionality in this dialog to create
          a new folder, type the name
          <strong>CallerBuddySongs</strong>, and then click
          <strong>Select Folder</strong> (not &lt;enter&gt;) to select this newly created
          folder.  (On Android the new folder is a folder icon with a + sign, on a Chromebook
          you have to use the vertical ellipses '⋮' and select the 'New folder' menu item).
        </p>
        <p class="prompt-body">
          Once you have done this, the browser will ask you if you
          allow this site (CallerBuddy) to be able to modify
          anything in the CallerBuddySongs folder you created. You
          should click <strong>Allow</strong> (not &lt;enter&gt;) and this 
          will give CallerBuddy access to this folder to do its work.
        </p>
        <img
          class="instructions-img instructions-img-confirm"
          src=${assetUrl("CreateCallerBuddySongsFolderConfirmation.png")}
          alt="Browser permission dialog: Allow this site to edit files in CallerBuddySongs"
        />
        <p class="prompt-body">
          Once CallerBuddy has access to the CallerBuddySongs folder it
          will ask you if you want some demo songs (say yes). At that
          point you are ready to play with CallerBuddy.
        </p>
        <p class="prompt-body prompt-cta">
          To get started type &lt;enter&gt; or click
          <button
            type="button"
            class="primary inline-btn instructions-open"
            @click=${this.pickFolder}
            ?disabled=${this.loading}
          >
            ${this.loading ? "Loading…" : "Open CallerBuddySongs"}
          </button>
        </p>
      </div>
    `;
  }

  private async reconnect() {
    log.info(`[ui] welcome: Reconnect to this folder`);
    const handle = callerBuddy.state.rootHandle;
    if (!handle) return;
    this.pickerError = "";
    try {
      this.loading = true;
      log.info(
        `[ui] reconnect: starting fullscreen=${!!document.fullscreenElement} requesting permission on existing handle…`,
      );
      await callerBuddy.setRoot(handle);
      log.info(
        `[ui] reconnect: setRoot done fullscreen=${!!document.fullscreenElement}`,
      );
    } catch (err) {
      log.error(
        `[ui] reconnect: error fullscreen=${!!document.fullscreenElement}:`,
        err,
      );
      this.pickerError =
        err instanceof Error ? err.message : "Could not reconnect.";
    } finally {
      this.loading = false;
    }
  }

  /** Same path as the hamburger-menu "Reset CallerBuddy" action. */
  private async resetCallerBuddy() {
    log.info(`[ui] welcome: Reset CallerBuddy`);
    this.pickerError = "";
    try {
      this.loading = true;
      await resetCallerBuddyBrowserState(callerBuddy.state.rootHandle);
    } catch (err) {
      log.warn("Reset CallerBuddy failed:", err);
      this.pickerError =
        "Could not reset CallerBuddy. Try clearing site data in the browser.";
      this.loading = false;
    }
  }

  private openHelp(sectionId: string) {
    log.info(`[ui] welcome: open help section=${sectionId}`);
    callerBuddy.state.openSingletonTab(TabType.Help, "Help", true, {
      sectionId,
    });
  }

  private openInstructions() {
    log.info(`[ui] welcome: Instructions to Create CallerBuddySongs Folder`);
    this.pickerError = "";
    this.showInstructions = true;
  }

  private closeInstructions() {
    this.showInstructions = false;
  }

  /**
   * Open the OS folder picker and set it as CallerBuddyRoot. Used both by
   * the Returning Users "Open CallerBuddySongs" button and by the same
   * button inside the New Users instructions popup — identical code path.
   *
   * The instructions popup (if open) is deliberately left showing while the
   * native directory-picker dialog is up, so the user can keep reading it
   * while they interact with the dialog. It's only dismissed once the
   * dialog itself has closed (i.e. after the picker promise settles).
   */
  private async pickFolder() {
    log.info(`[ui] welcome: Open CallerBuddySongs`);
    this.pickerError = "";

    if (typeof window.showDirectoryPicker !== "function") {
      log.warn(`[ui] pickFolder: showDirectoryPicker not supported`);
      this.showInstructions = false;
      this.pickerError =
        "Critical Missing Functionalty: CallerBuddy needs Chrome or Edge to run, will not work on IPhone.";
      return;
    }

    try {
      // Call the picker before any await/state update so the user-activation
      // gesture stays intact (File System Access API).
      log.info(
        `[ui] pickFolder: starting fullscreen=${!!document.fullscreenElement} opening directory picker…`,
      );
      const handle = await window.showDirectoryPicker({
        id: DIR_PICKER_ROOT_ID,
        mode: "readwrite",
      });
      // Dialog has closed (folder chosen) — safe to dismiss the instructions now.
      this.showInstructions = false;
      this.loading = true;
      this.folderName = handle.name;
      log.info(
        `[ui] pickFolder: user chose "${handle.name}" fullscreen=${!!document.fullscreenElement}, calling setRoot…`,
      );
      await callerBuddy.setRoot(handle);
      log.info(
        `[ui] pickFolder: setRoot done fullscreen=${!!document.fullscreenElement}`,
      );
    } catch (err) {
      // Dialog has closed (cancelled/denied/errored) — safe to dismiss now.
      this.showInstructions = false;
      // Chromium uses AbortError for Cancel, blocked folders (Documents/
      // Downloads/Desktop/etc.), and denied readwrite permission — same error.
      if (err instanceof Error && err.name === "AbortError") {
        log.warn(
          `[ui] pickFolder: AbortError message="${err.message}" fullscreen=${!!document.fullscreenElement}`,
        );
        this.pickerError =
          "Could not open that folder. Chrome blocks some locations " +
          "(Documents, Downloads, Desktop, and similar). Pick a normal " +
          "subfolder instead, and choose Allow if asked to edit files. " +
          "Cancel also shows this message.";
        return;
      }
      log.error(
        `[ui] pickFolder: error fullscreen=${!!document.fullscreenElement}:`,
        err,
      );
      this.pickerError =
        err instanceof Error ? err.message : "Could not open folder.";
    } finally {
      this.loading = false;
      log.info(`[ui] pickFolder: loading=false`);
    }
  }

  static styles = css`
    /*
     * Side margins restored to the pre-redesign centered-column approach
     * (gutter formula + centered max-width), but with the max-width scaled
     * up 20% so the column is noticeably wider than before.
     */
    :host {
      display: block;
      box-sizing: border-box;
      width: 100%;
      max-width: min(100%, max(43.2rem, min(86.4ch, 57.6rem)));
      margin-inline: auto;
      margin-block: 0;
      height: 100%;
      padding-top: 0.65rem;
      padding-bottom: 0.5rem;
      padding-left: max(12px, min(4vw, 24px), env(safe-area-inset-left, 0px));
      padding-right: max(12px, min(4vw, 24px), env(safe-area-inset-right, 0px));
      overflow: auto;
    }

    .welcome {
      text-align: left;
    }

    .hero h1 {
      margin: 0 0 0.25rem;
      font-size: 1.65rem;
      line-height: 1.2;
    }

    .tagline {
      margin: 0;
      color: var(--cb-fg);
      line-height: 1.4;
      font-size: 0.98rem;
    }

    .features-label {
      margin: 0.65rem 0 0.2rem;
      font-weight: 600;
      font-size: 0.95rem;
    }

    .features {
      margin: 0 0 0.55rem;
      padding-left: 1.25rem;
      color: var(--cb-fg);
      line-height: 1.35;
      font-size: 0.92rem;
    }

    .features li {
      margin: 0.15rem 0;
    }

    .section {
      margin: 0.55rem 0 0;
    }

    .section h2 {
      margin: 0 0 0.2rem;
      font-size: 1.05rem;
      font-weight: 600;
    }

    .section p {
      margin: 0;
      color: var(--cb-fg);
      line-height: 1.45;
      font-size: 0.95rem;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      margin-top: 0.45rem;
    }

    .primary {
      border-radius: 6px;
      border: 1px solid transparent;
      padding: 0.3em 0.85em;
      font-size: 0.95rem;
      font-weight: 500;
      font-family: inherit;
      background-color: var(--cb-accent);
      color: var(--cb-fg-on-accent);
      cursor: pointer;
      transition: background-color 0.2s;
      vertical-align: baseline;
    }

    .primary:hover:not(:disabled) {
      background-color: var(--cb-accent-hover);
    }

    .inline-btn {
      margin: 0 0.15em;
    }

    /*
     * Buttons embedded inline within wrapping paragraph text (as opposed to
     * the standalone .actions row buttons) must fit within the surrounding
     * text's line-height, or the wrapped line that holds the button grows
     * taller than the paragraph's other lines. line-height:1 makes the
     * button's own text box exactly its font-size, so the remaining budget
     * (line-height 1.45 minus font-size minus the 1px top/bottom border)
     * can go entirely to vertical padding while still matching the
     * paragraph's line spacing exactly.
     */
    .primary.inline-btn,
    .secondary.inline-btn {
      padding-block: 0.15em;
      /* 60% of the base .primary/.secondary horizontal padding (0.85em). */
      padding-inline: 0.51em;
      line-height: 1;
    }

    .secondary {
      border-radius: 6px;
      padding: 0.3em 0.85em;
      font-size: 0.95rem;
      font-family: inherit;
      background-color: var(--cb-btn-bg);
      color: var(--cb-fg);
      border: 1px solid var(--cb-btn-border, #000);
      cursor: pointer;
    }

    .secondary:hover:not(:disabled) {
      background: var(--cb-btn-bg-hover);
    }

    .primary:disabled,
    .secondary:disabled {
      opacity: 0.6;
      cursor: wait;
    }

    .text-link {
      display: inline;
      padding: 0;
      margin: 0;
      background: none;
      border: none;
      color: var(--cb-accent);
      font-size: inherit;
      font-family: inherit;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .text-link:hover {
      color: var(--cb-accent-hover);
    }

    .error {
      color: var(--cb-error);
      margin-top: 0.55rem;
      font-size: 0.9rem;
    }

    .chosen {
      margin: 0;
      font-size: 0.95rem;
    }

    .version {
      margin-top: 0.75rem;
      font-size: 0.75rem;
      color: var(--cb-fg-tertiary);
    }

    .prompt-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      z-index: 2100;
    }

    .prompt-modal {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(92vw, 24rem);
      box-sizing: border-box;
      padding: 1.15rem 1.25rem;
      background: var(--cb-bg);
      color: var(--cb-fg);
      border: 1px solid var(--cb-border);
      border-radius: 10px;
      box-shadow: 0 12px 40px var(--cb-shadow);
      z-index: 2101;
    }

    .prompt-title {
      margin: 0 0 0.65rem;
      font-size: 1.1rem;
      font-weight: 600;
      line-height: 1.3;
    }

    .prompt-body {
      margin: 0 0 1rem;
      font-size: 0.95rem;
      line-height: 1.45;
    }

    .prompt-cta {
      text-align: center;
    }

    /*
     * Sized to match the welcome page's text width (same formula as :host's
     * max-width above) and to use nearly the full app height, so the whole
     * walkthrough (text + both screenshots) fits without scrolling on a
     * normal window. overflow-y stays as a fallback for small windows.
     *
     * Anchored to the right edge (instead of centered) so there is open
     * space on the left where the native folder-chooser dialog can sit
     * while this stays visible and readable alongside it.
     */
    .instructions-modal {
      left: auto;
      right: max(1rem, 2vw);
      transform: translateY(-50%);
      width: min(94vw, max(43.2rem, min(86.4ch, 57.6rem)));
      height: 92vh;
      overflow-y: auto;
    }

    .instructions-modal .prompt-title {
      padding-right: 1.75rem;
    }

    .modal-close {
      position: absolute;
      top: 0.4rem;
      right: 0.5rem;
      padding: 0.2rem 0.4rem;
      background: none;
      border: none;
      font-size: 1.4rem;
      line-height: 1;
      color: var(--cb-fg-tertiary);
      cursor: pointer;
    }

    .modal-close:hover {
      color: var(--cb-fg);
    }

    .instructions-img {
      display: block;
      max-width: 100%;
      height: auto;
      margin: 0.5rem auto 0.85rem;
      border: 1px solid var(--cb-border);
      border-radius: 6px;
    }

    /* Natural size 495×292 (folder picker), scaled down ~36% overall
       (20% smaller, then another 20% smaller on top of that). */
    .instructions-img-folder {
      width: 317px;
    }

    /* Natural size 557×171 (permission dialog), scaled down ~57% overall
       (33% smaller, then 20% smaller, then another 20% smaller). */
    .instructions-img-confirm {
      width: 238px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "welcome-view": WelcomeView;
  }
}
