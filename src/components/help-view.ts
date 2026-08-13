/**
 * In-app help documentation, rendered as a singleton tab.
 *
 * Provides a table of contents sidebar and scrollable content from
 * src/help-content.md (workflow overview, how-to guides, shortcuts, glossary).
 *
 * In-help hash / TOC hyperlinks push a local back stack of prior scroll
 * positions. Back / ArrowLeft / system back unwind that stack first, then
 * fall through to the tab back stack (leave Help).
 *
 * Content lives in src/help-content.md and is compiled to HTML at build time
 * by the markdown Vite plugin (see vite.config.ts). Relative images under
 * src/images/ are bundled as Vite assets and rewritten to hashed URLs.
 */

import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { html as helpHtml } from "../help-content.md";
import { callerBuddy } from "../caller-buddy.js";
import { StateEvents } from "../services/app-state.js";

interface TocEntry {
  id: string;
  title: string;
  indent?: boolean;
}

/** Snapshot of where the reader was before an in-help hyperlink jump. */
interface HelpHistoryEntry {
  scrollTop: number;
  sectionId: string;
}

/** IDs match GitHub/GFM heading slugs from help-content.md (marked-gfm-heading-id). */
const TOC: TocEntry[] = [
  { id: "welcome-to-callerbuddy", title: "Welcome to CallerBuddy" },
  { id: "expected-workflow", title: "Expected Workflow" },
  { id: "first-time-setup", title: "First Time Setup", indent: true },
  { id: "the-app-menu", title: "The App Menu" },
  { id: "playlist-editor", title: "Playlist Editor" },
  { id: "now-playing", title: "Now Playing" },
  { id: "the-break-timer", title: "The Break Timer", indent: true },
  { id: "song-player", title: "Song Player" },
  { id: "adjust-pitch-and-tempo", title: "Adjust pitch and tempo", indent: true },
  { id: "the-song-progress-bar", title: "The Song Progress Bar", indent: true },
  { id: "the-left-pane-in-the-song-player", title: "The left pane", indent: true },
  { id: "setting-loop-points-for-patter", title: "Setting loop points for patter", indent: true },
  { id: "the-patter-timer", title: "The patter timer" },
  { id: "lyric-editor", title: "Lyric Editor" },
  { id: "callerbuddy-security", title: "CallerBuddy Security" },
  { id: "running-callerbuddy-outside-the-browser", title: "Installing / outside the browser" },
  { id: "cloud-storage-for-your-songs", title: "Cloud Storage for your Songs" },
  { id: "offline-callerbuddy", title: "Offline CallerBuddy" },
  { id: "how-to-guides", title: "How-to Guides" },
  { id: "adding-songs-to-callerbuddy", title: "Adding Songs to CallerBuddy", indent: true },
  { id: "import-songs-from-a-zip-file", title: "Import songs from a ZIP", indent: true },
  { id: "import-songs-from-a-folder", title: "Import from a folder", indent: true },
  { id: "build-and-manage-playlists", title: "Build and manage playlists", indent: true },
  { id: "edit-lyrics", title: "Edit lyrics", indent: true },
  { id: "lyrics-markdown", title: "Lyrics Markdown", indent: true },
  { id: "how-the-played-average-is-calculated", title: "How the Played Average is Calculated", indent: true },
  { id: "keyboard-shortcuts", title: "Keyboard Shortcuts" },
  { id: "glossary", title: "Glossary" },
];

@customElement("help-view")
export class HelpView extends LitElement {
  /** Optional section id to scroll to when the Help tab opens (e.g. from Markdown help). */
  @property({ type: String }) sectionId = "";

  /** True when the Help tab is the active shell tab; gates the ArrowLeft-to-go-back shortcut. */
  @property({ type: Boolean }) active = false;

  @state() private activeSection = "";

  /** In-help hyperlink history; exhausted before falling through to the tab back stack. */
  private helpBackStack: HelpHistoryEntry[] = [];

