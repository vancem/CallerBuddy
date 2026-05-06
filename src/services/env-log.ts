/**
 * Environment / viewport diagnostic logging.
 *
 * Captures a comprehensive snapshot of everything that affects layout (viewport
 * size, orientation, fullscreen state, display-mode, the viewport meta tag)
 * as a single tagged log line.
 *
 * Used to diagnose mobile-browser quirks (e.g. Samsung One UI's viewport-width
 * misreporting on installed PWAs) where the documented APIs don't all behave
 * the way they're supposed to.  Having the full state at every relevant event
 * lets us catch which signal lied without another round-trip to the device.
 */

import { log } from "./logger.js";

let installed = false;

function fmt(n: number | undefined | null, d = 0): string {
  if (n == null) return "?";
  return d > 0 ? n.toFixed(d) : Math.round(n).toString();
}

/** Capture current dynamic environment state in a single log line. */
export function logEnv(tag: string): void {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="viewport"]',
  );
  const fsEl =
    document.fullscreenElement ??
    (document as Document & { webkitFullscreenElement?: Element | null })
      .webkitFullscreenElement;
  const vv = window.visualViewport;
  const orient = screen.orientation;
  const docEl = document.documentElement;

  log.info(
    `[env ${tag}] ` +
      `inner=${innerWidth}x${innerHeight} ` +
      `outer=${outerWidth}x${outerHeight} ` +
      `client=${docEl.clientWidth}x${docEl.clientHeight} ` +
      `screen=${screen.width}x${screen.height} ` +
      `avail=${screen.availWidth}x${screen.availHeight} ` +
      `visualVP=${fmt(vv?.width)}x${fmt(vv?.height)}@${fmt(vv?.scale, 2)} ` +
      `dpr=${devicePixelRatio} ` +
      `orient=${orient?.type ?? "?"}/${orient?.angle ?? "?"} ` +
      `fs=${!!fsEl} ` +
      `mqStd=${matchMedia("(display-mode: standalone)").matches} ` +
      `mqFs=${matchMedia("(display-mode: fullscreen)").matches} ` +
      `mqMin=${matchMedia("(display-mode: minimal-ui)").matches} ` +
      `mqBrw=${matchMedia("(display-mode: browser)").matches} ` +
      `vpMeta="${meta?.content ?? "?"}"`,
  );
}

/** One-time log of static device info (UA, touch caps, etc.). */
export function logDeviceInfo(): void {
  const nav = navigator as Navigator & {
    standalone?: boolean;
    deviceMemory?: number;
    userAgentData?: { mobile?: boolean; platform?: string };
  };
  const ua = navigator.userAgent.length > 200
    ? navigator.userAgent.slice(0, 200) + "…"
    : navigator.userAgent;

  log.info(
    `[device] ` +
      `ua="${ua}" ` +
      `platform="${navigator.platform ?? "?"}" ` +
      `vendor="${navigator.vendor ?? "?"}" ` +
      `lang=${navigator.language} ` +
      `maxTouch=${navigator.maxTouchPoints ?? 0} ` +
      `ontouchstart=${"ontouchstart" in window} ` +
      `mqHoverNone=${matchMedia("(hover: none)").matches} ` +
      `mqAnyHoverNone=${matchMedia("(any-hover: none)").matches} ` +
      `mqPtrCoarse=${matchMedia("(pointer: coarse)").matches} ` +
      `mqAnyPtrCoarse=${matchMedia("(any-pointer: coarse)").matches} ` +
      `mqHoverNoneAndPtrCoarse=${matchMedia("(hover: none) and (pointer: coarse)").matches} ` +
      `fsEnabled=${document.fullscreenEnabled ?? false} ` +
      `iosStandalone=${!!nav.standalone} ` +
      `uaMobile=${nav.userAgentData?.mobile ?? "?"} ` +
      `uaPlatform="${nav.userAgentData?.platform ?? "?"}" ` +
      `deviceMemory=${nav.deviceMemory ?? "?"}`,
  );
}

/**
 * Install listeners that call logEnv on every event that can change layout
 * state.  Idempotent: calling more than once is a no-op.
 *
 * Events covered:
 *  - resize (debounced 250ms)
 *  - orientationchange  (legacy)
 *  - screen.orientation 'change'
 *  - fullscreenchange (and webkit prefix)
 *  - visibilitychange (when becoming visible)
 *  - pageshow
 */
export function installEnvListeners(): void {
  if (installed) return;
  installed = true;

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      logEnv("resize");
    }, 250);
  });

  window.addEventListener("orientationchange", () => {
    // The viewport often hasn't settled when this event fires, so log
    // immediately AND after a short delay.
    logEnv("orient-immediate");
    setTimeout(() => logEnv("orient-settled"), 200);
  });

  if (screen.orientation && "addEventListener" in screen.orientation) {
    screen.orientation.addEventListener("change", () => {
      logEnv("orient-api-immediate");
      setTimeout(() => logEnv("orient-api-settled"), 200);
    });
  }

  document.addEventListener("fullscreenchange", () => {
    logEnv("fs-change-immediate");
    setTimeout(() => logEnv("fs-change-settled"), 100);
  });
  document.addEventListener(
    "webkitfullscreenchange" as "fullscreenchange",
    () => {
      logEnv("fs-change-webkit");
    },
  );

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      logEnv("visible");
    }
  });

  window.addEventListener("pageshow", () => {
    logEnv("pageshow");
  });

  // Also log when display-mode changes (PWA installed/uninstalled while open,
  // or fullscreen mode toggled — same media-query covers both).
  if (typeof matchMedia === "function") {
    const mm = matchMedia("(display-mode: fullscreen)");
    if (typeof mm.addEventListener === "function") {
      mm.addEventListener("change", () => logEnv("mqFs-change"));
    }
    const mm2 = matchMedia("(display-mode: standalone)");
    if (typeof mm2.addEventListener === "function") {
      mm2.addEventListener("change", () => logEnv("mqStd-change"));
    }
  }
}
