/**
 * In-app help documentation, rendered as a singleton tab.
 *
 * Provides a table of contents sidebar and scrollable content organized into:
 *  - A tutorial walkthrough ("Your First Dance")
 *  - Task-oriented how-to guides
 *  - A keyboard shortcuts reference
 *  - A glossary of square-dance terms used in the app
 *
 * Content lives in src/help-content.md and is compiled to HTML at build time
 * by the markdown Vite plugin (see vite.config.ts).
 */

import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { html as helpHtml } from "../help-content.md";

interface TocEntry {
  id: string;
  title: string;
  indent?: boolean;
}

const TOC: TocEntry[] = [
  { id: "tutorial", title: "Your First Dance" },
  { id: "tut-setup", title: "Setting up your folder", indent: true },
  { id: "tut-playlist", title: "Building a playlist", indent: true },
  { id: "tut-playing", title: "Playing the dance", indent: true },
  { id: "howto", title: "How-to Guides" },
  { id: "howto-import", title: "Import songs from a ZIP", indent: true },
  { id: "howto-import-folder", title: "Import from a folder", indent: true },
  { id: "howto-playlist", title: "Build and manage playlists", indent: true },
  { id: "howto-pitch-tempo", title: "Adjust pitch and tempo", indent: true },
  { id: "howto-loops", title: "Set up loop points for patter", indent: true },
  { id: "howto-break-timer", title: "Use the break timer", indent: true },
  { id: "howto-lyrics", title: "Edit or create lyrics", indent: true },
  { id: "howto-categories", title: "Categories, rank, and filtering", indent: true },
  { id: "shortcuts", title: "Keyboard Shortcuts" },
  { id: "glossary", title: "Glossary" },
];

@customElement("help-view")
export class HelpView extends LitElement {
  @state() private activeSection = "";

  private scrollToSection(id: string) {
    this.activeSection = id;
    const el = this.shadowRoot?.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  render() {
    return html`
      <div class="help-layout">
        <nav class="toc" aria-label="Help table of contents">
          <h2>Help</h2>
          <ul>
            ${TOC.map(
              (entry) => html`
                <li class="${entry.indent ? "indent" : ""} ${this.activeSection === entry.id ? "active" : ""}">
                  <a href="#${entry.id}" @click=${(e: Event) => {
                    e.preventDefault();
                    this.scrollToSection(entry.id);
                  }}>${entry.title}</a>
                </li>
              `,
            )}
          </ul>
        </nav>

        <article class="content">
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
      width: 220px;
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
    }

    .content h1:first-child,
    .content div[id]:first-child + h1 {
      margin-top: 0;
    }

    .content h2 {
      font-size: 1.15rem;
      margin: 1.75rem 0 0.5rem;
      font-weight: 600;
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

    .content div[id] {
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
