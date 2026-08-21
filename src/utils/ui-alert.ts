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
