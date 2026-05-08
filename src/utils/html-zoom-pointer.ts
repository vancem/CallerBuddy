/**
 * Pointer `clientX`/`clientY` **deltas** on Samsung WebAPK can overshoot when
 * `main.ts` applies `html.cb-layout-zoom` — use this when mapping drag distance
 * to layout px panel sizes (`PanelResizeController`, etc.).
 */
export function scalePointerDeltaForHtmlZoom(delta: number): number {
  const html = document.documentElement;
  if (!html.classList.contains("cb-layout-zoom")) return delta;
  const z = parseFloat(html.style.zoom || "1");
  if (!Number.isFinite(z) || z <= 1) return delta;
  return delta / z;
}
