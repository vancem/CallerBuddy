/**
 * Application entry point.
 *
 * Bootstraps the CallerBuddy singleton and mounts the root <app-shell>
 * component. The app-shell manages the tab-based UI.
 */

import { callerBuddy } from "./caller-buddy.js";
import { log } from "./services/logger.js";
import {
  installEnvListeners,
  logDeviceInfo,
  logEnv,
} from "./services/env-log.js";
import "./components/app-shell.js";

// ── Mobile viewport-width fix (Samsung Android "tiny portrait" bug) ──────
// On some Android devices (notably Samsung Galaxy A-series), the layout
// viewport width is stuck at the landscape value (e.g. ~892 px) even when
// the device is in portrait orientation.  The page then renders at landscape
// width and is either scaled down (Chrome browser) or made horizontally
// scrollable (installed PWA), making text and controls appear tiny.
//
// Why our previous fix didn't work: it used `window.innerWidth` /
// `window.innerHeight` to detect orientation, but those are *the very values
// the bug corrupts*.  Detection failed and the fix never triggered.
//
// New approach: use `screen.orientation.type` (driven by the device sensor,
// not the viewport) to determine orientation, and replace
// `width=device-width` with an explicit pixel width based on `screen.width`
// /`screen.height`.  We keep the explicit width permanently (don't restore
// `device-width`, which is the broken value).  Re-apply on orientation
// changes.
function applyViewportFix() {
  // Only on touch-primary devices.  Desktop/laptop use `device-width`
  // correctly, and forcing a fixed width there could break window resizing.
  const isTouchDevice = window.matchMedia(
    "(hover: none) and (pointer: coarse)",
  ).matches;
  if (!isTouchDevice) return;

  const viewport = document.querySelector<HTMLMetaElement>(
    'meta[name="viewport"]',
  );
  if (!viewport) return;

  function detectIsPortrait(): boolean {
    const t = screen.orientation?.type;
    if (t) return t.startsWith("portrait");
    return window.matchMedia("(orientation: portrait)").matches;
  }

  function applyFix() {
    const isPortrait = detectIsPortrait();
    const shortEdge = Math.min(screen.width, screen.height);
    const longEdge = Math.max(screen.width, screen.height);
    const targetWidth = isPortrait ? shortEdge : longEdge;
    const targetContent = `width=${targetWidth}, initial-scale=1.0, viewport-fit=cover`;
    const before = viewport!.content;

    log.info(
      `[viewport-fix] orient=${screen.orientation?.type ?? "?"} ` +
        `target=${targetWidth} innerW=${window.innerWidth} ` +
        `innerH=${window.innerHeight} screen=${screen.width}x${screen.height} ` +
        `metaBefore="${before}" metaTarget="${targetContent}" ` +
        `willChange=${before !== targetContent}`,
    );

    if (before !== targetContent) {
      logEnv("vp-fix-pre");
      viewport!.content = targetContent;
      // Browsers re-flow asynchronously; let the next paint complete before
      // we measure the effect.
      setTimeout(() => logEnv("vp-fix-post"), 50);
    }
  }

  applyFix();

  if (screen.orientation && "addEventListener" in screen.orientation) {
    screen.orientation.addEventListener("change", () => {
      setTimeout(applyFix, 100);
    });
  }
  window.addEventListener("orientationchange", () => {
    setTimeout(applyFix, 100);
  });
}

applyViewportFix();

// ── Diagnostic logging ─────────────────────────────────────────────────────
// One-time static device info, then a comprehensive environment snapshot,
// then ongoing snapshots for every layout-affecting state change.  This is
// deliberately not gated on touch/PWA detection — we've learned those gates
// can lie, and silent gating means silent failure.
logDeviceInfo();
logEnv("startup");
installEnvListeners();

// Initialize the CallerBuddy application
callerBuddy.init();

// Register service worker only in production (avoids caching issues in dev)
if (!import.meta.env.DEV && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + "sw.js", { updateViaCache: "none" })
      .then((registration) => {
        // When user returns to the tab, check for updates (helps mobile pick up new
        // versions). A quick HEAD probe with a 1.5s timeout verifies real connectivity
        // first — navigator.onLine is true whenever the radio is on, even with no
        // cell reception, which would cause registration.update() to hang.
        document.addEventListener("visibilitychange", () => {
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
              registration.update();
            })
            .catch(() => clearTimeout(tid));
        });
      })
      .catch(() => {});
  });
}
