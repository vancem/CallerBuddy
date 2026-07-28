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
  labelAndTitleFromMusicPath,
  rescrapeHtml,
  type OnboardingProposal,
  type Mp3Candidate,
  type HtmlCandidate,
} from "../services/song-onboarding.js";
import { formatUnknownError } from "../utils/format.js";
import "./lyrics-editor.js";
import type { LyricsEditor } from "./lyrics-editor.js";

interface OnboardTabData {
  proposal: OnboardingProposal;
  sourceName: string;
  sourceType: "zip" | "folder";
}

/** Popups opened from the contents list; closed when the onboard tab goes away. */
type EntryWindowKind = "mp3" | "doc";

interface TrackedEntryWindow {
  path: string;
  win: Window;
  kind: EntryWindowKind;
}

const entryWindows: TrackedEntryWindow[] = [];
let watchingOnboardTab = false;

const DOC_POPUP = { width: 400, height: 600 };
const MP3_POPUP = { width: 350, height: 150 };
const POPUP_MARGIN = 20;
const POPUP_TOP = 40;

function pruneClosedEntryWindows(): void {
  for (let i = entryWindows.length - 1; i >= 0; i--) {
    if (entryWindows[i]!.win.closed) entryWindows.splice(i, 1);
  }
}

function trackEntryWindow(path: string, win: Window, kind: EntryWindowKind): void {
  pruneClosedEntryWindows();
  entryWindows.push({ path, win, kind });
  ensureOnboardPopupWatcher();
}

function closeAllEntryWindows(): void {
  for (const { win } of entryWindows) {
    try {
      if (!win.closed) win.close();
    } catch {
      /* ignore */
    }
  }
  entryWindows.length = 0;
}

function ensureOnboardPopupWatcher(): void {
  if (watchingOnboardTab) return;
  watchingOnboardTab = true;
  const onChange = () => {
    const onboardOpen = callerBuddy.state.tabs.some((t) => t.type === TabType.SongOnboard);
    if (onboardOpen) return;
    closeAllEntryWindows();
    callerBuddy.state.removeEventListener(StateEvents.CHANGED, onChange);
    watchingOnboardTab = false;
  };
  callerBuddy.state.addEventListener(StateEvents.CHANGED, onChange);
}

/** If this path already has an open popup, focus it and return true. */
function focusExistingEntryWindow(path: string): boolean {
  pruneClosedEntryWindows();
  const existing = entryWindows.find((e) => e.path === path && !e.win.closed);
  if (!existing) return false;
  try {
    existing.win.focus();
  } catch {
    /* ignore */
  }
  return true;
}

function openPositionedEntryWindow(path: string, kind: EntryWindowKind): Window | null {
  pruneClosedEntryWindows();
  const size = kind === "mp3" ? MP3_POPUP : DOC_POPUP;
  const left = Math.max(0, window.screenX + window.outerWidth - size.width - POPUP_MARGIN);
  let top = Math.max(0, window.screenY + POPUP_TOP);
  if (kind === "mp3") {
    const openMp3 = entryWindows.filter((e) => e.kind === "mp3" && !e.win.closed).length;
    top += openMp3 * size.height;
  }
  const features =
    `popup=yes,width=${size.width},height=${size.height},left=${left},top=${top}`;
  const win = window.open("about:blank", "_blank", features);
  if (win) trackEntryWindow(path, win, kind);
  return win;
}

