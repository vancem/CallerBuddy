/**
 * Song Onboarding review/approval UI.
 *
 * Opened as a singleton tab from the hamburger menu "Import Song…" actions.
 * Displays the onboarding proposal and lets the user review/edit before
 * finalizing the import.
 *
 * Layout mirrors song-play: lyrics editor fills the left panel (with shared
 * lyrics-editor component), controls live in a scrollable right panel.
 * A draggable splitter allows resizing. Default split is 2/3 left, 1/3 right.
 */

import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { callerBuddy } from "../caller-buddy.js";
import { StateEvents, TabType } from "../services/app-state.js";
import {
  computeDestNames,
  rescrapeHtml,
  type OnboardingProposal,
  type Mp3Candidate,
  type HtmlCandidate,
} from "../services/song-onboarding.js";
import "./lyrics-editor.js";

interface OnboardTabData {
  proposal: OnboardingProposal;
  sourceName: string;
  sourceType: "zip" | "folder";
}

@customElement("song-onboard")
export class SongOnboard extends LitElement {
  @state() private label = "";
  @state() private songTitle = "";
  @state() private selectedMp3 = "";
  @state() private selectedHtml = "";
  @state() private normalizedHtml = "";
  @state() private destMp3Name = "";
  @state() private destHtmlName = "";
  @state() private mp3Candidates: Mp3Candidate[] = [];
  @state() private htmlCandidates: HtmlCandidate[] = [];
  @state() private allEntries: string[] = [];
  @state() private sourceName = "";
  @state() private sourceType: "zip" | "folder" = "zip";
  @state() private showContents = false;
  @state() private importing = false;

  /** Left panel width fraction (0–1). Default: 2/3. */
  @state() private splitFraction = 2 / 3;
  private dragging = false;

  private proposal: OnboardingProposal | null = null;

  connectedCallback() {
    super.connectedCallback();
    callerBuddy.state.addEventListener(StateEvents.CHANGED, this.onStateChanged);
    this.loadFromTabData();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    callerBuddy.state.removeEventListener(StateEvents.CHANGED, this.onStateChanged);
    document.removeEventListener("mousemove", this.onSplitterMove);
    document.removeEventListener("mouseup", this.onSplitterUp);
  }

  private onStateChanged = () => {
    this.loadFromTabData();
  };

  private loadFromTabData() {
    const tab = callerBuddy.state.tabs.find((t) => t.type === TabType.SongOnboard);
    if (!tab?.data) return;
    const data = tab.data as OnboardTabData;
    if (!data.proposal) return;

    if (!this.proposal) {
      this.proposal = data.proposal;
      this.label = data.proposal.label;
      this.songTitle = data.proposal.title;
      this.selectedMp3 = data.proposal.selectedMp3;
      this.selectedHtml = data.proposal.selectedHtml;
      this.normalizedHtml = data.proposal.normalizedHtml;
      this.destMp3Name = data.proposal.destMp3Name;
      this.destHtmlName = data.proposal.destHtmlName;
      this.mp3Candidates = data.proposal.mp3Candidates;
      this.htmlCandidates = data.proposal.htmlCandidates;
      this.allEntries = data.proposal.allEntries;
      this.sourceName = data.sourceName;
      this.sourceType = data.sourceType ?? "zip";
    }
  }

  // -- Field handlers --------------------------------------------------------

  private updateDestNames() {
    const { destMp3Name, destHtmlName } = computeDestNames(
      this.label, this.songTitle, !!this.normalizedHtml,
    );
    this.destMp3Name = destMp3Name;
    this.destHtmlName = destHtmlName;
  }

  private onLabelInput(e: Event) {
    this.label = (e.target as HTMLInputElement).value;
    this.updateDestNames();
  }

  private onTitleInput(e: Event) {
    this.songTitle = (e.target as HTMLInputElement).value;
    this.updateDestNames();
  }

  private onMp3Select(e: Event) {
    this.selectedMp3 = (e.target as HTMLInputElement).value;
  }

  private async onHtmlSelect(e: Event) {
    const path = (e.target as HTMLSelectElement).value;
    this.selectedHtml = path;
    if (path) {
      try {
        this.normalizedHtml = await rescrapeHtml(
          path, (p) => callerBuddy.readOnboardingEntry(p),
          this.label, this.songTitle,
        );
        this.updateDestNames();
      } catch {
        this.normalizedHtml = "";
      }
    } else {
      this.normalizedHtml = "";
      this.updateDestNames();
    }
  }

