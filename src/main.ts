/**
 * Application entry point.
 *
 * Bootstraps the CallerBuddy singleton and mounts the root <app-shell>
 * component. The app-shell manages the tab-based UI.
 */

import { callerBuddy } from "./caller-buddy.js";
import { log } from "./services/logger.js";
import "./components/app-shell.js";

// ── Android standalone-PWA viewport fix ──────────────────────────────
// On some Android devices (Samsung One UI in particular), the installed PWA
// uses the landscape viewport width even in portrait orientation.  This causes
// the layout to render at ~892 CSS-px and then get scaled down to ~412 CSS-px,
// making everything appear roughly half-sized.
//
// The workaround: when running in standalone mode, detect a width mismatch and
// force the viewport meta tag to recalculate by briefly setting an explicit
// pixel width and then restoring `device-width`.
function applyViewportFix() {
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!isStandalone) return;

  const viewport = document.querySelector<HTMLMetaElement>(
    'meta[name="viewport"]',
  );
  if (!viewport) return;

  function fixViewport() {
    // screen.width always reflects the *short* edge on Android, regardless of
    // orientation.  In portrait innerWidth should be close to screen.width; in
    // landscape it should be close to screen.height.
    const isPortrait = window.innerHeight > window.innerWidth;
    const expectedWidth = isPortrait
      ? Math.min(screen.width, screen.height)
      : Math.max(screen.width, screen.height);

    // If the viewport is more than 20% wider than expected, force a reset.
    if (window.innerWidth > expectedWidth * 1.2) {
      log.info(
        `[viewport-fix] mismatch: innerWidth=${window.innerWidth}, expected≈${expectedWidth}. Forcing recalc.`,
      );
      const original = viewport!.content;
      viewport!.content = `width=${expectedWidth}, initial-scale=1.0, viewport-fit=cover`;
      requestAnimationFrame(() => {
        viewport!.content = original;
      });
    }
  }

  window.addEventListener("orientationchange", () => {
    setTimeout(fixViewport, 120);
  });
  window.addEventListener("resize", () => {
    setTimeout(fixViewport, 80);
  });
  // Run once on startup after the first paint.
  setTimeout(fixViewport, 50);
}

applyViewportFix();

// ── Diagnostic viewport logging (temporary — remove once fix is verified) ──
log.info(
  `[viewport-diag] innerWidth=${window.innerWidth} innerHeight=${window.innerHeight} ` +
    `screen=${screen.width}x${screen.height} dpr=${devicePixelRatio} ` +
    `orientation=${screen.orientation?.type ?? "unknown"} ` +
    `standalone=${window.matchMedia("(display-mode: standalone)").matches}`,
);

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
