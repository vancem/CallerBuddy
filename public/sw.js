/* built: 2026-04-09T03:00:03.787Z */
const CACHE_NAME = "callerbuddy-v0.1.0-pre.18-a23f0b4a-dirty";
const PRECACHE_URLS = ["","index.html"];

self.addEventListener("install", (event) => {
  const base = new URL("./", self.location).href;
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_URLS.map((url) => base + url))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (!event.request.url.startsWith(self.location.origin)) return;

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
        .catch(() => {
          clearTimeout(timeoutId);
          return caches.match(event.request);
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
