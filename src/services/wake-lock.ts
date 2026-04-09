/**
 * Screen Wake Lock service.
 *
 * Prevents the device screen from dimming or locking while audio is playing.
 * Uses the Screen Wake Lock API (https://w3c.github.io/screen-wake-lock/)
 * with graceful degradation on unsupported browsers.
 *
 * The browser automatically releases the wake lock when the page becomes
 * hidden (e.g. tab switch or screen-off on platforms that still fire
 * visibilitychange). A `visibilitychange` listener re-acquires the lock
 * when the page becomes visible again, provided `release()` has not been
 * called explicitly.
 */

import { log } from "./logger.js";

export class WakeLockService {
  private sentinel: WakeLockSentinel | null = null;

  /** True while the caller intends the lock to be held. */
  private wanted = false;

  private readonly onVisibilityChange = () => {
    if (document.visibilityState === "visible" && this.wanted) {
      void this.acquireInternal();
    }
  };

  private listenerRegistered = false;

  async acquire(): Promise<void> {
    this.wanted = true;
    if (!this.listenerRegistered) {
      document.addEventListener("visibilitychange", this.onVisibilityChange);
      this.listenerRegistered = true;
    }
    await this.acquireInternal();
  }

  async release(): Promise<void> {
    this.wanted = false;
    if (this.sentinel) {
      try {
        await this.sentinel.release();
        log.debug("Wake lock released");
      } catch {
        /* sentinel may already be released by the browser */
      }
      this.sentinel = null;
    }
  }

  dispose(): void {
    this.wanted = false;
    if (this.listenerRegistered) {
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
      this.listenerRegistered = false;
    }
    if (this.sentinel) {
      this.sentinel.release().catch(() => {});
      this.sentinel = null;
    }
  }

  // -------------------------------------------------------------------------

  private async acquireInternal(): Promise<void> {
    if (!("wakeLock" in navigator)) {
      log.debug("Wake Lock API not supported");
      return;
    }
    if (this.sentinel) return;
    try {
      this.sentinel = await navigator.wakeLock.request("screen");
      this.sentinel.addEventListener("release", () => {
        this.sentinel = null;
      });
      log.debug("Wake lock acquired");
    } catch (err) {
      log.warn("Wake lock request failed:", err);
    }
  }
}
