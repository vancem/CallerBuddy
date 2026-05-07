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
 * stack. When meta does nothing measurable, we set **`--cb-max-layout-px`** on
 * `:root` from **`screen` + orientation** and cap **`<app-shell>`** with
 * `max-width: min(100vw, var(--cb-max-layout-px))` so the UI fits the **physical**
 * width even when **`100vw`/innerWidth lie** (~980). Separately, **`zoom` on
 * `<html>`** is capped **by orientation** (`VIEWPORT_ZOOM_HARD_CAP_PORTRAIT` /
 * `LANDSCAPE`): portrait needs ~2.3×+ (damped) when `visualViewport.scale`~0.37; landscape
 * stays mild. Shell `max-width` prevents the old 980px-row clip. Zoom uses
 * **`1/visualViewport.scale`** (or inner/expected), damped, biased under, then
 * capped. **`html.cb-layout-zoom`** resets touch root font to 100% while zoom is
 * on. Zoom/class removed when `innerWidth` matches.
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
 * - **Bias + cap:** Zoom is **`UNDER_BIAS`** (~2% under full × raw for horizontal fit), optionally damped,
 *   then **portrait vs landscape caps**; **`--cb-max-layout-px`** clips `<app-shell>` when `vw` lies.
 *   Uniform `zoom` cannot trim H vs V separately — vertical loss to OS chrome is expected
 *   (~10% portrait / ~15% landscape tolerance vs ideal height is acceptable).
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
import { initLyricsScale } from "./utils/lyrics-scale.js";

// ── Mobile viewport: meta + optional `html { zoom }` on stuck WebAPK layouts ─
// See file-top documentation block. We still set meta (correct `vpMeta` for
// tools and the day Chrome fixes the bug). When `innerWidth` stays far above
// the physical edge, only zoom reliably corrects apparent size in practice.
/**
 * `zoom` on `<html>` **grows** paint in Blink. **`app-shell` `max-width`** clamps
 * the flex UI to the physical edge so we can use a **higher** zoom in **portrait**
 * where `visualViewport.scale` ~0.37 needs ~2.7× raw — damp×under **0.98** → ~**2%** undershoot
 * vs full neutralize for **width** (policy). Vertical dimension may diverge more (OS chrome);
 * see banner “Bias + cap”. Raise **cap** if `preCapZ` hits it.
 */
const VIEWPORT_ZOOM_HARD_CAP_PORTRAIT = 2.75;
/** Broken landscape layout (`innerW` > long edge) still needs room for raw×0.98 (often ~1.25–1.35). */
const VIEWPORT_ZOOM_HARD_CAP_LANDSCAPE = 1.42;
/** Leave at 1 unless we need to soften both axes together. */
const VIEWPORT_ZOOM_DAMPING = 1;
/** With DAMPING=1: target `vv.scale×htmlZoom ≈ 0.98` (~2% horizontal undershoot vs `1/scale`). */
const VIEWPORT_ZOOM_UNDER_BIAS = 0.98;

