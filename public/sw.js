const CACHE_NAME = "callerbuddy-v0.1.0-pre.9";

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
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached ?? fetch(event.request);
      })
    );
  }
});