  private toggleContents() {
    this.showContents = !this.showContents;
  }

  private async openHtmlPreview(path: string, e: Event) {
    e.preventDefault();
    const win = window.open("", "_blank");
    if (!win) return;
    try {
      const rawHtml = await callerBuddy.readOnboardingEntry(path);
      win.document.open();
      win.document.write(rawHtml);
      win.document.close();
    } catch (err) {
      win.document.open();
      win.document.write(`<p>Failed to load: ${err}</p>`);
      win.document.close();
    }
  }

  private onEditorInput(e: CustomEvent<{ html: string }>) {
    const bodyContent = e.detail.html;
    const styleMatch = this.normalizedHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const styleText = styleMatch?.[1] ?? "";
    this.normalizedHtml = [
      "<!DOCTYPE html>", "<html>", "<head>",
      '<meta charset="utf-8">',
      `<title>${escapeHtml(this.songTitle)}</title>`,
      "<style>", styleText, "</style>",
      "</head>", "<body>", bodyContent, "</body>", "</html>",
    ].join("\n");
  }

  // -- Splitter drag ---------------------------------------------------------

  private onSplitterDown = (e: MouseEvent) => {
    e.preventDefault();
    this.dragging = true;
    document.addEventListener("mousemove", this.onSplitterMove);
    document.addEventListener("mouseup", this.onSplitterUp);
  };

  private onSplitterMove = (e: MouseEvent) => {
    if (!this.dragging) return;
    const grid = this.shadowRoot?.querySelector(".onboard-grid") as HTMLElement | null;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    this.splitFraction = Math.max(0.2, Math.min(0.8, frac));
  };

  private onSplitterUp = () => {
    this.dragging = false;
    document.removeEventListener("mousemove", this.onSplitterMove);
    document.removeEventListener("mouseup", this.onSplitterUp);
  };

  // -- Import / cancel -------------------------------------------------------

  private async onImport() {
    if (this.importing) return;
    this.importing = true;

    const editedProposal: OnboardingProposal = {
      label: this.label,
      title: this.songTitle,
      mp3Candidates: this.mp3Candidates,
      selectedMp3: this.selectedMp3,
      htmlCandidates: this.htmlCandidates,
      selectedHtml: this.selectedHtml,
      normalizedHtml: this.normalizedHtml,
      allEntries: this.allEntries,
      destMp3Name: this.destMp3Name,
      destHtmlName: this.destHtmlName,
    };

    try {
      await callerBuddy.importSong(editedProposal);
    } catch (err) {
      alert(`Import failed: ${err}`);
    } finally {
      this.importing = false;
    }
  }

