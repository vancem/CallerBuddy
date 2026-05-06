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
 * **`width=device-width` ignored**
 * Even with a correct viewport meta, the broken inner width can persist until
 * something forces a real layout change (e.g. Fullscreen API `requestFullscreen`
 * on some devices). We still set an explicit `meta viewport` width from
 * `screen` short/long edge — see `applyViewportFix()` — so readable UI does not
 * depend on fullscreen.
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

// ── Mobile viewport meta fix — portrait readable text WITHOUT Fullscreen API ─
// See file-top documentation block. Replaces width=device-width with an
// explicit CSS-pixel width from screen edges when touch is detected reliably.
function applyViewportFix() {
  const isTouchDevice =
    window.matchMedia("(pointer: coarse)").matches ||
    (navigator.maxTouchPoints ?? 0) > 0;
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
