/* built: __BUILD_TIME__ */
const CACHE_NAME = "__CACHE_NAME__";

self.addEventListener("install", (event) => {
  const base = new URL("./", self.location).href;
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([base, base + "index.html"]))
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

  // Sub-resources (JS, CSS, images): cache-first for speed.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached ?? fetch(event.request);
    })
  );
});
