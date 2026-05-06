/**
 * Application entry point.
 *
 * Bootstraps the CallerBuddy singleton and mounts the root <app-shell>
 * component. The app-shell manages the tab-based UI.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MOBILE LAYOUT — accumulated findings (Samsung Galaxy A-class, Chrome WebAPK)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **Broken layout viewport on portrait**
 * Some Android installs report `window.innerWidth` stuck at the *landscape*
 * width (~980 CSS px) while `screen.width` / `screen.height` reflect the real
 * portrait hardware (e.g. 360×780). The page then lays out as ~980px wide and
 * Chrome scales it down (`visualViewport.scale` ≈ 0.37) → tiny text, landscape
 * word-wrapping in portrait. Do **not** infer orientation from `innerWidth` /
 * `innerHeight` — those may be the corrupted values.
 *
 * **Reliable orientation**
 * Use `screen.orientation.type` (sensor-driven) or `(orientation: portrait)`
 * rather than comparing inner dimensions.
 *
 * **`width=device-width` / explicit width ignored until reflow**
 * Setting `<meta name="viewport" content="width=360">` should fix the layout
 * viewport, but Chrome WebAPK on some Samsung builds **keeps** `innerWidth` at
 * the stale landscape width until something forces a full reflow (Fullscreen
 * API, or our device-width → explicit-width “sandwich”). If `innerWidth` is
 * still far above `min(screen.width,screen.height)` in portrait after the meta
 * update, we run that sandwich. Root `font-size` bump uses `(pointer: coarse)`
 * in `index.css` so it matches JS touch detection (Samsung hover MQ lies).
 *
 * **Touch detection media queries lie**
 * `(hover: none) and (pointer: coarse)` can be **false** on a pure-touch phone
 * because `(hover: none)` is false on Samsung One UI WebAPKs. Prefer
 * `(pointer: coarse)` and/or `navigator.maxTouchPoints > 0`.
 *
 * **Manifest fullscreen ≠ Fullscreen API**
 * PWA manifest `"display": "fullscreen"` hides OS chrome but does **not** set
 * `document.fullscreenElement`. The `(display-mode: fullscreen)` media query can
 * still be true while the Fullscreen API is inactive — menu uses API state.
 *
 * **User gesture collisions**
 * `requestFullscreen()` and `FileSystemDirectoryHandle.requestPermission()`
 * both consume transient user activation. A global capture listener that calls
 * fullscreen **before** button handlers breaks folder permission on the same
 * tap. Use an explicit dialog whose primary button only calls fullscreen.
 *
 * **Fullscreen may exit**
 * Permission dialogs and OS UI often exit API fullscreen; that is acceptable —
 * viewport fix keeps text usable without forcing fullscreen again.
 *
 * Long-form notes: BACKLOG.md § "Mobile viewport & fullscreen (Android WebAPK)".
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { callerBuddy } from "./caller-buddy.js";
import { log } from "./services/logger.js";
import {
  installEnvListeners,
  logDeviceInfo,
  logEnv,
} from "./services/env-log.js";
import "./components/app-shell.js";

// ── Mobile viewport meta fix — readable layout WITHOUT Fullscreen API ───────
// See file-top documentation block. Sets explicit width from screen edges.
// If Chrome still reports a huge innerWidth (stale landscape viewport),
// forces a reflow via device-width → explicit sandwich (same trick fullscreen
// accidentally triggered).
function applyViewportFix() {
  const isTouchDevice =
    window.matchMedia("(pointer: coarse)").matches ||
    (navigator.maxTouchPoints ?? 0) > 0;
  if (!isTouchDevice) return;

  const viewport = document.querySelector<HTMLMetaElement>(
    'meta[name="viewport"]',
  );
  if (!viewport) return;

  const DEVICE_WIDTH_META =
    "width=device-width, initial-scale=1.0, viewport-fit=cover";

  /** Expected layout viewport width for current orientation (~physical CSS px). */
  function expectedLayoutWidthPx(): number {
    const shortEdge = Math.min(screen.width, screen.height);
    const longEdge = Math.max(screen.width, screen.height);
    return detectIsPortrait() ? shortEdge : longEdge;
  }

  function detectIsPortrait(): boolean {
    const t = screen.orientation?.type;
    if (t) return t.startsWith("portrait");
    return window.matchMedia("(orientation: portrait)").matches;
  }

  /** Stale landscape viewport: innerWidth stays ~980 while screen short edge ~360. */
  function isLayoutViewportWrong(): boolean {
    const expected = expectedLayoutWidthPx();
    const iw = window.innerWidth;
    // Allow small deltas (fractional DPR, UI chrome). Wrong = still laid out “wide”.
    return iw > expected * 1.22;
  }

  let sandwichAttempts = 0;

  /** Samsung WebAPK sometimes ignores meta until layout is reset this way. */
  function forceReflowSandwich(targetContent: string): void {
    sandwichAttempts += 1;
    log.warn(
      `[viewport-fix] reflow sandwich attempt=${sandwichAttempts} ` +
        `innerW=${window.innerWidth} expected≈${expectedLayoutWidthPx()}`,
    );
    viewport!.content = DEVICE_WIDTH_META;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        viewport!.content = targetContent;
        setTimeout(() => {
          logEnv("vp-fix-sandwich-post");
          if (isLayoutViewportWrong() && sandwichAttempts < 2) {
            forceReflowSandwich(targetContent);
          }
        }, 80);
      });
    });
  }

  function verifyOrSandwich(targetContent: string): void {
    setTimeout(() => {
      if (!isLayoutViewportWrong()) return;
      if (sandwichAttempts >= 2) {
        log.warn(
          `[viewport-fix] still wrong after sandwiches innerW=${window.innerWidth}`,
        );
        return;
      }
      logEnv("vp-fix-verify-fail-pre");
      forceReflowSandwich(targetContent);
    }, 120);
  }

  function applyFix(): void {
    const targetWidth = expectedLayoutWidthPx();
    const targetContent = `width=${targetWidth}, initial-scale=1.0, viewport-fit=cover`;
    const before = viewport!.content;

    log.info(
      `[viewport-fix] orient=${screen.orientation?.type ?? "?"} ` +
        `target=${targetWidth} innerW=${window.innerWidth} ` +
        `innerH=${window.innerHeight} screen=${screen.width}x${screen.height} ` +
        `metaBefore="${before}" metaTarget="${targetContent}" ` +
        `willChange=${before !== targetContent}`,
    );

    sandwichAttempts = 0;
    if (before !== targetContent) {
      logEnv("vp-fix-pre");
      viewport!.content = targetContent;
      setTimeout(() => logEnv("vp-fix-post"), 50);
    }
    verifyOrSandwich(targetContent);
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

  // Exiting Fullscreen API changes chrome / inner dimensions — re-apply meta.
  document.addEventListener("fullscreenchange", () => {
    setTimeout(applyFix, 50);
  });

  let vvTimer: ReturnType<typeof setTimeout> | null = null;
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      if (vvTimer) clearTimeout(vvTimer);
      vvTimer = setTimeout(() => {
        vvTimer = null;
        if (isLayoutViewportWrong()) applyFix();
      }, 200);
    });
  }
}

applyViewportFix();

// Optional diagnostics for mobile debugging — touches resize / fullscreen / VP.
logDeviceInfo();
logEnv("startup");
installEnvListeners();

callerBuddy.init();

// Register service worker only in production (avoids caching issues in dev)
if (!import.meta.env.DEV && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + "sw.js", { updateViaCache: "none" })
      .then((registration) => {
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
