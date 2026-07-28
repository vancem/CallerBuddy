/**
 * Shared lyrics editor: Markdown textarea + live preview.
 *
 * Used by song-play (edit/create) and song-onboard (import review).
 *
 * Events:
 *  - `lyrics-input`  — detail: { markdown: string }
 *  - `lyrics-save`   — Save clicked or Ctrl+S
 *  - `lyrics-exit`   — Exit clicked or Esc
 *  - `lyrics-help`   — Markdown help clicked
 */

import { LitElement, css, html, nothing, unsafeCSS } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { bumpLyricsScale } from "../utils/lyrics-scale.js";
import { parseLyricsMarkdown } from "../utils/lyrics-markdown.js";
import { plainTextToMarkdownHardBreaks } from "../utils/lyrics-text-filter.js";
import {
  LYRICS_BODY_FONT_SIZE,
  LYRICS_H1_SIZE,
  LYRICS_H2_SIZE,
  LYRICS_INFO_SIZE,
  LYRICS_UI_FONT_STACK,
} from "../lyrics-default-style.js";

@customElement("lyrics-editor")
export class LyricsEditor extends LitElement {
  /** Markdown source. Set when opening the editor; further edits are local. */
  @property({ type: String }) lyricsMarkdown = "";

  /** Show Save and Exit buttons (song-play mode). */
  @property({ type: Boolean }) showSaveExit = false;