  private onCancel() {
    const tab = callerBuddy.state.tabs.find((t) => t.type === TabType.SongOnboard);
    if (tab) callerBuddy.state.closeTab(tab.id);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  render() {
    if (!this.proposal) {
      return html`<div class="loading">Analyzing source…</div>`;
    }

    const leftPct = (this.splitFraction * 100).toFixed(1);
    const gridCols = `${leftPct}% 6px 1fr`;

    return html`
      <div class="onboard-grid" style="grid-template-columns: ${gridCols}">
        ${this.renderLeftPanel()}
        <div class="splitter" @mousedown=${this.onSplitterDown}></div>
        ${this.renderRightPanel()}
      </div>
    `;
  }

  private renderLeftPanel() {
    if (!this.normalizedHtml) {
      return html`
        <div class="left-panel">
          <div class="no-lyrics">
            <p>No lyrics found in source.</p>
            <p class="muted">The song will be imported without a lyrics file.</p>
          </div>
        </div>
      `;
    }

    const bodyMatch = this.normalizedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const body = bodyMatch?.[1] ?? this.normalizedHtml;
    const styleMatch = this.normalizedHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const cssText = styleMatch?.[1] ?? "";
    const rewrittenCss = cssText.replace(/\bbody\b/g, ".lyrics-content");

    return html`
      <div class="left-panel">
        <lyrics-editor
          .bodyHtml=${body}
          .editorCss=${rewrittenCss}
          .showSaveExit=${false}
          @lyrics-input=${this.onEditorInput}
        ></lyrics-editor>
      </div>
    `;
  }

  private renderRightPanel() {
    const sourceLabel = this.sourceType === "zip" ? "ZIP" : "Folder";

    return html`
      <div class="right-panel">
        <div class="panel-heading">
          Import Song from ${sourceLabel}
        </div>
        <p class="explain">
          We analyzed <strong>${this.sourceName}</strong> and made our
          best guesses below. Edit anything that looks wrong, then click
          <strong>Import</strong>.
        </p>

        <div class="action-row">
          <button class="import-btn" @click=${this.onImport}
            ?disabled=${this.importing || !this.selectedMp3}>
            ${this.importing ? "Importing…" : "Import"}
          </button>
          <button class="cancel-btn" @click=${this.onCancel}
            ?disabled=${this.importing}>
            Cancel
          </button>
        </div>

        <!-- Source music file -->
        <div class="section">
          <h3>Source Music File</h3>
          <div class="mp3-list">
            ${this.mp3Candidates.map(
              (c) => html`
                <label class="mp3-item" title=${c.reason}>
                  <input type="radio" name="mp3"
                    .value=${c.path}
                    .checked=${c.path === this.selectedMp3}
                    @change=${this.onMp3Select} />
                  <span class="mp3-name">${c.filename}</span>
                </label>
              `,
            )}
            ${this.mp3Candidates.length === 0
              ? html`<p class="muted">No sound files found</p>`
              : nothing}
          </div>
        </div>

        ${this.normalizedHtml
          ? html`<p class="explain">Source lyrics were extracted and placed
              in the editor — please review and update as desired.</p>`
          : nothing}

        <!-- Show source contents -->
        <div class="section">
          <button class="toggle-btn" @click=${this.toggleContents}>
            ${this.showContents ? "Hide" : "Show"} complete
            ${sourceLabel} contents (${this.allEntries.length} files)
          </button>
          ${this.showContents
            ? html`
              <div class="contents-list">
                ${this.allEntries.map((e) =>
                  /\.html?$/i.test(e)
                    ? html`<div class="contents-entry"><a href="#" @click=${(ev: Event) => this.openHtmlPreview(e, ev)}>${e}</a></div>`
                    : html`<div class="contents-entry">${e}</div>`,
                )}
              </div>`
            : nothing}
        </div>

        <!-- HTML source selector (only if multiple) -->
        ${this.htmlCandidates.length > 1
          ? html`
            <div class="section">
              <h3>Lyrics Source File</h3>
              <select @change=${this.onHtmlSelect}>
                ${this.htmlCandidates.map(
                  (c) => html`
                    <option value=${c.path}
                      ?selected=${c.path === this.selectedHtml}>
                      ${c.filename}
                    </option>
                  `,
                )}
                <option value="">None (no lyrics)</option>
              </select>
            </div>`
          : nothing}

        <!-- Label and title -->
        <div class="section">
          <h3>Deduced Label &amp; Title: update if necessary</h3>
          <div class="field-row">
            <label class="field">
              <span class="field-label">Label</span>
              <input type="text" .value=${this.label}
                @input=${this.onLabelInput}
                placeholder="e.g. BS 2469" />
            </label>
            <label class="field">
              <span class="field-label">Title</span>
              <input type="text" .value=${this.songTitle}
                @input=${this.onTitleInput}
                placeholder="e.g. Witch Doctor" />
            </label>
          </div>
        </div>

        <!-- Destination files -->
        <div class="section">
          <h3>Destination Files</h3>
          <div class="dest-line">
            Music: <strong>${this.destMp3Name}</strong>
          </div>
          ${this.destHtmlName
            ? html`<div class="dest-line">
                Lyrics: <strong>${this.destHtmlName}</strong>
              </div>`
            : html`<div class="dest-line muted">No lyrics file will be created</div>`}
        </div>

        <p class="hint">
          If you are happy with these choices, click
          <strong>Import</strong> above to proceed.
        </p>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--cb-fg-tertiary);
    }

    /* -- Three-column grid: left | splitter | right ------------------------- */

    .onboard-grid {
      display: grid;
      grid-template-rows: 1fr;
      height: 100%;
    }

    .left-panel {
      grid-column: 1;
      grid-row: 1;
      overflow: hidden;
      min-width: 0;
    }

    .left-panel lyrics-editor {
      height: 100%;
    }

    .splitter {
      grid-column: 2;
      grid-row: 1;
      cursor: col-resize;
      background: var(--cb-border);
      transition: background 0.15s;
    }

    .splitter:hover {
      background: var(--cb-accent, #4a9eff);
    }

    .right-panel {
      grid-column: 3;
      grid-row: 1;
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }

    /* -- No-lyrics placeholder --------------------------------------------- */

    .no-lyrics {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 4px;
      color: var(--cb-fg-secondary, #aaa);
      font-size: 0.95rem;
    }

    .no-lyrics p { margin: 0; }

    /* -- Right panel -------------------------------------------------------- */

    .panel-heading {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0;
    }

    .explain {
      font-size: 0.85rem;
      color: var(--cb-fg-secondary, #aaa);
      margin: 0;
      line-height: 1.4;
    }

    .explain strong { color: var(--cb-fg); }

    .hint {
      font-size: 0.82rem;
      color: var(--cb-fg-tertiary);
      margin: 4px 0 0;
      line-height: 1.4;
    }

    .hint strong { color: var(--cb-fg-secondary, #aaa); }

    .section {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    h3 {
      margin: 0;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--cb-fg-secondary, #aaa);
    }

    /* -- Actions ----------------------------------------------------------- */

    .action-row {
      display: flex;
      gap: 10px;
    }

    .import-btn {
      background: var(--cb-accent, #4a9eff);
      color: var(--cb-fg-on-accent, #fff);
      border: none;
      padding: 8px 24px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 600;
    }

    .import-btn:hover:not(:disabled) { filter: brightness(1.1); }
    .import-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .cancel-btn {
      background: none;
      border: 1px solid var(--cb-border);
      color: var(--cb-fg);
      padding: 8px 18px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9rem;
    }

    .cancel-btn:hover:not(:disabled) { background: var(--cb-hover); }
    .cancel-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* -- MP3 list ---------------------------------------------------------- */

    .mp3-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid var(--cb-border);
      border-radius: 4px;
      padding: 4px;
    }

    .mp3-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 6px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 0.82rem;
    }

    .mp3-item:hover { background: var(--cb-hover); }

    .mp3-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* -- Source contents toggle --------------------------------------------- */

    .toggle-btn {
      background: none;
      border: 1px solid var(--cb-border);
      color: var(--cb-fg-secondary, #aaa);
      padding: 5px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.82rem;
      text-align: left;
    }

    .toggle-btn:hover { background: var(--cb-hover); }

    .contents-list {
      max-height: 160px;
      overflow-y: auto;
      border: 1px solid var(--cb-border);
      border-radius: 4px;
      padding: 6px;
      font-family: monospace;
      font-size: 0.75rem;
      background: var(--cb-input-bg, #2a2a2a);
    }

    .contents-entry {
      padding: 1px 0;
      white-space: nowrap;
    }

    .contents-entry a {
      color: var(--cb-accent, #4a9eff);
      text-decoration: none;
      cursor: pointer;
    }

    .contents-entry a:hover {
      text-decoration: underline;
    }

    /* -- Fields ------------------------------------------------------------ */

    select {
      padding: 5px 8px;
      border: 1px solid var(--cb-border);
      border-radius: 4px;
      background: var(--cb-input-bg, #2a2a2a);
      color: var(--cb-fg);
      font-size: 0.82rem;
      width: 100%;
    }

    .field-row {
      display: flex;
      gap: 10px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 3px;
      flex: 1;
    }

    .field-label {
      font-size: 0.78rem;
      color: var(--cb-fg-tertiary);
    }

    .field input {
      padding: 5px 8px;
      border: 1px solid var(--cb-border);
      border-radius: 4px;
      background: var(--cb-input-bg, #2a2a2a);
      color: var(--cb-fg);
      font-size: 0.9rem;
    }

    /* -- Destination files -------------------------------------------------- */

    .dest-line {
      font-size: 0.85rem;
      padding: 2px 0;
    }

    .dest-line strong { color: var(--cb-fg); }

    .muted {
      color: var(--cb-fg-tertiary);
      font-style: italic;
    }

    /* -- Narrow / phone layout --------------------------------------------- */

    @media (max-width: 700px) {
      .onboard-grid {
        grid-template-columns: 1fr !important;
        grid-template-rows: auto 1fr;
      }

      .splitter { display: none; }

      .right-panel {
        grid-column: 1;
        grid-row: 1;
        padding: 12px;
        overflow-y: visible;
      }

      .left-panel {
        grid-column: 1;
        grid-row: 2;
        min-height: 300px;
      }

      .field-row { flex-direction: column; }
    }
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

declare global {
  interface HTMLElementTagNameMap {
    "song-onboard": SongOnboard;
  }
}
