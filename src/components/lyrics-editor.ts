/**
 * Shared lyrics editor component with formatting toolbar.
 *
 * Used by both song-play (editing existing lyrics) and song-onboard
 * (reviewing/editing scraped lyrics during import).
 *
 * The component provides:
 *  - A formatting toolbar (Bold, Heading, Info, Paragraph)
 *  - A contenteditable div styled to match CallerBuddy lyrics format
 *  - Keyboard shortcuts (Ctrl+B/H/I/P)
 *  - Optional Save/Exit buttons (shown when showSaveExit is true)
 *
 * Events:
 *  - `lyrics-input`  — fires on every edit (detail: { html: string })
 *  - `lyrics-save`   — fires when Save is clicked or Ctrl+S pressed
 *  - `lyrics-exit`   — fires when Exit is clicked or Esc pressed
 */

import { LitElement, css, html, nothing, unsafeCSS } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import {
  LYRICS_BODY_FONT_SIZE,
  LYRICS_H1_SIZE,
  LYRICS_H2_SIZE,
  LYRICS_INFO_SIZE,
  LYRICS_UI_FONT_STACK,
} from "../lyrics-default-style.js";

@customElement("lyrics-editor")
export class LyricsEditor extends LitElement {
  /** HTML body content to display in the editor. Set once on init; further
   *  edits are tracked internally by the contenteditable div. */
  @property({ type: String }) bodyHtml = "";

  /** Optional CSS to inject (rewritten from the lyrics file's <style>). */
  @property({ type: String }) editorCss = "";

  /** Show Save and Exit buttons in the toolbar (for song-play mode). */
  @property({ type: Boolean }) showSaveExit = false;

  /** Get the current editor HTML content. */
  getEditorHtml(): string {
    const el = this.shadowRoot?.querySelector(".lyrics-editor") as HTMLElement | null;
    return el?.innerHTML ?? "";
  }

  render() {
    return html`
      ${this.editorCss ? html`<style>${this.editorCss}</style>` : nothing}
      <div class="editor-container">
        <div class="editor-toolbar">
          <button class="toolbar-btn" title="Bold (Ctrl+B)"
            @mousedown=${this.preventFocusLoss}
            @click=${this.execBold}><b>B</b></button>
          <button class="toolbar-btn section-btn" title="Section heading (Ctrl+H)"
            @mousedown=${this.preventFocusLoss}
            @click=${this.execSection}>Heading</button>
          <button class="toolbar-btn info-btn" title="Info block \u2014 blue text (Ctrl+I)"
            @mousedown=${this.preventFocusLoss}
            @click=${this.execInfo}>Info</button>
          <button class="toolbar-btn" title="Paragraph (Ctrl+P)"
            @mousedown=${this.preventFocusLoss}
            @click=${this.execParagraph}>P</button>
          <span class="toolbar-spacer"></span>
          ${this.showSaveExit
            ? html`
              <button class="toolbar-btn save-btn" title="Save lyrics (Ctrl+S)"
                @click=${this.onSave}>Save</button>
              <button class="toolbar-btn cancel-btn" title="Exit editor (Esc)"
                @click=${this.onExit}>Exit</button>`
            : nothing}
        </div>
        <div class="lyrics-editor lyrics-content" contenteditable="true"
          @input=${this.onInput}
          @keydown=${this.onKeydown}
          @paste=${this.onPaste}>${unsafeHTML(this.bodyHtml)}</div>
      </div>
    `;
  }

  private preventFocusLoss(e: Event) {
    e.preventDefault();
  }

  private onPaste(e: ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    document.execCommand("insertText", false, text);
  }

  private onInput() {
    this.dispatchEvent(
      new CustomEvent("lyrics-input", {
        detail: { html: this.getEditorHtml() },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.execCommand("insertLineBreak");
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

  private execBold() {
    document.execCommand("bold");
  }

  private execSection() {
    document.execCommand("formatBlock", false, "h2");
  }

  private execParagraph() {
    document.execCommand("formatBlock", false, "p");
  }

  private execInfo() {
    const sel =
      ((this.shadowRoot as unknown as { getSelection?: () => Selection })
        ?.getSelection?.() as Selection | undefined) ??
      window.getSelection();
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

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .editor-container {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .editor-toolbar {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 8px;
      border-bottom: 1px solid var(--cb-border);
      background: var(--cb-surface, var(--cb-bg));
      flex-shrink: 0;
    }

    .toolbar-btn {
      padding: 4px 10px;
      border: 1px solid var(--cb-border);
      border-radius: 4px;
      background: var(--cb-input-bg);
      color: var(--cb-fg);
      cursor: pointer;
      font-size: 0.85rem;
      min-width: 32px;
      text-align: center;
    }

    .toolbar-btn:hover {
      background: var(--cb-hover);
    }

    .toolbar-btn.section-btn {
      color: red;
      font-weight: 500;
    }

    .toolbar-btn.info-btn {
      color: blue;
      font-weight: 500;
    }

    .toolbar-btn.save-btn {
      background: var(--cb-accent);
      color: var(--cb-fg-on-accent);
      border-color: transparent;
      font-weight: 500;
    }

    .toolbar-btn.save-btn:hover {
      background: var(--cb-accent-hover);
    }

    .toolbar-btn.cancel-btn {
      color: var(--cb-fg-secondary);
    }

    .toolbar-spacer {
      flex: 1;
    }

    .lyrics-editor {
      flex: 1;
      overflow-y: auto;
      outline: none;
      cursor: text;
      padding: 16px;
      box-sizing: border-box;
      min-height: 200px;
    }

    .lyrics-editor:focus {
      outline: 2px solid var(--cb-accent);
      outline-offset: -2px;
    }

    /* Default lyrics styling (can be overridden by injected editorCss) */
    .lyrics-content {
      background: lightyellow;
      font-family: ${unsafeCSS(LYRICS_UI_FONT_STACK)};
      font-size: ${unsafeCSS(LYRICS_BODY_FONT_SIZE)};
      line-height: 140%;
      color: black;
      margin: 0;
    }

    .lyrics-content h1 {
      font-size: ${unsafeCSS(LYRICS_H1_SIZE)};
      display: inline;
    }

    .lyrics-content .info {
      color: blue;
      font-size: ${unsafeCSS(LYRICS_INFO_SIZE)};
      font-weight: normal;
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
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "lyrics-editor": LyricsEditor;
  }
}
