/* built: 2026-08-24T15:56:39.894Z */
const CACHE_NAME = "callerbuddy-v1.0.4-704fb27a-dirty";
const PRECACHE_URLS = ["","index.html"];

/**
 * Do not skipWaiting() here. Taking over a live window and deleting the previous
 * cache (new CACHE_NAME on each version) leaves the old page fetching hashed
 * assets that no longer exist — the UI can hang until the window is closed.
 * The page posts "skipWaiting" when it is idle, then reloads on controllerchange.
 */
self.addEventListener("install", (event) => {
  const base = new URL("./", self.location).href;
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_URLS.map((url) => base + url))
    )
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (!event.request.url.startsWith(self.location.origin)) return;

  let pathname = "";
  try {
    pathname = new URL(event.request.url).pathname;
  } catch {
    return;
  }

  // Let the browser fetch the worker script itself (update checks).
  if (pathname.endsWith("/sw.js")) return;

  // Demo music is large and fetched on demand — do not intercept (avoids the
  // short network timeout and keeps install-time precache free of ~10MB assets).
  if (pathname.includes("/demo/")) return;

  // Navigation requests (HTML pages): network first with 1s timeout so we get
  // fresh content when online but don't hang long when offline.
  if (event.request.mode === "navigate") {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    event.respondWith(
      fetch(event.request, { signal: controller.signal })
        .then((response) => {
          clearTimeout(timeoutId);
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(async () => {
          clearTimeout(timeoutId);
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const shell =
            (await caches.match(new URL("./", self.location).href)) ||
            (await caches.match(new URL("./index.html", self.location).href));
          return (
            shell ||
            new Response("Offline", { status: 503, statusText: "Offline" })
          );
        })
    );
    return;
  }

  // Sub-resources (JS, CSS, images): cache-first with a 3s timeout on the
  // network fallback so we never hang when the radio is on but unreachable.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      return fetch(event.request, { signal: controller.signal })
        .then((response) => {
          clearTimeout(timeoutId);
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          clearTimeout(timeoutId);
          return new Response("", { status: 503, statusText: "Offline" });
        });
    })
  );
});
