/**
 * Shared lyrics editor: Formatted (WYSIWYG) mode + Raw Markdown mode.
 *
 * Default view matches the pre-Markdown (V.102) contenteditable lyrics surface.
 * Storage remains Markdown; Formatted ↔ Raw converts on mode switch.
 *
 * Events:
 *  - `lyrics-input`  — detail: { markdown: string }
 *  - `lyrics-save`   — Save clicked or Ctrl+S
 *  - `lyrics-exit`   — Exit clicked or Esc
 *  - `lyrics-help`   — Markdown help clicked
 */

import { LitElement, css, html, nothing, unsafeCSS } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { live } from "lit/directives/live.js";
import { bumpLyricsScale } from "../utils/lyrics-scale.js";
import { parseLyricsMarkdown } from "../utils/lyrics-markdown.js";
import { htmlToLyricsMarkdown } from "../utils/html-to-lyrics-md.js";
import { plainTextToMarkdownHardBreaks } from "../utils/lyrics-text-filter.js";
import {
  LYRICS_BODY_FONT_SIZE,
  LYRICS_H1_SIZE,
  LYRICS_H2_SIZE,
  LYRICS_INFO_SIZE,
  LYRICS_UI_FONT_STACK,
} from "../lyrics-default-style.js";

type EditorMode = "formatted" | "raw";

/**
 * Survives `<lyrics-editor>` remounts (e.g. Song Onboard is not keep-alive;
 * Help tab tears it down). Also updated when Song Play owns the mode.
 */
let sessionEditorMode: EditorMode = "formatted";

function looksLikeLyricsMarkdown(plain: string): boolean {
  return /^#{1,2}\s/m.test(plain) || /\\\s*$/m.test(plain);
}

export type LyricsEditorMode = EditorMode;

/** Last Formatted/Raw choice for this browsing session (survives remounts). */
export function getLyricsEditorSessionMode(): LyricsEditorMode {
  return sessionEditorMode;
}

@customElement("lyrics-editor")
export class LyricsEditor extends LitElement {
  /** Markdown source. Set when opening the editor; further edits are local. */
  @property({ type: String }) lyricsMarkdown = "";

  /** Show Save and Exit buttons (song-play mode). */
  @property({ type: Boolean }) showSaveExit = false;

  /**
   * Formatted vs Raw. Parent may bind this (Song Play) so mode survives
   * editor remounts; defaults to the session-remembered mode.
   */
  @property({ type: String }) editorMode: EditorMode = sessionEditorMode;

  @state() private draft = "";