@customElement("song-onboard")
export class SongOnboard extends LitElement {
  @state() private label = "";
  @state() private songTitle = "";
  @state() private selectedMp3 = "";
  @state() private selectedHtml = "";
  @state() private lyricsMarkdown = "";
  @state() private lyricsHint = "";
  @state() private destMp3Name = "";
  @state() private destLyricsName = "";
  @state() private mp3Candidates: Mp3Candidate[] = [];
  @state() private htmlCandidates: HtmlCandidate[] = [];
  @state() private allEntries: string[] = [];
  @state() private sourceName = "";
  @state() private sourceType: "zip" | "folder" = "zip";
  @state() private importing = false;
  @state() private showImportHelp = false;

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
      this.lyricsMarkdown = data.proposal.lyricsMarkdown;
      this.lyricsHint = data.proposal.lyricsHint ?? "";
      this.destMp3Name = data.proposal.destMp3Name;
      this.destLyricsName = data.proposal.destLyricsName;
      this.mp3Candidates = data.proposal.mp3Candidates;
      this.htmlCandidates = data.proposal.htmlCandidates;
      this.allEntries = data.proposal.allEntries;
      this.sourceName = data.sourceName;
      this.sourceType = data.sourceType ?? "zip";
    }
  }

  // -- Field handlers --------------------------------------------------------

  private updateDestNames() {
    const { destMp3Name, destLyricsName } = computeDestNames(
      this.label, this.songTitle, !!this.lyricsMarkdown,
    );
    this.destMp3Name = destMp3Name;
    this.destLyricsName = destLyricsName;
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
    const path = (e.target as HTMLInputElement).value;
    this.selectedMp3 = path;
    const { label, title } = labelAndTitleFromMusicPath(path);
    this.label = label;
    this.songTitle = title;
    this.updateDestNames();
  }

  private isMp3Entry(path: string): boolean {
    return path.toLowerCase().endsWith(".mp3");
  }

  private mp3SelectTitle(path: string): string {
    const c = this.mp3Candidates.find((x) => x.path === path);
    return c?.reason || "Use this MP3 for import";
  }

  private renderContentsEntry(path: string) {
    const name = this.isOpenableEntry(path)
      ? html`<a href="#" @click=${(ev: Event) => this.openSourceEntry(path, ev)}>${path}</a>`
      : path;
    return html`
      <div class="contents-entry">
        <span class="contents-select">
          ${this.isMp3Entry(path)
            ? html`<input type="radio" name="mp3"
                .value=${path}
                .checked=${path === this.selectedMp3}
                title=${this.mp3SelectTitle(path)}
                @change=${this.onMp3Select} />`
            : nothing}
        </span>
        <span class="contents-name">${name}</span>
      </div>
    `;
  }

  private async onHtmlSelect(e: Event) {
    const path = (e.target as HTMLSelectElement).value;
    this.selectedHtml = path;
    if (path) {
      try {
        this.lyricsMarkdown = await rescrapeHtml(
          path,
          (p) => callerBuddy.readOnboardingEntry(p),
          this.label,
          this.songTitle,
          (p) => callerBuddy.readOnboardingBinary(p),
        );
        this.updateDestNames();
      } catch {
        this.lyricsMarkdown = "";
      }
    } else {
      this.lyricsMarkdown = "";
      this.updateDestNames();
    }
  }

  /** Extensions we can open like File Explorer (view / play in a popup window). */
  private isOpenableEntry(path: string): boolean {
    return /\.(html?|md|txt|pdf|mp3)$/i.test(path);
  }

  private openEntryWindow(path: string): Window | null {
    const kind = path.toLowerCase().endsWith(".mp3") ? "mp3" : "doc";
    return openPositionedEntryWindow(path, kind);
  }

  private async openSourceEntry(path: string, e: Event) {
    e.preventDefault();
    if (focusExistingEntryWindow(path)) return;
    const win = this.openEntryWindow(path);
    if (!win) return;

    const lower = path.toLowerCase();
    const writeError = (err: unknown) => {
      try {
        win.document.open();
        win.document.write(`<p>Failed to load: ${formatUnknownError(err)}</p>`);
        win.document.close();
      } catch {
        /* tab may already be closed */
      }
    };

    try {
      if (lower.endsWith(".pdf")) {
        const buf = await callerBuddy.readOnboardingBinary(path);
        const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
        win.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 600_000);
        return;
      }

      if (lower.endsWith(".mp3")) {
        const buf = await callerBuddy.readOnboardingBinary(path);
        const url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
        const title = path.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        win.document.open();
        win.document.write(
          `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>` +
            `<body style="margin:12px;font-family:system-ui,sans-serif">` +
            `<p style="margin:0 0 8px;font-size:12px;word-break:break-all">${title}</p>` +
            `<audio controls autoplay src="${url}" style="width:100%"></audio>` +
            `</body></html>`,
        );
        win.document.close();
        window.setTimeout(() => URL.revokeObjectURL(url), 600_000);
        return;
      }

      let raw: string;
      if (lower.endsWith(".html") || lower.endsWith(".htm")) {
        const { decodeHtmlBytes } = await import("../utils/lyrics-text-filter.js");
        raw = decodeHtmlBytes(await callerBuddy.readOnboardingBinary(path));
      } else {
        raw = await callerBuddy.readOnboardingEntry(path);
      }
      win.document.open();
      if (lower.endsWith(".md") || lower.endsWith(".txt")) {
        win.document.write(
          `<pre style="white-space:pre-wrap;font-family:monospace;padding:16px">${raw
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</pre>`,
        );
      } else {
        win.document.write(raw);
      }
      win.document.close();
    } catch (err) {
      writeError(err);
    }
  }

  private lyricsMarkdownFromEditor(): string {
    if (!this.lyricsMarkdown) return "";
    const editor = this.shadowRoot?.querySelector("lyrics-editor") as LyricsEditor | null;
    if (!editor) return this.lyricsMarkdown;
    return editor.getEditorMarkdown();
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
      lyricsMarkdown: this.lyricsMarkdownFromEditor(),
      allEntries: this.allEntries,
      destMp3Name: this.destMp3Name,
      destLyricsName: this.destLyricsName,
      lyricsHint: this.lyricsHint,
    };

    try {
      await callerBuddy.importSong(editedProposal);
    } catch (err) {
      alert(`Import failed: ${formatUnknownError(err)}`);
    } finally {
      this.importing = false;
    }
  }

  private onCancel() {
    callerBuddy.state.closeTabByType(TabType.SongOnboard);
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
    if (!this.lyricsMarkdown) {
      return html`
        <div class="left-panel">
          <div class="no-lyrics">
            ${this.lyricsHint
              ? html`
                  <p>No lyrics found in source.</p>
                  <p class="muted">${this.lyricsHint}</p>
                  <button class="secondary-btn" type="button" @click=${this.startBlankLyrics}
                    title="Open an empty lyrics editor so you can paste from a PDF or Word file">
                    Open editor to paste
                  </button>
                `
              : html`
                  <p>Could not find any lyrics file in this source.</p>
                  <p class="muted">
                    This song will be imported as a <strong>patter</strong> song
                    (music only, no lyrics). If that is not correct, you can add
                    lyrics by hand.
                  </p>
                  <button class="secondary-btn" type="button" @click=${this.startBlankLyrics}
                    title="Open an empty lyrics editor and type or paste lyrics">
                    Add lyrics by hand
                  </button>
                `}
          </div>
        </div>
      `;
    }

    return html`
      <div class="left-panel">
        <lyrics-editor
          .lyricsMarkdown=${this.lyricsMarkdown}
          @lyrics-help=${this.onLyricsMarkdownHelp}
        ></lyrics-editor>
      </div>
    `;
  }

  private startBlankLyrics() {
    const t = this.songTitle || "Untitled";
    const info = this.label ? `_(${this.label})_\n\n` : "";
    this.lyricsMarkdown = `# ${t}\n${info}## Figure\nPaste lyrics here\\\n`;
    this.lyricsHint = "";
    this.updateDestNames();
  }

  private onLyricsMarkdownHelp() {
    callerBuddy.state.openSingletonTab(TabType.Help, "Help", true, {
      sectionId: "howto-lyrics-markdown",
    });
  }

  private renderRightPanel() {
    const sourceLabel = this.sourceType === "zip" ? "ZIP" : "Folder";

    return html`
      <div class="right-panel">
        <div class="panel-heading">
          Import Song from ${sourceLabel}
          <button class="ctx-help-btn" title="How does import work?"
            @click=${() => { this.showImportHelp = !this.showImportHelp; }}>?</button>
        </div>
        ${this.showImportHelp ? html`
          <div class="ctx-help-panel">
            CallerBuddy analyzed the ${sourceLabel.toLowerCase()} and guessed the
            record label, title, which music file to use, and cleaned up the
            lyrics. Review each section below&mdash;you can change the label,
            title, pick a different MP3, or edit the lyrics on the left.
            When you click <strong>Import</strong>, the music and lyrics files
            are copied into your CallerBuddy folder using the standard
            <code>LABEL - Title</code> naming convention.
          </div>` : nothing}
        <p class="explain">
          We analyzed <strong>${this.sourceName}</strong> and made our
          best guesses below. Edit anything that looks wrong, then click
          <strong>Import</strong>.
        </p>

        <div class="action-row">
          <button class="import-btn" @click=${this.onImport}
            ?disabled=${this.importing || !this.selectedMp3}
            title="Copy the selected music and lyrics into your CallerBuddy folder">
            ${this.importing ? "Importing…" : "Import"}
          </button>
          <button class="cancel-btn" @click=${this.onCancel}
            ?disabled=${this.importing}
            title="Discard this import and close the tab">
            Cancel
          </button>
        </div>

        <!-- Source contents (MP3 radios + clickable files) -->
        <div class="section">
          <h3>${sourceLabel} contents (${this.allEntries.length} files)</h3>
          <div class="contents-list">
            ${this.allEntries.map((e) => this.renderContentsEntry(e))}
          </div>
          ${this.allEntries.every((e) => !this.isMp3Entry(e))
            ? html`<p class="muted">No MP3 files found</p>`
            : nothing}
        </div>

        ${this.lyricsMarkdown
          ? html`<p class="explain">Source lyrics were converted to Markdown and placed
              in the editor — please review and update as desired.
              You can open original files from the list above to compare or cut and paste.</p>`
          : nothing}

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
                placeholder="e.g. BS 2469"
                title="Publisher label and catalog number (e.g. BS 2469). Used in the destination filename." />
            </label>
            <label class="field">
              <span class="field-label">Title</span>
              <input type="text" .value=${this.songTitle}
                @input=${this.onTitleInput}
                placeholder="e.g. Witch Doctor"
                title="Song title (e.g. Witch Doctor). Used in the destination filename." />
            </label>
          </div>
        </div>

        <!-- Destination files -->
        <div class="section">
          <h3>Destination Files</h3>
          <div class="dest-line">
            Music: <strong>${this.destMp3Name}</strong>
          </div>
          ${this.destLyricsName
            ? html`<div class="dest-line">
                Lyrics: <strong>${this.destLyricsName}</strong>
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

    .secondary-btn {
      margin-top: 12px;
      padding: 6px 12px;
      font: inherit;
      cursor: pointer;
      border: 1px solid var(--cb-border, #666);
      border-radius: 4px;
      background: var(--cb-input-bg, #2a2a2a);
      color: var(--cb-fg, #eee);
    }

    .secondary-btn:hover {
      border-color: var(--cb-accent, #6af);
    }

    /* -- Right panel -------------------------------------------------------- */

    .panel-heading {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0;
    }

    .ctx-help-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.125rem;
      height: 1.125rem;
      font-size: 0.7rem;
      font-weight: 700;
      border-radius: 50%;
      border: 1px solid var(--cb-border);
      background: var(--cb-input-bg);
      color: var(--cb-fg-secondary);
      cursor: pointer;
      vertical-align: middle;
      margin-left: 6px;
      padding: 0;
      line-height: 1;
    }

    .ctx-help-btn:hover {
      background: var(--cb-hover);
      color: var(--cb-fg);
    }

    .ctx-help-panel {
      font-size: 0.8rem;
      line-height: 1.5;
      color: var(--cb-fg-secondary);
      background: var(--cb-hover);
      border-radius: 6px;
      padding: 8px 10px;
    }

    .ctx-help-panel code {
      background: var(--cb-input-bg);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 0.85em;
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

    /* -- Source contents (radio prefix + filename) ------------------------- */

    .contents-list {
      max-height: 240px;
      overflow-y: auto;
      border: 1px solid var(--cb-border);
      border-radius: 4px;
      padding: 6px;
      font-family: monospace;
      font-size: 0.75rem;
      background: var(--cb-input-bg, #2a2a2a);
    }

    .contents-entry {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 1px 0;
      white-space: nowrap;
    }

    .contents-select {
      flex: 0 0 1.35rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .contents-select input[type="radio"] {
      margin: 0;
      cursor: pointer;
    }

    .contents-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Match browser default link rendering (readable on light/dark UI). */
    .contents-entry a:any-link {
      color: LinkText;
      text-decoration: underline;
      cursor: pointer;
      font-weight: normal;
    }

    .contents-entry a:visited {
      color: VisitedText;
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

declare global {
  interface HTMLElementTagNameMap {
    "song-onboard": SongOnboard;
  }
}