  @state() private draft = "";

  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has("lyricsMarkdown")) {
      this.draft = this.lyricsMarkdown ?? "";
    }
  }

  /** Current Markdown text in the textarea. */
  getEditorMarkdown(): string {
    const el = this.shadowRoot?.querySelector(
      "textarea.lyrics-source",
    ) as HTMLTextAreaElement | null;
    return el?.value ?? this.draft;
  }

  render() {
    const previewHtml = parseLyricsMarkdown(this.draft);
    return html`
      <div class="editor-container">
        <div class="editor-toolbar">
          <button
            type="button"
            class="toolbar-btn help-btn"
            title="Open Markdown help"
            @click=${this.onHelp}
          >
            Markdown help
          </button>
          <span class="toolbar-spacer"></span>
          ${this.showSaveExit
            ? html`
                <button
                  type="button"
                  class="toolbar-btn save-btn"
                  title="Save lyrics (Ctrl+S)"
                  @click=${this.onSave}
                >
                  Save
                </button>
                <button
                  type="button"
                  class="toolbar-btn cancel-btn"
                  title="Exit editor (Esc)"
                  @click=${this.onExit}
                >
                  Exit
                </button>
              `
            : nothing}
        </div>
        <div class="editor-panes">
          <textarea
            class="lyrics-source"
            spellcheck="true"
            .value=${this.draft}
            @input=${this.onInput}
            @keydown=${this.onKeydown}
            @paste=${this.onPaste}
          ></textarea>
          <div class="lyrics-preview lyrics-content">
            ${unsafeHTML(previewHtml)}
          </div>
        </div>
      </div>
    `;
  }

  private onInput(e: Event) {
    this.draft = (e.target as HTMLTextAreaElement).value;
    this.dispatchEvent(
      new CustomEvent("lyrics-input", {
        detail: { markdown: this.draft },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Plain-text paste: filter, bold calls, preserve newlines as Markdown hard breaks. */
  private onPaste(e: ClipboardEvent) {
    const plain = e.clipboardData?.getData("text/plain");
    if (plain == null || plain === "") return;
    // If the clipboard already looks like our Markdown, leave it alone.
    if (/^#{1,2}\s/m.test(plain) || /\\\s*$/m.test(plain)) return;

    e.preventDefault();
    const ta = e.target as HTMLTextAreaElement;
    const inserted = plainTextToMarkdownHardBreaks(plain).replace(/\n$/, "");
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const next = ta.value.slice(0, start) + inserted + ta.value.slice(end);
    ta.value = next;
    this.draft = next;
    const caret = start + inserted.length;
    ta.setSelectionRange(caret, caret);
    this.dispatchEvent(
      new CustomEvent("lyrics-input", {
        detail: { markdown: this.draft },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      this.onExit();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      this.onSave();
      return;
    }
    if (e.altKey && (e.key === "=" || e.key === "+" || e.key === "-")) {
      e.preventDefault();
      bumpLyricsScale(e.key === "-" ? -1 : 1);
    }
  }

  private onSave() {
    this.dispatchEvent(
      new CustomEvent("lyrics-save", { bubbles: true, composed: true }),
    );
  }

  private onExit() {
    this.dispatchEvent(
      new CustomEvent("lyrics-exit", { bubbles: true, composed: true }),
    );
  }

  private onHelp() {
    this.dispatchEvent(
      new CustomEvent("lyrics-help", {
        detail: { sectionId: "howto-lyrics-markdown" },
        bubbles: true,
        composed: true,
      }),
    );
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .editor-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .editor-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      padding: 6px 8px;
      border-bottom: 1px solid var(--cb-border);
      background: var(--cb-panel-bg);
      flex-shrink: 0;
    }

    .toolbar-btn {
      font: inherit;
      font-size: 0.85rem;
      padding: 4px 10px;
      border: 1px solid var(--cb-border);
      border-radius: 4px;
      background: var(--cb-input-bg);
      color: var(--cb-fg);
      cursor: pointer;
    }

    .toolbar-btn:hover {
      background: var(--cb-hover);
    }

    .help-btn {
      color: var(--cb-accent);
    }

    .save-btn {
      font-weight: 600;
    }

    .toolbar-spacer {
      flex: 1;
    }

    .editor-panes {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
      flex: 1;
      min-height: 0;
    }

    textarea.lyrics-source {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      margin: 0;
      padding: 12px;
      border: none;
      border-right: 1px solid var(--cb-border);
      resize: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.9rem;
      line-height: 1.45;
      /* Keep I-beam (caret + mouse) visible on light panels; Windows OS dark
         mode otherwise can flip it white-on-white until focus leaves the app. */
      color-scheme: light;
      background: var(--cb-input-bg);
      color: var(--cb-fg);
      caret-color: var(--cb-fg);
      cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='24' viewBox='0 0 16 24'%3E%3Cpath d='M3 1h10M8 1v22M3 23h10' stroke='%23fff' stroke-width='3.5' fill='none' stroke-linecap='square'/%3E%3Cpath d='M3 1h10M8 1v22M3 23h10' stroke='%23202124' stroke-width='1.5' fill='none' stroke-linecap='square'/%3E%3C/svg%3E")
          8 12,
        text;
    }

    textarea.lyrics-source:focus {
      outline: 2px solid var(--cb-accent);
      outline-offset: -2px;
    }

    .lyrics-preview {
      overflow: auto;
      min-height: 0;
    }

    .lyrics-content {
      width: 100%;
      box-sizing: border-box;
      padding: 16px;
      margin: 0 !important;
      background: lightyellow;
      font-family: ${unsafeCSS(LYRICS_UI_FONT_STACK)};
      font-size: var(--cb-lyrics-font-size, ${unsafeCSS(LYRICS_BODY_FONT_SIZE)});
      line-height: 140%;
      color: black;
    }

    .lyrics-content h1 {
      font-size: ${unsafeCSS(LYRICS_H1_SIZE)};
      display: block;
      margin: 0 0 0.15em;
    }

    .lyrics-content .info,
    .lyrics-content em.info {
      color: blue;
      font-size: ${unsafeCSS(LYRICS_INFO_SIZE)};
      font-weight: normal;
      font-style: italic;
    }

    .lyrics-content h2 {
      color: red;
      font-size: ${unsafeCSS(LYRICS_H2_SIZE)};
      font-weight: normal;
      margin: 0.6em 0 0;
    }

    .lyrics-content p {
      margin: 0 0 0.4em;
    }

    @container (max-width: 700px) {
      .editor-panes {
        grid-template-columns: 1fr;
        grid-template-rows: 1fr 1fr;
      }

      textarea.lyrics-source {
        border-right: none;
        border-bottom: 1px solid var(--cb-border);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "lyrics-editor": LyricsEditor;
  }
}
