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
import {
  installEnvListeners,
  logDeviceInfo,
  logEnv,
} from "./services/env-log.js";
import "./components/app-shell.js";
import { initLyricsScale } from "./utils/lyrics-scale.js";
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