  /** When true, next `updated` seeds the contenteditable from `draft`. */
  private needsWysiwygSeed = true;

  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has("lyricsMarkdown")) {
      this.draft = this.lyricsMarkdown ?? "";
      this.needsWysiwygSeed = true;
    }
    if (changed.has("editorMode")) {
      sessionEditorMode = this.editorMode;
      if (this.editorMode === "formatted") this.needsWysiwygSeed = true;
    }
  }

  override updated(changed: Map<string, unknown>) {
    // Parent may replace lyricsMarkdown (e.g. import "Lyrics Source File"
    // dropdown). Reseed both surfaces — contenteditable is not property-bound,
    // and a user-edited textarea needs `live` + an explicit value sync.
    if (this.needsWysiwygSeed || changed.has("lyricsMarkdown")) {
      if (this.editorMode === "formatted") {
        this.seedWysiwygFromDraft();
      } else {
        const ta = this.getRawTextarea();
        if (ta) ta.value = this.draft;
        this.needsWysiwygSeed = false;
      }
    }
  }

  /** Current Markdown (from the active surface). */
  getEditorMarkdown(): string {
    if (this.editorMode === "raw") {
      return this.getRawTextarea()?.value ?? this.draft;
    }
    const el = this.getWysiwygEl();
    if (el) {
      return htmlToLyricsMarkdown(el.innerHTML).markdown;
    }
    return this.draft;
  }

  /** Focus the active editing surface (formatted contenteditable or raw textarea). */
  focusEditableSurface(): void {
    if (this.editorMode === "raw") {
      this.getRawTextarea()?.focus();
      return;
    }
    this.getWysiwygEl()?.focus();
  }

  render() {
    return html`
      <div class="editor-container">
        <div class="editor-toolbar">
          ${this.editorMode === "formatted"
            ? html`
                <button
                  type="button"
                  class="toolbar-btn"
                  title="Bold (Ctrl+B)"
                  @mousedown=${this.preventFocusLoss}
                  @click=${this.execBold}
                >
                  <b>B</b>
                </button>
                <button
                  type="button"
                  class="toolbar-btn section-btn"
                  title="Section heading (Ctrl+H)"
                  @mousedown=${this.preventFocusLoss}
                  @click=${this.execSection}
                >
                  Heading
                </button>
                <button
                  type="button"
                  class="toolbar-btn info-btn"
                  title="Info — blue text (Ctrl+I)"
                  @mousedown=${this.preventFocusLoss}
                  @click=${this.execInfo}
                >
                  Info
                </button>
                <button
                  type="button"
                  class="toolbar-btn"
                  title="Paragraph (Ctrl+P)"
                  @mousedown=${this.preventFocusLoss}
                  @click=${this.execParagraph}
                >
                  P
                </button>
                <span class="toolbar-divider" aria-hidden="true"></span>
              `
            : nothing}
          <button
            type="button"
            class="toolbar-btn mode-btn"
            title=${this.editorMode === "formatted"
              ? "Switch to raw Markdown editing"
              : "Switch to formatted (visual) editing"}
            @click=${() =>
              this.setMode(this.editorMode === "formatted" ? "raw" : "formatted")}
          >
            ${this.editorMode === "formatted" ? "Edit Markdown" : "Edit Formatted"}
          </button>
          ${this.editorMode === "raw"
            ? html`
                <button
                  type="button"
                  class="toolbar-btn help-btn"
                  title="Open Markdown help"
                  @click=${this.onHelp}
                >
                  Markdown help
                </button>
              `
            : nothing}
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
        ${this.editorMode === "formatted"
          ? html`
              <div
                class="lyrics-editor lyrics-content"
                contenteditable="true"
                spellcheck="true"
                @input=${this.onWysiwygInput}
                @keydown=${this.onWysiwygKeydown}
                @paste=${this.onWysiwygPaste}
              ></div>
            `
          : html`
              <textarea
                class="lyrics-source"
                spellcheck="true"
                wrap="off"
                .value=${live(this.draft)}
                @input=${this.onRawInput}
                @keydown=${this.onRawKeydown}
                @paste=${this.onRawPaste}
              ></textarea>
            `}
      </div>
    `;
  }

  private getWysiwygEl(): HTMLElement | null {
    return (
      (this.shadowRoot?.querySelector(
        ".lyrics-editor",
      ) as HTMLElement | null) ?? null
    );
  }

  private getRawTextarea(): HTMLTextAreaElement | null {
    return (
      (this.shadowRoot?.querySelector(
        "textarea.lyrics-source",
      ) as HTMLTextAreaElement | null) ?? null
    );
  }

  private seedWysiwygFromDraft() {
    const el = this.getWysiwygEl();
    if (!el) return;
    el.innerHTML = parseLyricsMarkdown(this.draft);
    this.needsWysiwygSeed = false;
  }

  private syncDraftFromActiveSurface() {
    this.draft = this.getEditorMarkdown();
  }

  private setMode(next: EditorMode) {
    if (next === this.editorMode) return;
    this.syncDraftFromActiveSurface();
    sessionEditorMode = next;
    this.editorMode = next;
    this.dispatchEvent(
      new CustomEvent("lyrics-mode-change", {
        detail: { mode: next },
        bubbles: true,
        composed: true,
      }),
    );
    if (next === "formatted") {
      this.needsWysiwygSeed = true;
    }
    void this.updateComplete.then(() => this.focusEditableSurface());
  }

  private emitInput() {
    this.dispatchEvent(
      new CustomEvent("lyrics-input", {
        detail: { markdown: this.draft },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onWysiwygInput() {
    this.syncDraftFromActiveSurface();
    this.emitInput();
  }

  private onRawInput(e: Event) {
    this.draft = (e.target as HTMLTextAreaElement).value;
    this.emitInput();
  }

  private preventFocusLoss(e: Event) {
    e.preventDefault();
  }

  private getEditorSelection(): Selection | null {
    const root = this.shadowRoot as ShadowRoot & {
      getSelection?: () => Selection | null;
    };
    return root.getSelection?.() ?? window.getSelection();
  }

  private execBold() {
    document.execCommand("bold");
    this.onWysiwygInput();
  }

  private execSection() {
    document.execCommand("formatBlock", false, "h2");
    this.onWysiwygInput();
  }

  private execParagraph() {
    document.execCommand("formatBlock", false, "p");
    this.onWysiwygInput();
  }

  private execInfo() {
    const sel = this.getEditorSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const span = document.createElement("span");
    span.className = "info";
    span.appendChild(range.extractContents());
    range.insertNode(span);
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.addRange(newRange);
    this.onWysiwygInput();
  }

  /** Plain-text paste into WYSIWYG: filter → Markdown → HTML fragment. */
  private onWysiwygPaste(e: ClipboardEvent) {
    const plain = e.clipboardData?.getData("text/plain");
    if (plain == null || plain === "") return;
    e.preventDefault();

    let md = plain;
    if (!looksLikeLyricsMarkdown(plain)) {
      md = plainTextToMarkdownHardBreaks(plain).replace(/\n$/, "");
    }
    const fragment = parseLyricsMarkdown(md);
    document.execCommand("insertHTML", false, fragment);
    this.onWysiwygInput();
  }

  /** Plain-text paste into raw Markdown textarea. */
  private onRawPaste(e: ClipboardEvent) {
    const plain = e.clipboardData?.getData("text/plain");
    if (plain == null || plain === "") return;
    if (looksLikeLyricsMarkdown(plain)) return;

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
    this.emitInput();
  }

  private onWysiwygKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      if (e.key === "=" || e.key === "+" || e.key === "-") {
        e.preventDefault();
        bumpLyricsScale(e.key === "-" ? -1 : 1);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.execCommand("insertLineBreak");
      this.onWysiwygInput();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      this.onExit();
      return;
    }
    if (!e.ctrlKey && !e.metaKey) return;
    switch (e.key.toLowerCase()) {
      case "b":
        e.preventDefault();
        this.execBold();
        break;
      case "h":
        e.preventDefault();
        this.execSection();
        break;
      case "i":
        e.preventDefault();
        this.execInfo();
        break;
      case "p":
        e.preventDefault();
        this.execParagraph();
        break;
      case "s":
        e.preventDefault();
        this.onSave();
        break;
    }
  }

  private onRawKeydown(e: KeyboardEvent) {
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
    this.syncDraftFromActiveSurface();
    this.dispatchEvent(
      new CustomEvent("lyrics-save", { bubbles: true, composed: true }),
    );
  }

  private onExit() {
    this.syncDraftFromActiveSurface();
    this.dispatchEvent(
      new CustomEvent("lyrics-exit", { bubbles: true, composed: true }),
    );
  }

  private onHelp() {
    this.dispatchEvent(
      new CustomEvent("lyrics-help", {
        detail: { sectionId: "lyrics-markdown" },
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
      border: 1px solid var(--cb-btn-border);
      border-radius: 4px;
      background: var(--cb-btn-bg);
      color: var(--cb-fg);
      cursor: pointer;
      min-width: 2rem;
      text-align: center;
    }

    .toolbar-btn:hover {
      background: var(--cb-btn-bg-hover);
    }

    .toolbar-btn.section-btn {
      color: red;
      font-weight: 500;
    }

    .toolbar-btn.info-btn {
      color: blue;
      font-weight: 500;
    }

    .toolbar-divider {
      width: 1px;
      align-self: stretch;
      margin: 2px 4px;
      background: var(--cb-border);
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

    .lyrics-editor {
      flex: 1;
      overflow: auto;
      outline: none;
      padding: 16px;
      box-sizing: border-box;
      min-height: 0;
      min-width: 0;
      /* Keep I-beam (caret + mouse) visible on light panels; Windows OS dark
         mode otherwise can flip it white-on-white until focus leaves the app. */
      color-scheme: light;
      caret-color: #202124;
      cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='24' viewBox='0 0 16 24'%3E%3Cpath d='M3 1h10M8 1v22M3 23h10' stroke='%23fff' stroke-width='3.5' fill='none' stroke-linecap='square'/%3E%3Cpath d='M3 1h10M8 1v22M3 23h10' stroke='%23202124' stroke-width='1.5' fill='none' stroke-linecap='square'/%3E%3C/svg%3E")
          8 12,
        text;
    }

    .lyrics-editor:focus {
      outline: 2px solid var(--cb-accent);
      outline-offset: -2px;
    }

    .lyrics-content {
      width: max-content;
      min-width: 100%;
      background: lightyellow;
      font-family: ${unsafeCSS(LYRICS_UI_FONT_STACK)};
      font-size: var(--cb-lyrics-font-size, ${unsafeCSS(LYRICS_BODY_FONT_SIZE)});
      line-height: 140%;
      color: black;
      margin: 0 !important;
      white-space: nowrap;
    }

    .lyrics-content h1 {
      font-size: ${unsafeCSS(LYRICS_H1_SIZE)};
      display: block;
      margin: 0 0 0.15em;
      white-space: nowrap;
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
      white-space: nowrap;
    }

    .lyrics-content p {
      margin: 0 0 0.4em;
      white-space: nowrap;
    }

    textarea.lyrics-source {
      flex: 1;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      margin: 0;
      padding: 12px;
      border: none;
      resize: none;
      overflow: auto;
      white-space: pre;
      overflow-wrap: normal;
      word-break: normal;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: var(--cb-lyrics-font-size, ${unsafeCSS(LYRICS_BODY_FONT_SIZE)});
      line-height: 1.45;
      color-scheme: light;
      background: var(--cb-input-bg);
      color: var(--cb-fg);
      caret-color: var(--cb-fg);
      cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='24' viewBox='0 0 16 24'%3E%3Cpath d='M3 1h10M8 1v22M3 23h10' stroke='%23fff' stroke-width='3.5' fill='none' stroke-linecap='square'/%3E%3Cpath d='M3 1h10M8 1v22M3 23h10' stroke='%23202124' stroke-width='1.5' fill='none' stroke-linecap='square'/%3E%3C/svg%3E")
          8 12,
        text;
      min-width: 0;
      min-height: 0;
    }

    textarea.lyrics-source:focus {
      outline: 2px solid var(--cb-accent);
      outline-offset: -2px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "lyrics-editor": LyricsEditor;
  }
}
