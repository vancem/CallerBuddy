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
 * **Why landscape often “looks fine” (it is not actually fixed)**
 * The layout viewport can stay **the same wrong width (~980 CSS px)** in both
 * orientations. The browser then **scales the page to fit the window**
 * (`visualViewport.scale` < 1). In **landscape** the window is **wide** (~780px
 * along the long edge), so fitting ~980 needs only a **mild** scale (~0.77 in
 * your logs). In **portrait** the window is **narrow** (~360px), so the same
 * 980px layout is crushed to **~0.37** → tiny UI. Starting in landscape can also
 * hit an initialization path where `innerWidth` is closer to the long edge, but
 * the underlying bug is the same: **trust `screen` + `visualViewport.scale`,
 * not “landscape = OK”.**
 *
 * **Accurate signals (use these for decisions)**
 * - Physical / orientation: `screen.width`, `screen.height`, `screen.orientation.type`
 * - How much the page is visually shrunk: **`visualViewport.scale`** (and `width`/`height`)
 * - Chrome window in CSS px: `window.outerWidth`, `window.outerHeight`
 * - **Unreliable here:** `window.innerWidth` / `innerHeight` as “true” viewport size
 *
 * **Trivial standards fix:** correct `<meta name="viewport">` **should** suffice.
 * On this WebAPK it often **does not** change layout; there is no smaller “proper”
 * web API to force layout viewport recalculation. Workarounds: Fullscreen API, or
 * compensating zoom derived from **`1 / visualViewport.scale`** (undo shrink the
 * browser already applied — see `syncZoomCompensation`).
 *
 * **`width=device-width` / explicit width often ignored for layout**
 * The `<meta name="viewport">` string updates in the DOM (`vpMeta="width=360"`)
 * but Chrome WebAPK on some Samsung builds **still reports** `innerWidth`≈980
 * (stale landscape layout viewport) with `visualViewport.scale`<1 — meta alone
 * does not fix layout. A Fullscreen API transition **does** fix it on this
 * stack. When meta does nothing measurable, we fall back to **`zoom` on
 * `<html>`** — ideally **`1 / visualViewport.scale`** (neutralize measured
 * shrink); else **`innerWidth / expectedEdge`** (`expectedEdge` from `screen` +
 * orientation). Apply **damping** — full undo × **`VIEWPORT_ZOOM_DAMPING`** —
 * because zoom stacks with **`index.css` touch `font-size: 120%`** on `:root`;
 * while zoom is on we add **`html.cb-layout-zoom`** so root stays **100%** and
 * rem does not double-scale. Zoom/class removed when `innerWidth` matches.
 * Non-standard but effective in Blink WebViews here.
 *
 * Root `font-size` bump uses `(pointer: coarse)` in `index.css` so it matches JS
 * touch detection (Samsung `(hover: none)` MQ lies).
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
 * **Other phones (portability)**
 * - **Healthy viewport:** On most devices `innerWidth` is already near the
 *   physical edge → `ratio ≤ 1.12` → **no `zoom`** is applied; only `<meta
 *   viewport>` updates. No regression for “normal” phones.
 * - **Broken viewport:** Same logic helps **any** Blink/WebView stack where meta
 *   is ignored and `innerWidth` stays large (confirmed Samsung WebAPK; others
 *   possible). Uses **`visualViewport.scale`** when available (standard API).
 * - **`html { zoom }`:** Blink-focused; WebKit often honors it for layout. If a
 *   browser ignores `zoom`, worst case is unchanged oversmall UI until Fullscreen
 *   or a browser fix — we don’t remove meta or touch font elsewhere.
 * - **Bias:** Final zoom is **slightly under** full correction (`UNDER_BIAS`) so
 *   text errs **small** rather than clipped — safer across unknown DPR/chrome/insets.
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

