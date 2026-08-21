/**
 * Production service-worker registration and update handoff.
 *
 * A new worker must not skipWaiting/claim on its own: that deletes the old
 * Cache Storage while the open window is still running the previous hashed
 * bundle, which can hang until the user closes the app. This page asks a
 * waiting worker to activate only when the UI is idle, then reloads once.
 */

import { log } from "./logger.js";

export const SKIP_WAITING_MESSAGE = "skipWaiting";

const IDLE_RETRY_MS = 2000;

export type PwaUpdateHost = {
  /** True when it is safe to reload (no song player open, audio not playing). */
  isIdle: () => boolean;
  reload: () => void;
};

/**
 * Ask a waiting worker to activate only for an in-session update (there is
 * already a controller) and only when the UI can survive a reload.
 */
export function shouldActivateWaitingWorker(
  waiting: ServiceWorker | null | undefined,
  hasController: boolean,
  isIdle: boolean,
): boolean {
  return Boolean(waiting) && hasController && isIdle;
}

export function bindServiceWorkerUpdates(
  registration: ServiceWorkerRegistration,
  serviceWorker: ServiceWorkerContainer,
  host: PwaUpdateHost,
): void {
  let expectingControllerChange = false;
  let reloading = false;

  const askWaitingIfIdle = () => {
    const waiting = registration.waiting;
    if (
      !waiting ||
      !shouldActivateWaitingWorker(
        waiting,
        Boolean(serviceWorker.controller),
        host.isIdle(),
      )
    ) {
      return;
    }
    expectingControllerChange = true;
    waiting.postMessage(SKIP_WAITING_MESSAGE);
  };

  const scheduleIdleCheck = () => {
    const tick = () => {
      if (reloading) return;
      if (!registration.waiting) return;
      if (!host.isIdle()) {
        window.setTimeout(tick, IDLE_RETRY_MS);
        return;
      }
      askWaitingIfIdle();
    };
    tick();
  };

  serviceWorker.addEventListener("controllerchange", () => {
    if (!expectingControllerChange || reloading) return;
    reloading = true;
    log.info("New CallerBuddy version active; reloading.");
    host.reload();
  });

  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed") scheduleIdleCheck();
    });
  });

  scheduleIdleCheck();
}

function checkForUpdate(registration: ServiceWorkerRegistration): void {
  if (document.visibilityState !== "visible" || !navigator.onLine) return;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 1500);
  fetch(import.meta.env.BASE_URL + "sw.js", {
    method: "HEAD",
    signal: ctrl.signal,
    cache: "no-store",
  })
    .then(() => {
      clearTimeout(tid);
      return registration.update();
    })
    .catch(() => clearTimeout(tid));
}

/**
 * Register `sw.js` and apply waiting updates when {@link PwaUpdateHost.isIdle}.
 * No-op when the browser has no service worker API (caller still skips this
 * in Vite dev).
 */
export function registerProductionServiceWorker(host: PwaUpdateHost): void {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker
    .register(import.meta.env.BASE_URL + "sw.js", { updateViaCache: "none" })
    .then((registration) => {
      bindServiceWorkerUpdates(registration, navigator.serviceWorker, host);
      document.addEventListener("visibilitychange", () =>
        checkForUpdate(registration),
      );
    })
    .catch((err) => {
      log.warn("Service worker registration failed:", err);
    });
}
