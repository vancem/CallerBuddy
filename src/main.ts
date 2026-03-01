/**
 * Application entry point.
 *
 * Bootstraps the CallerBuddy singleton and mounts the root <app-shell>
 * component. The app-shell manages the tab-based UI.
 */

import { polyfill as mobileDragDropPolyfill } from "mobile-drag-drop";

// Enable HTML5 drag-and-drop on touch devices (Android, iOS). Without this,
// drop events often don't fire on Android when dragging songs to the playlist.
mobileDragDropPolyfill({
  // Slight delay before drag starts — helps distinguish scroll from drag on touch
  holdToDrag: 300,
});

import { callerBuddy } from "./caller-buddy.js";
import "./components/app-shell.js";

// #region agent log
fetch('http://127.0.0.1:7242/ingest/0cdf7510-7efc-4442-ba7b-a97899c3747e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e72d3c'},body:JSON.stringify({sessionId:'e72d3c',location:'main.ts:startup',message:'App main.ts executing - polyfill loaded, about to init',data:{timestamp:Date.now()},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
// #endregion

// Initialize the CallerBuddy application
callerBuddy.init();

// Register service worker only in production (avoids caching issues in dev)
if (!import.meta.env.DEV && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {});
  });
}