  private _boundKeydown = (e: KeyboardEvent) => this.onKeydown(e);
  private _boundStateChanged = () => this.requestUpdate();

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("keydown", this._boundKeydown);
    callerBuddy.state.addEventListener(StateEvents.CHANGED, this._boundStateChanged);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this._boundKeydown);
    callerBuddy.state.removeEventListener(StateEvents.CHANGED, this._boundStateChanged);
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has("sectionId") && this.sectionId) {
      // Instant jump: avoid top→smooth flash when Help is (re)opened with a target.
      // External open (menu / ? help) does not push in-help history.
      requestAnimationFrame(() => this.scrollToSection(this.sectionId, "auto"));
    }
  }

  private getContentEl(): HTMLElement | null {
    return this.shadowRoot?.querySelector(".content") ?? null;
  }

  /** True when Back / ArrowLeft can restore a prior in-help position. */
  hasHelpHistory(): boolean {
    return this.helpBackStack.length > 0;
  }

  private scrollToSection(id: string, behavior: ScrollBehavior = "smooth") {
    this.activeSection = id;
    const el = this.shadowRoot?.getElementById(id);
    el?.scrollIntoView({ behavior, block: "start" });
  }

  /**
   * Navigate via an in-help hyperlink (TOC or content hash). Pushes the current
   * scroll position so Back can restore it before leaving the Help tab.
   */
  private navigateInHelp(id: string) {
    if (id === this.activeSection) {
      // Re-clicking the current section: still scroll into view, no history entry.
      this.scrollToSection(id);
      return;
    }
    const content = this.getContentEl();
    this.helpBackStack.push({
      scrollTop: content?.scrollTop ?? 0,
      sectionId: this.activeSection,
    });
    this.scrollToSection(id);
    this.requestUpdate();
  }

  /** Restore the most recent in-help position. Returns true if one was restored. */
  private popHelpHistory(): boolean {
    const prev = this.helpBackStack.pop();
    if (!prev) return false;
    this.activeSection = prev.sectionId;
    const content = this.getContentEl();
    if (content) content.scrollTop = prev.scrollTop;
    this.requestUpdate();
    return true;
  }

  /**
   * Hash links in help markdown (e.g. [Security](#callerbuddy-security)) live inside the
   * Lit shadow root, so the browser's default #fragment navigation cannot find
   * the targets. Intercept in-content hash clicks and scroll within the shadow.
   */
  private onContentClick(e: Event) {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href || !href.startsWith("#") || href.length < 2) return;
    e.preventDefault();
    this.navigateInHelp(decodeURIComponent(href.slice(1)));
  }

  /**
   * ArrowLeft: unwind in-help hyperlink history first, then return to the page
   * that opened Help (same target as the Back button).
   */
  private onKeydown(e: KeyboardEvent) {
    if (!this.active) return;
    if (e.key !== "ArrowLeft" || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!this.hasHelpHistory() && !callerBuddy.state.peekBackTarget()) return;
    e.preventDefault();
    this.goBack();
  }

  /**
   * Back action for Help: pop in-help history if any, otherwise leave Help via
   * the tab back stack. Returns true if either step navigated.
   */
  goBack(): boolean {
    if (this.popHelpHistory()) return true;
    return callerBuddy.state.goBack();
  }

  render() {
    const canGoBack = this.hasHelpHistory() || !!callerBuddy.state.peekBackTarget();
    const backTitle = this.hasHelpHistory()
      ? "Back to previous help location (\u2190)"
      : "Back to where you opened Help from (\u2190)";
    return html`
      <div class="help-layout">
        <nav class="toc" aria-label="Help table of contents">
          ${canGoBack
            ? html`
                <button
                  class="back-btn"
                  title=${backTitle}
                  @click=${this.goBack}
                >
                  \u2190 Back
                </button>
              `
            : nothing}
          <h2>Help</h2>
          <ul>
            ${TOC.map(
              (entry) => html`
                <li class="${entry.indent ? "indent" : ""} ${this.activeSection === entry.id ? "active" : ""}">
                  <a href="#${entry.id}" @click=${(e: Event) => {
                    e.preventDefault();
                    this.navigateInHelp(entry.id);
                  }}>${entry.title}</a>
                </li>
              `,
            )}
          </ul>
        </nav>

        <article class="content" @click=${this.onContentClick}>
          ${unsafeHTML(helpHtml)}
        </article>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }

    .help-layout {
      display: flex;
      height: 100%;
    }

    /* -- Table of contents ------------------------------------------------ */

    .toc {
      width: 13.75rem;
      flex-shrink: 0;
      padding: 16px 12px;
      border-right: 1px solid var(--cb-border);
      overflow-y: auto;
      background: var(--cb-panel-bg);
    }

    .toc h2 {
      margin: 0 0 12px;
      font-size: 1rem;
      font-weight: 600;
    }

    .back-btn {
      display: block;
      width: 100%;
      margin: 0 0 14px;
      padding: 6px 10px;
      font-size: 0.85rem;
      text-align: left;
      background: none;
      color: var(--cb-accent);
      border: 1px solid var(--cb-accent);
      border-radius: 4px;
      cursor: pointer;
    }

    .back-btn:hover {
      background: var(--cb-accent-subtle);
      color: var(--cb-accent-hover);
      border-color: var(--cb-accent-hover);
    }

    .toc ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .toc li {
      margin: 0;
    }

    .toc li.indent {
      padding-left: 14px;
    }

    .toc a {
      display: block;
      padding: 4px 8px;
      border-radius: 4px;
      color: var(--cb-fg-secondary);
      text-decoration: none;
      font-size: 0.85rem;
      line-height: 1.4;
    }

    .toc a:hover {
      color: var(--cb-fg);
      background: var(--cb-hover);
    }

    .toc li.active a {
      color: var(--cb-fg);
      background: var(--cb-accent-subtle);
      font-weight: 500;
    }

    /* -- Content area ----------------------------------------------------- */

    .content {
      flex: 1;
      overflow-y: auto;
      padding: 24px 32px 64px;
    }

    .content h1 {
      font-size: 1.5rem;
      margin: 2rem 0 0.75rem;
      font-weight: 600;
      padding-bottom: 0.3em;
      border-bottom: 1px solid var(--cb-border);
    }

    .content h1:first-child {
      margin-top: 0;
    }

    .content h2 {
      font-size: 1.15rem;
      margin: 1.75rem 0 0.5rem;
      font-weight: 600;
      padding-bottom: 0.3em;
      border-bottom: 1px solid var(--cb-border);
    }

    .content h3 {
      font-size: 1rem;
      margin: 1.25rem 0 0.4rem;
      font-weight: 600;
    }

    .content p,
    .content li,
    .content dd {
      line-height: 1.65;
      color: var(--cb-fg);
    }

    .content ul,
    .content ol {
      padding-left: 1.5em;
      margin: 0.5em 0;
    }

    .content li {
      margin: 0.3em 0;
    }

    .content code {
      background: var(--cb-hover);
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 0.9em;
    }

    .content a {
      color: var(--cb-accent);
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .content a:hover {
      color: var(--cb-accent-hover);
    }

    .content img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0.75em auto;
    }

    .content :is(h1, h2, h3)[id] {
      scroll-margin-top: 16px;
    }

    /* -- Keyboard shortcut tables ----------------------------------------- */

    .content table {
      width: 100%;
      border-collapse: collapse;
      margin: 0.75em 0 1.25em;
      font-size: 0.9rem;
    }

    .content th {
      text-align: left;
      border-bottom: 2px solid var(--cb-border);
      padding: 6px 10px;
      font-weight: 600;
    }

    .content td {
      padding: 5px 10px;
      border-bottom: 1px solid var(--cb-border);
    }

    .content tr:last-child td {
      border-bottom: none;
    }

    kbd {
      display: inline-block;
      padding: 2px 6px;
      font-family: inherit;
      font-size: 0.85em;
      background: var(--cb-hover);
      border: 1px solid var(--cb-border);
      border-radius: 4px;
      line-height: 1.3;
    }

    /* -- Glossary (definition list) --------------------------------------- */

    dl {
      margin: 0.75em 0;
    }

    dt {
      font-weight: 600;
      margin-top: 1em;
    }

    dd {
      margin: 0.25em 0 0 1.5em;
    }

    /* -- Narrow layout ---------------------------------------------------- */

    @media (max-width: 700px) {
      .toc {
        display: none;
      }

      .content {
        padding: 16px;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "help-view": HelpView;
  }
}
