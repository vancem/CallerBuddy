/**
 * Application entry point.
 *
 * Bootstraps the CallerBuddy singleton and mounts the root <app-shell>
 * component. The app-shell manages the tab-based UI.
 */

import { callerBuddy } from "./caller-buddy.js";
import "./components/app-shell.js";

// Initialize the CallerBuddy application
callerBuddy.init();

// Register service worker only in production (avoids caching issues in dev)
if (!import.meta.env.DEV && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + "sw.js", { updateViaCache: "none" })
      .then((registration) => {
        // When user returns to the tab, check for updates (helps mobile pick up new versions)
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") registration.update();
        });
      })
      .catch(() => {});
  });
}
