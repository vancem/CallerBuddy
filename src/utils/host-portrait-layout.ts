/**
 * Shared host-box portrait (stacked panes) detection for two-pane views.
 *
 * Prefer the component host's getBoundingClientRect() over viewport media queries —
 * viewport aspect MQs see bogus ~980×2053 on Samsung WebAPK while the shell is ~360 wide.
 * Pair with CSS `@container … (max-aspect-ratio: 6/5)` and `container-type: size`.
 */

import type { ReactiveController, ReactiveControllerHost } from "lit";

/** Stack side-by-side panes when host width/height is at or below this ratio. */
export const PORTRAIT_LAYOUT_ASPECT = 6 / 5;

/**
 * True when the host box is taller than wide enough to use stacked (portrait) layout.
 */
export function isHostPortraitLayout(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width >= 16 && r.height >= 16) {
    return r.width / r.height <= PORTRAIT_LAYOUT_ASPECT;
  }
  return window.matchMedia("(max-aspect-ratio: 6/5)").matches;
}

type HostLayoutHost = ReactiveControllerHost & Element;

/**
 * Observes the host element and calls requestUpdate() when its box size changes
 * (orientation, window resize). Needed so inline width/height styles stay in sync
 * with CSS container queries that flip on host aspect ratio.
 *
 * Optional `onResize` runs before requestUpdate (e.g. recompute CSS custom properties).
 */
export class HostLayoutResizeController implements ReactiveController {
  private host: HostLayoutHost;
  private onResize: (() => void) | undefined;
  private ro: ResizeObserver | null = null;

  constructor(host: HostLayoutHost, onResize?: () => void) {
    this.host = host;
    this.onResize = onResize;
    host.addController(this);
  }

  hostConnected() {
    this.ro = new ResizeObserver(() => {
      this.onResize?.();
      this.host.requestUpdate();
    });
    this.ro.observe(this.host);
  }

  hostDisconnected() {
    this.ro?.disconnect();
    this.ro = null;
  }
}
