/**
 * Shared device heuristics (touch, phone-class size) for UX gates such as
 * optional Fullscreen API prompts — see app-shell and caller-buddy.
 */

/** True when Fullscreen API is engaged (not manifest display-mode alone). */
export function isFullscreenApiActive(): boolean {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  return !!(document.fullscreenElement ?? doc.webkitFullscreenElement);
}

/**
 * Coarse-pointer device with a phone-class short edge — space is at a premium,
 * optional fullscreen before the playlist editor is appropriate.
 */
export function isPhoneLikeTouchDevice(): boolean {
  const touch =
    window.matchMedia("(pointer: coarse)").matches ||
    (navigator.maxTouchPoints ?? 0) > 0;
  if (!touch) return false;
  const shortEdge = Math.min(screen.width, screen.height);
  return shortEdge <= 768;
}
