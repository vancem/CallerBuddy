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

  // Navigation requests (HTML pages): always try network first so the browser
  // never gets stuck on a stale cached index.html referencing old asset hashes.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
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
