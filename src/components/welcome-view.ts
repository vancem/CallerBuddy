/**
 * Welcome / initialization screen.
 *
 * Shown on first launch or when the user wants to change the CallerBuddy folder.
 * Explains the app and provides a folder picker button.
 *
 * When a folder is chosen, CallerBuddy scans it for songs and opens the
 * playlist editor tab.
 *
 * See CallerBuddySpec.md §"Welcome Screen UI".
 */

import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { callerBuddy } from "../caller-buddy.js";
import { APP_VERSION } from "../version.js";
import { log } from "../services/logger.js";

@customElement("welcome-view")
export class WelcomeView extends LitElement {
  @state() private folderName = "";
  @state() private pickerError = "";
  @state() private loading = false;

  connectedCallback() {
    super.connectedCallback();
    // If there is an existing root handle, show its name
    if (callerBuddy.state.rootHandle) {
      this.folderName = callerBuddy.state.rootHandle.name;
    }
  }

  render() {
    return html`
      <div class="welcome">
        <h1>CallerBuddy</h1>

        <p class="explanation">
          CallerBuddy is a tool for square dance callers to manage music
          and lyrics. It uses a single folder as your root. All songs (MP3
          files), lyrics (HTML or MD), and app data live in this folder.
          You can use a local folder or one inside a cloud drive (OneDrive,
          Google Drive) so your collection is available on other devices.
        </p>

        <p class="explanation">
          Choose the folder you want to use as your CallerBuddy folder. You
          only need to pick it once; the app will remember your choice.
        </p>

        ${this.folderName
          ? html`
              <button
                class="primary"
                @click=${this.reconnect}
                ?disabled=${this.loading}
              >
                ${this.loading ? "Loading…" : "Reconnect to this folder"}
              </button>
              <button
                class="secondary"
                @click=${this.pickFolder}
                ?disabled=${this.loading}
              >
                Choose a different folder
              </button>
            `
          : html`
              <button
                class="primary"
                @click=${this.pickFolder}
                ?disabled=${this.loading}
              >
                ${this.loading ? "Loading…" : "Choose CallerBuddy folder"}
              </button>
            `}

        ${this.pickerError
          ? html`<p class="error" role="alert">${this.pickerError}</p>`
          : ""}

        ${this.folderName
          ? html`
              <p class="chosen">
                Current folder: <strong>${this.folderName}</strong>
              </p>
            `
          : ""}

        <p class="version" aria-label="App version">v${APP_VERSION}</p>
      </div>
    `;
  }

  private async reconnect() {
    const handle = callerBuddy.state.rootHandle;
    if (!handle) return;
    this.pickerError = "";
    try {
      this.loading = true;
      log.info("reconnect: requesting permission on existing handle…");
      await callerBuddy.setRoot(handle);
      log.info("reconnect: setRoot completed successfully");
    } catch (err) {
      log.error("reconnect: error:", err);
      this.pickerError =
        err instanceof Error ? err.message : "Could not reconnect.";
    } finally {
      this.loading = false;
    }
  }

  private async pickFolder() {
    this.pickerError = "";

    if (typeof window.showDirectoryPicker !== "function") {
      this.pickerError =
        "Folder picker is not supported in this browser. Use Chrome or Edge.";
      return;
    }

    try {
      this.loading = true;
      log.info("pickFolder: opening directory picker…");
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      this.folderName = handle.name;
      log.info(`pickFolder: user chose "${handle.name}", calling setRoot…`);
      await callerBuddy.setRoot(handle);
      log.info("pickFolder: setRoot completed successfully");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        log.info("pickFolder: user cancelled the picker");
        return;
      }
      log.error("pickFolder: error during folder setup:", err);
      this.pickerError =
        err instanceof Error ? err.message : "Could not open folder.";
    } finally {
      this.loading = false;
      log.info("pickFolder: loading set to false");
    }
  }

  static styles = css`
    :host {
      display: block;
      max-width: 560px;
      margin: 0 auto;
      padding: 2rem;
    }

    .welcome {
      text-align: left;
    }

    h1 {
      margin-top: 0;
      font-size: 1.75rem;
    }

    .explanation {
      margin: 1rem 0;
      color: var(--cb-fg);
      line-height: 1.6;
    }

    .primary {
      border-radius: 8px;
      border: 1px solid transparent;
      padding: 0.6em 1.2em;
      font-size: 1rem;
      font-weight: 500;
      font-family: inherit;
      background-color: var(--cb-accent);
      color: var(--cb-fg-on-accent);
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .primary:hover:not(:disabled) {
      background-color: var(--cb-accent-hover);
    }

    .secondary {
      margin-top: 0.5rem;
      border-radius: 8px;
      padding: 0.6em 1.2em;
      font-size: 1rem;
      font-family: inherit;
      background-color: transparent;
      color: var(--cb-fg);
      border: 1px solid var(--cb-border, #ccc);
      cursor: pointer;
    }

    .primary:disabled,
    .secondary:disabled {
      opacity: 0.6;
      cursor: wait;
    }

    .error {
      color: var(--cb-error);
      margin-top: 0.75rem;
    }

    .chosen {
      margin-top: 1rem;
      font-size: 0.95rem;
    }

    .version {
      margin-top: 2rem;
      font-size: 0.8rem;
      color: var(--cb-fg-tertiary);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "welcome-view": WelcomeView;
  }
}