/** Debounce: syncZoomCompensation runs several times per frame batch — one log. */
let viewportMathLogTimer: ReturnType<typeof setTimeout> | null = null;

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
  /**
   * One debounced line with everything needed to predict perceived text size vs
   * this device: physical `screen` / `outer`, bogus `inner`, `visualViewport`,
   * ideal 1/scale, damped target, cap, and heuristic `scale×htmlZoom` (~0.98 target).
   */
  function scheduleViewportMathSnapshot(): void {
    if (viewportMathLogTimer) clearTimeout(viewportMathLogTimer);
    viewportMathLogTimer = setTimeout(() => {
      viewportMathLogTimer = null;
      const portrait = detectIsPortrait();
      const expected = expectedLayoutWidthPx();
      const iw = window.innerWidth;
      const ih = window.innerHeight;
      const sw = screen.width;
      const sh = screen.height;
      const shortE = Math.min(sw, sh);
      const longE = Math.max(sw, sh);
      const vv = window.visualViewport;
      const scale = vv?.scale;
      const ratio = iw / expected;
      const zParsed = parseFloat(
        document.documentElement.style.zoom || "1",
      );
      const z = Number.isFinite(zParsed) ? zParsed : 1;

      if (ratio <= 1.12) {
        log.info(
          `[viewport-math] state=OK screen=${sw}x${sh} outer=${window.outerWidth}x${window.outerHeight} ` +
            `inner=${iw}x${ih} expectedW=${expected} vv.scale=${scale?.toFixed(3) ?? "?"} htmlZoom=${z.toFixed(2)}`,
        );
        return;
      }

      const rawFromScale =
        scale != null && scale > 0 && scale < 0.999
          ? Math.min(1 / scale, 8)
          : null;
      const rawFromRatio = Math.min(ratio, 8);
      const raw = rawFromScale ?? rawFromRatio;
      const cap = portrait
        ? VIEWPORT_ZOOM_HARD_CAP_PORTRAIT
        : VIEWPORT_ZOOM_HARD_CAP_LANDSCAPE;
      const preCapZ = Math.max(
        raw * VIEWPORT_ZOOM_DAMPING * VIEWPORT_ZOOM_UNDER_BIAS,
        1.001,
      );
      const hitCap = z < preCapZ - 0.004;
      const idealNeutralize = scale != null && scale > 0 ? 1 / scale : null;
      const approxPerceived =
        scale != null && scale > 0 ? scale * z : null;
      const gapFrom1 =
        approxPerceived != null ? 1 - approxPerceived : null;

      const vpMeta =
        document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
          ?.content ?? "?";

      const dampUnder =
        VIEWPORT_ZOOM_DAMPING * VIEWPORT_ZOOM_UNDER_BIAS;
      log.info(
        `[viewport-math] ` +
          `deviceScreen=${sw}x${sh} short=${shortE} long=${longE} dpr=${devicePixelRatio} ` +
          `outer=${window.outerWidth}x${window.outerHeight} inner=${iw}x${ih} ` +
          `docClient=${document.documentElement.clientWidth}x${document.documentElement.clientHeight} ` +
          `orient=${screen.orientation?.type ?? "?"} portrait=${portrait} ` +
          `vpMeta="${vpMeta}" ` +
          `expectedW=${expected} layoutMisfit=${ratio.toFixed(2)}×(inner/expected) ` +
          `vv={w:${vv?.width?.toFixed(0) ?? "?"},h:${vv?.height?.toFixed(0) ?? "?"},scale:${scale?.toFixed(3) ?? "?"}} ` +
          `idealHtmlZoom≈${idealNeutralize?.toFixed(2) ?? "?"} (=1/vv.scale if shrink only) ` +
          `damp×under=${dampUnder.toFixed(3)} raw=${raw.toFixed(2)} preCapZ=${preCapZ.toFixed(2)} appliedHtmlZoom=${z.toFixed(2)} cap=${cap} hitCap=${hitCap} ` +
          `approxPerceivedScale≈${approxPerceived?.toFixed(3) ?? "?"} (=vv.scale×htmlZoom; ~=scale×raw×dampUnder; target ~0.98) ` +
          `gapFrom1=${gapFrom1?.toFixed(3) ?? "?"} (target ~0.02; larger ⇒ width soft; check padding)`,
      );
      if (hitCap && approxPerceived != null && approxPerceived < 0.96) {
        log.warn(
          `[viewport-math] CAP starved correction: need cap≥${preCapZ.toFixed(2)} for ~full neutralize, or raise HARD_CAP_${portrait ? "PORTRAIT" : "LANDSCAPE"} (now ${cap})`,
        );
      }
    }, 420);
  }

  function syncZoomCompensation(): void {
    const expected = expectedLayoutWidthPx();
    const iw = window.innerWidth;
    const ratio = iw / expected;
    if (ratio <= 1.12) {
      document.documentElement.style.removeProperty("zoom");
      document.documentElement.classList.remove("cb-layout-zoom");
      scheduleViewportMathSnapshot();
      return;
    }
    const vv = window.visualViewport;
    const scale = vv?.scale;
    const rawFromScale =
      scale != null && scale > 0 && scale < 0.999
        ? Math.min(1 / scale, 8)
        : null;
    const rawFromRatio = Math.min(ratio, 8);
    const raw = rawFromScale ?? rawFromRatio;
    const cap = detectIsPortrait()
      ? VIEWPORT_ZOOM_HARD_CAP_PORTRAIT
      : VIEWPORT_ZOOM_HARD_CAP_LANDSCAPE;
    const z = Math.min(
      Math.max(
        raw * VIEWPORT_ZOOM_DAMPING * VIEWPORT_ZOOM_UNDER_BIAS,
        1.001,
      ),
      cap,
    );
    document.documentElement.classList.add("cb-layout-zoom");
    document.documentElement.style.zoom = String(z);
    log.info(
      `[viewport-fix] html zoom=${z.toFixed(2)} cap=${cap} portrait=${detectIsPortrait()} (raw=${raw.toFixed(2)} damp=${VIEWPORT_ZOOM_DAMPING} under=${VIEWPORT_ZOOM_UNDER_BIAS}) innerW=${iw} expected≈${expected}` +
        (rawFromScale != null && scale != null
          ? ` visualViewport.scale=${scale.toFixed(3)}`
          : ` (inner/expected; scale unavailable or ~1)`) +
        ` — meta did not fix layout viewport`,
    );
    scheduleViewportMathSnapshot();
  }

  /** Matches physical edge so `<app-shell>` can `max-width` despite bogus `100vw`. */
  function syncRootMaxLayoutPx(): void {
    const px = expectedLayoutWidthPx();
    document.documentElement.style.setProperty("--cb-max-layout-px", `${px}px`);
  }

  function applyFix(): void {
    syncRootMaxLayoutPx();
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
initLyricsScale();

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
