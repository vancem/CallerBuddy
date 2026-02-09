import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { APP_VERSION } from "./version.js";

/**
 * Initialization workflow: welcome text and folder picker for CallerBuddyRoot.
 * When a folder is chosen, shows a stub popup listing entries in that directory.
 */
@customElement("welcome-view")
export class WelcomeView extends LitElement {
  @state() private folderName = "";
  @state() private entries: { name: string; kind: "file" | "directory" }[] = [];
  @state() private showPopup = false;
  @state() private pickerError = "";

  render() {
    return html`
      <div class="welcome">
        <h1>CallerBuddy</h1>
        <p class="explanation">
          CallerBuddy uses a single folder as your music and lyrics root. All
          songs (MP3 files), lyrics (HTML or MD), and app data will live in or
          under this folder. You can use a folder on your computer or inside a
          cloud drive (OneDrive, Google Drive) so your collection is available
          on other devices.
        </p>
        <p class="explanation">
          Choose the folder you want to use as your CallerBuddy root. You will
          only need to pick it once; the app will remember your choice.
        </p>
        <button class="primary" @click=${this.pickFolder} part="button">
          Choose CallerBuddyRoot folder
        </button>
        ${this.pickerError
          ? html`<p class="error" role="alert">${this.pickerError}</p>`
          : ""}
        ${this.folderName
          ? html`
              <p class="chosen">
                Chosen folder: <strong>${this.folderName}</strong>
              </p>
            `
          : ""}
        <p class="version" aria-label="App version">v${APP_VERSION}</p>
      </div>

      ${this.showPopup
        ? html`
            <div class="popup-overlay" @click=${this.closePopup} role="dialog" aria-modal="true" aria-labelledby="popup-title">
              <div class="popup" @click=${(e: Event) => e.stopPropagation()}>
                <h2 id="popup-title">Contents of chosen folder</h2>
                <p class="popup-path">${this.folderName || "—"}</p>
                <ul class="entry-list">
                  ${this.entries.length === 0
                    ? html`<li class="muted">(empty or no permission to list)</li>`
                    : this.entries.map(
                        (e) =>
                          html`<li>
                            <span class="kind">${e.kind === "directory" ? "📁" : "📄"}</span>
                            ${e.name}
                          </li>`
                      )}
                </ul>
                <button class="primary" @click=${this.closePopup}>Close</button>
              </div>
            </div>
          `
        : ""}
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
      const handle = await window.showDirectoryPicker({ mode: "read" });
      this.folderName = handle.name;
      this.entries = await this.listDirectory(handle);
      this.showPopup = true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      this.pickerError =
        err instanceof Error ? err.message : "Could not open folder.";
    }
  }

  private async listDirectory(
    handle: FileSystemDirectoryHandle
  ): Promise<{ name: string; kind: "file" | "directory" }[]> {
    const entries: { name: string; kind: "file" | "directory" }[] = [];
    for await (const entry of handle.values()) {
      entries.push({
        name: entry.name,
        kind: entry.kind === "directory" ? "directory" : "file",
      });
    }
    entries.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
    return entries;
  }

  private closePopup() {
    this.showPopup = false;
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
    }

    .primary {
      border-radius: 8px;
      border: 1px solid transparent;
      padding: 0.6em 1.2em;
      font-size: 1rem;
      font-weight: 500;
      font-family: inherit;
      background-color: #646cff;
      color: #fff;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .primary:hover {
      background-color: #535bf2;
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

    .popup-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .popup {
      background: var(--cb-popup-bg, #242424);
      border-radius: 12px;
      padding: 1.5rem;
      max-width: 90vw;
      max-height: 80vh;
      overflow: auto;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
    }

    .popup h2 {
      margin: 0 0 0.5rem;
      font-size: 1.25rem;
    }

    .popup-path {
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.7);
      margin: 0 0 1rem;
      word-break: break-all;
    }

    .entry-list {
      list-style: none;
      padding: 0;
      margin: 0 0 1rem;
      max-height: 40vh;
      overflow: auto;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      padding: 0.5rem;
    }

    .entry-list li {
      padding: 0.25rem 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .kind {
      font-size: 1rem;
    }

    .muted {
      color: rgba(255, 255, 255, 0.5);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "welcome-view": WelcomeView;
  }
}
