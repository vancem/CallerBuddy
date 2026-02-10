/**
 * Welcome / initialization screen.
 *
 * Shown on first launch or when the user wants to change CallerBuddyRoot.
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
      <div class="welcome"> q
      
        <h1>CallerBuddy</h1>

        <p class="explanation">
          (CallerBuddy) is a tool for square dance callers to manage music
          and lyrics. It uses a single folder as your root. All songs (MP3
          files), lyrics (HTML or MD), and app data live in this folder.
          You can use a local folder or one inside a cloud drive (OneDrive,
          Google Drive) so your collection is available on other devices.
        </p>

        <p class="explanation">
          Choose the folder you want to use as your CallerBuddy root. You
          only need to pick it once; the app will remember your choice.
        </p>

        <button
          class="primary"
          @click=${this.pickFolder}
          ?disabled=${this.loading}
        >
          ${this.loading ? "Loading…" : "Choose CallerBuddyRoot folder"}
        </button>

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

  private async pickFolder() {
    this.pickerError = "";

    if (typeof window.showDirectoryPicker !== "function") {
      this.pickerError =
        "Folder picker is not supported in this browser. Use Chrome or Edge.";
      return;
    }

    try {
      this.loading = true;
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      this.folderName = handle.name;
      await callerBuddy.setRoot(handle);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled the picker
        return;
      }
      this.pickerError =
        err instanceof Error ? err.message : "Could not open folder.";
    } finally {
      this.loading = false;
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
      color: rgba(255, 255, 255, 0.85);
      line-height: 1.6;
    }

    .primary {
      border-radius: 8px;
      border: 1px solid transparent;
      padding: 0.6em 1.2em;
      font-size: 1rem;
      font-weight: 500;
      font-family: inherit;
      background-color: var(--cb-accent, #646cff);
      color: #fff;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .primary:hover:not(:disabled) {
      background-color: #535bf2;
    }

    .primary:disabled {
      opacity: 0.6;
      cursor: wait;
    }

    .error {
      color: #f66;
      margin-top: 0.75rem;
    }

    .chosen {
      margin-top: 1rem;
      font-size: 0.95rem;
    }

    .version {
      margin-top: 2rem;
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.45);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "welcome-view": WelcomeView;
  }
}
