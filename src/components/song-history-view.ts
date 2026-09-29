/**
 * Song History tab: qualifying plays from CallerBuddyHistory.csv, newest first.
 * Title, rank, weighted play metric, and label come from the current song catalog.
 */

import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { callerBuddy } from "../caller-buddy.js";
import { formatUnknownError } from "../utils/format.js";
import {
  loadSongHistoryDisplay,
  type SongHistoryDisplayRow,
} from "../services/song-history.js";

@customElement("song-history-view")
export class SongHistoryView extends LitElement {
  @state() private rows: SongHistoryDisplayRow[] = [];
  @state() private loading = true;
  @state() private error = "";

  override connectedCallback(): void {
    super.connectedCallback();
    void this.reload();
  }

  private async reload(): Promise<void> {
    const root = callerBuddy.state.rootHandle;
    if (!root) {
      this.rows = [];
      this.error = "Choose a CallerBuddy folder to see song history.";
      this.loading = false;
      return;
    }
    try {
      const rows = await loadSongHistoryDisplay(root);
      if (!this.isConnected) return;
      this.rows = rows;
      this.error = "";
    } catch (err) {
      if (!this.isConnected) return;
      this.rows = [];
      this.error = `Could not read song history: ${formatUnknownError(err)}`;
    } finally {
      if (this.isConnected) this.loading = false;
    }
  }

  private formatPlayedAt(ms: number): string {
    const date = new Date(ms);
    const weekday = date.toLocaleDateString([], { weekday: "short" });
    const rest = date.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return `${weekday} ${rest}`;
  }

  private formatRank(row: SongHistoryDisplayRow): string {
    return row.rank === null ? "—" : String(row.rank);
  }

  private formatPlayed(row: SongHistoryDisplayRow): string {
    return row.played === null ? "—" : row.played.toFixed(2);
  }

  private renderType(row: SongHistoryDisplayRow) {
    if (row.singing === null) return "—";
    const singing = row.singing;
    return html`<span
      class="${singing ? "singing" : "patter"}"
      title="${singing ? "Singing call" : "Patter (no lyrics)"}"
      >${singing ? "Singing" : "Patter"}</span
    >`;
  }

  override render() {
    const countLabel =
      this.rows.length === 1 ? "1 play" : `${this.rows.length} plays`;
    return html`
      <section class="history">
        <header class="history-toolbar">
          <h2>Song History</h2>
          <span class="play-count">${this.loading ? "" : countLabel}</span>
        </header>
        <div class="history-scroll">
          ${this.error
            ? html`<p class="history-message" role="alert">${this.error}</p>`
            : nothing}
          ${this.loading
            ? html`<p class="history-message">Loading song history…</p>`
            : this.error
              ? nothing
              : this.rows.length === 0
                ? html`<p class="history-message">
                    No plays yet. A song is added here after it is played through.
                    Practice mode does not count.
                  </p>`
                : html`
                    <table class="song-table">
                      <thead>
                        <tr>
                          <th
                            class="title-col-head"
                            title="Song title, taken from the audio filename."
                          >
                            Title
                          </th>
                          <th
                            class="rank-col-head"
                            title="Your preference from 0 to 100: 100 is excellent, 50 is average, 0 means avoid using this song."
                          >
                            Rank
                          </th>
                          <th
                            class="time-col-head"
                            title="Date and time this song was played. Newest plays are listed first."
                          >
                            Time Played
                          </th>
                          <th
                            class="played-col-head"
                            title="Weighted average of how many times you've used it per month. Wait until well under 1 before using it again."
                          >
                            Played
                          </th>
                          <th
                            title="Publisher label and catalog number from the filename (e.g. RYL 607)."
                          >
                            Label
                          </th>
                          <th
                            title="Singing call (has lyrics) or patter (no lyrics file)."
                          >
                            Type
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        ${this.rows.map(
                          (row) => html`
                            <tr>
                              <td class="title-cell">
                                <span class="title-ellipsis" title=${row.path}
                                  >${row.title}</span
                                >
                              </td>
                              <td class="rank-cell">${this.formatRank(row)}</td>
                              <td class="time-cell">${this.formatPlayedAt(row.playedAtMs)}</td>
                              <td class="played-cell">${this.formatPlayed(row)}</td>
                              <td class="label-cell">${row.label}</td>
                              <td class="type-cell">${this.renderType(row)}</td>
                            </tr>
                          `,
                        )}
                      </tbody>
                    </table>
                  `}
        </div>
      </section>
    `;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .history {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--cb-panel-bg);
    }

    .history-toolbar {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px 8px;
      border-bottom: 1px solid var(--cb-border);
    }

    h2 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }

    .play-count {
      flex-shrink: 0;
      font-size: 0.8rem;
      color: var(--cb-fg-secondary);
      white-space: nowrap;
    }

    .history-scroll {
      flex: 1;
      min-height: 0;
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }

    .history-message {
      margin: 16px;
      color: var(--cb-fg-secondary);
    }

    .song-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }

    .song-table th,
    .song-table td {
      padding: 5px 10px;
      text-align: left;
      white-space: nowrap;
    }

    .song-table th {
      position: sticky;
      top: 0;
      background: var(--cb-panel-bg);
      border-bottom: 2px solid var(--cb-border-strong);
      font-weight: 600;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--cb-fg-secondary);
    }

    .song-table tbody tr {
      border-bottom: 1px solid var(--cb-border);
    }

    .title-ellipsis {
      display: block;
      max-width: 28rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .rank-col-head,
    .rank-cell {
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .played-cell,
    .played-col-head {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .label-cell {
      color: var(--cb-fg-secondary);
      font-family: monospace;
    }

    .time-cell {
      font-variant-numeric: tabular-nums;
    }

    .type-cell .singing {
      color: var(--cb-singing);
    }

    .type-cell .patter {
      color: var(--cb-patter);
    }
  `;
}
