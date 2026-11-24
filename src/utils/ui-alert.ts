import { html, nothing } from "lit";

/** OK-only message dialog. Pair with `alertDialogStyles` + `modalOverlayStyles`. */
export function renderAlertDialog(
  message: string,
  onDismiss: () => void,
) {
  if (!message) return nothing;
  return html`
    <div
      class="cb-modal-overlay cb-alert-overlay"
      @click=${onDismiss}
    ></div>
    <div
      class="cb-alert-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-describedby="cb-alert-message"
      @click=${(e: Event) => e.stopPropagation()}
    >
      <p id="cb-alert-message" class="cb-alert-body">${message}</p>
      <form
        class="cb-alert-actions"
        @submit=${(e: Event) => {
          e.preventDefault();
          onDismiss();
        }}
      >
        <button type="submit" class="cb-alert-ok" autofocus>OK</button>
      </form>
    </div>
  `;
}

/**
 * Steps for clearing this origin when Reset cannot delete IndexedDB.
 * Pair with `alertDialogStyles` + `modalOverlayStyles`.
 * `location.host` is the name Chrome shows (production: vancem.github.io).
 */
export function renderSiteDataRecoveryDialog(onDismiss: () => void) {
  const host = location.host || "this site";
  return html`
    <div
      class="cb-modal-overlay cb-alert-overlay"
      @click=${onDismiss}
    ></div>
    <div
      class="cb-alert-dialog cb-recovery-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="cb-recovery-title"
      @click=${(e: Event) => e.stopPropagation()}
    >
      <h2 id="cb-recovery-title" class="cb-recovery-title">Reset could not finish</h2>
      <p class="cb-alert-body">
        CallerBuddy could not clear its saved data. Clear site data for
        <strong>${host}</strong>, then reload CallerBuddy. Your song files
        are not deleted.
      </p>
      <ol class="cb-recovery-steps">
        <li>
          <strong>Desktop Chrome or Edge.</strong>
          Click the icon to the left of the address bar, choose Site settings,
          then Delete data. Reload CallerBuddy.
        </li>
        <li>
          <strong>Android Chrome.</strong>
          Tap the lock icon, choose Site settings, then Clear &amp; reset.
          Reopen CallerBuddy.
        </li>
        <li>
          <strong>Installed app with no address bar.</strong>
          Open this site in Chrome, or go to Chrome Settings, Privacy and
          security, Site settings, View permissions and data stored across
          sites, and delete <strong>${host}</strong>.
        </li>
      </ol>
      <form
        class="cb-alert-actions"
        @submit=${(e: Event) => {
          e.preventDefault();
          onDismiss();
        }}
      >
        <button type="submit" class="cb-alert-ok" autofocus>OK</button>
      </form>
    </div>
  `;
}