// ── Mobile viewport: meta + optional `html { zoom }` on stuck WebAPK layouts ─
// See file-top documentation block. We still set meta (correct `vpMeta` for
// tools and the day Chrome fixes the bug). When `innerWidth` stays far above
// the physical edge, only zoom reliably corrects apparent size in practice.
const VIEWPORT_ZOOM_MAX = 4;
/** Full `1/visualViewport.scale` (or inner/expected) overshoots: zoom × touch root `font-size` compounds. */
const VIEWPORT_ZOOM_DAMPING = 0.88;
/** Multiply effective zoom by this (<1): prefer slightly small UI over horizontal clipping on varied phones. */
const VIEWPORT_ZOOM_UNDER_BIAS = 0.93;

function applyViewportFix() {
  const isTouchDevice =
    window.matchMedia("(pointer: coarse)").matches ||
    (navigator.maxTouchPoints ?? 0) > 0;
  if (!isTouchDevice) return;

  const viewport = document.querySelector<HTMLMetaElement>(
    'meta[name="viewport"]',
  );
  if (!viewport) return;

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

  /** WebAPK may keep a huge layout innerWidth; compare to what the device edge implies. */
  function needsZoomCompensation(): boolean {
    const expected = expectedLayoutWidthPx();
    return window.innerWidth > expected * 1.12;
  }

  /**
   * When `<meta viewport>` does not change `innerWidth` (observed: vpMeta=360
   * but innerW=980), undo the browser’s shrink-to-fit using the **measured**
   * `visualViewport.scale` when present (`zoom ≈ 1/scale`). That uses the same
   * signal as the “why portrait looks tiny” explanation. Fallback: `innerW /
   * expectedEdge`. Removed when layout matches expected edge.
   */
  function syncZoomCompensation(): void {
    const expected = expectedLayoutWidthPx();
    const iw = window.innerWidth;
    const ratio = iw / expected;
    if (ratio <= 1.12) {
      document.documentElement.style.removeProperty("zoom");
      document.documentElement.classList.remove("cb-layout-zoom");
      return;
    }
    const vv = window.visualViewport;
    const scale = vv?.scale;
    const rawFromScale =
      scale != null && scale > 0 && scale < 0.999
        ? Math.min(1 / scale, VIEWPORT_ZOOM_MAX)
        : null;
    const rawFromRatio = Math.min(ratio, VIEWPORT_ZOOM_MAX);
    const raw = rawFromScale ?? rawFromRatio;
    const z = Math.min(
      Math.max(
        raw * VIEWPORT_ZOOM_DAMPING * VIEWPORT_ZOOM_UNDER_BIAS,
        1.001,
      ),
      VIEWPORT_ZOOM_MAX,
    );
    document.documentElement.classList.add("cb-layout-zoom");
    document.documentElement.style.zoom = String(z);
    log.warn(
      `[viewport-fix] html zoom=${z.toFixed(2)} (raw=${raw.toFixed(2)} damp=${VIEWPORT_ZOOM_DAMPING} under=${VIEWPORT_ZOOM_UNDER_BIAS}) innerW=${iw} expected≈${expected}` +
        (rawFromScale != null && scale != null
          ? ` visualViewport.scale=${scale.toFixed(3)}`
          : ` (inner/expected; scale unavailable or ~1)`) +
        ` — meta did not fix layout viewport`,
    );
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

    if (before !== targetContent) {
      logEnv("vp-fix-pre");
      viewport!.content = targetContent;
      setTimeout(() => logEnv("vp-fix-post"), 50);
    }
    // Meta may not move innerWidth; zoom runs after paint catches up.
    requestAnimationFrame(() => {
      syncZoomCompensation();
      setTimeout(syncZoomCompensation, 100);
      setTimeout(syncZoomCompensation, 350);
    });
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

  document.addEventListener("fullscreenchange", () => {
    setTimeout(applyFix, 50);
  });

  let vvTimer: ReturnType<typeof setTimeout> | null = null;
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      if (vvTimer) clearTimeout(vvTimer);
      vvTimer = setTimeout(() => {
        vvTimer = null;
        if (needsZoomCompensation()) syncZoomCompensation();
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
