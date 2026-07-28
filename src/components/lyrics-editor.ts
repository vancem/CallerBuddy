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
  /** Markdown pane share (0–1). Default 50/50. */
  @state() private splitFraction = 0.5;
  private dragging = false;

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
    const leftPct = (this.splitFraction * 100).toFixed(1);
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
        <div
          class="editor-panes"
          style="--lyrics-editor-split: ${leftPct}%"
        >
          <textarea
            class="lyrics-source"
            spellcheck="true"
            wrap="off"
            .value=${this.draft}
            @input=${this.onInput}
            @keydown=${this.onKeydown}
            @paste=${this.onPaste}
          ></textarea>
          <div
            class="pane-splitter"
            title="Drag to resize panes"
            @pointerdown=${this.onSplitterPointerDown}
            @pointermove=${this.onSplitterPointerMove}
            @pointerup=${this.onSplitterPointerUp}
            @pointercancel=${this.onSplitterPointerUp}
          ></div>
          <div
            class="lyrics-preview"
            tabindex="0"
            title="Preview (arrow keys scroll)"
            @keydown=${this.onPreviewKeydown}
          >
            <div class="lyrics-content">
              ${unsafeHTML(previewHtml)}
            </div>
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

  /** Arrow keys scroll the preview when it is focused. */
  private onPreviewKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      this.onExit();
      return;
    }
    const el = e.currentTarget as HTMLElement;
    const step = e.shiftKey ? 80 : 40;
    let dx = 0;
    let dy = 0;
    switch (e.key) {
      case "ArrowLeft":
        dx = -step;
        break;
      case "ArrowRight":
        dx = step;
        break;
      case "ArrowUp":
        dy = -step;
        break;
      case "ArrowDown":
        dy = step;
        break;
      case "Home":
        if (e.ctrlKey) {
          el.scrollTop = 0;
          el.scrollLeft = 0;
          e.preventDefault();
        }
        return;
      case "End":
        if (e.ctrlKey) {
          el.scrollTop = el.scrollHeight;
          el.scrollLeft = el.scrollWidth;
          e.preventDefault();
        }
        return;
      default:
        return;
    }
    if (dx === 0 && dy === 0) return;
    const maxLeft = el.scrollWidth - el.clientWidth;
    const maxTop = el.scrollHeight - el.clientHeight;
    const nextLeft = Math.max(0, Math.min(maxLeft, el.scrollLeft + dx));
    const nextTop = Math.max(0, Math.min(maxTop, el.scrollTop + dy));
    if (nextLeft === el.scrollLeft && nextTop === el.scrollTop) return;
    e.preventDefault();
    el.scrollLeft = nextLeft;
    el.scrollTop = nextTop;
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

  private isStackedLayout(): boolean {
    return this.clientWidth <= 700;
  }

  private onSplitterPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    this.dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  private onSplitterPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.applySplitterPosition(e.clientX, e.clientY);
  };

  private applySplitterPosition(clientX: number, clientY: number) {
    const panes = this.shadowRoot?.querySelector(".editor-panes") as HTMLElement | null;
    if (!panes) return;
    const rect = panes.getBoundingClientRect();
    if (this.isStackedLayout()) {
      if (rect.height <= 0) return;
      const frac = (clientY - rect.top) / rect.height;
      this.splitFraction = Math.max(0.2, Math.min(0.8, frac));
    } else {
      if (rect.width <= 0) return;
      const frac = (clientX - rect.left) / rect.width;
      this.splitFraction = Math.max(0.2, Math.min(0.8, frac));
    }
  }

  private onSplitterPointerUp = () => {
    this.dragging = false;
  };

  static styles = css`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
      container-type: inline-size;
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
      grid-template-columns: var(--lyrics-editor-split, 50%) 6px 1fr;
      grid-template-rows: 1fr;
      gap: 0;
      flex: 1;
      min-height: 0;
      min-width: 0;
    }

    .pane-splitter {
      grid-column: 2;
      grid-row: 1;
      cursor: col-resize;
      background: var(--cb-border);
      touch-action: none;
      user-select: none;
    }

    .pane-splitter:hover,
    .pane-splitter:active {
      background: var(--cb-accent, #4a9eff);
    }

    textarea.lyrics-source {
      grid-column: 1;
      grid-row: 1;
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
      /* Keep I-beam (caret + mouse) visible on light panels; Windows OS dark
         mode otherwise can flip it white-on-white until focus leaves the app. */
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

    .lyrics-preview {
      grid-column: 3;
      grid-row: 1;
      overflow: auto;
      min-height: 0;
      min-width: 0;
      outline: none;
    }

    .lyrics-preview:focus {
      outline: 2px solid var(--cb-accent);
      outline-offset: -2px;
    }

    .lyrics-preview .lyrics-content {
      width: max-content;
      min-width: 100%;
      box-sizing: border-box;
      padding: 16px;
      margin: 0 !important;
      white-space: nowrap;
      background: lightyellow;
      font-family: ${unsafeCSS(LYRICS_UI_FONT_STACK)};
      font-size: var(--cb-lyrics-font-size, ${unsafeCSS(LYRICS_BODY_FONT_SIZE)});
      line-height: 140%;
      color: black;
    }

    .lyrics-preview .lyrics-content h1 {
      font-size: ${unsafeCSS(LYRICS_H1_SIZE)};
      display: block;
      margin: 0 0 0.15em;
      white-space: nowrap;
    }

    .lyrics-preview .lyrics-content .info,
    .lyrics-preview .lyrics-content em.info {
      color: blue;
      font-size: ${unsafeCSS(LYRICS_INFO_SIZE)};
      font-weight: normal;
      font-style: italic;
    }

    .lyrics-preview .lyrics-content h2 {
      color: red;
      font-size: ${unsafeCSS(LYRICS_H2_SIZE)};
      font-weight: normal;
      margin: 0.6em 0 0;
      white-space: nowrap;
    }

    .lyrics-preview .lyrics-content p {
      margin: 0 0 0.4em;
      white-space: nowrap;
    }

    @container (max-width: 700px) {
      .editor-panes {
        grid-template-columns: 1fr;
        grid-template-rows: var(--lyrics-editor-split, 50%) 6px 1fr;
      }

      .pane-splitter {
        grid-column: 1;
        grid-row: 2;
        cursor: row-resize;
      }

      textarea.lyrics-source {
        grid-column: 1;
        grid-row: 1;
      }

      .lyrics-preview {
        grid-column: 1;
        grid-row: 3;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "lyrics-editor": LyricsEditor;
  }
}
