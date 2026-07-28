// Service Worker: caches the Stockfish engine request (whether it comes
// from the CDN or a local fallback file) so repeat visits load it
// instantly from disk instead of re-downloading it.
const CACHE_NAME = 'chess-pi-engine-cache-v2';

self.addEventListener('install', (event) => {
  // Nothing to precache up front — the engine is cached the first time it's
  // actually requested (see the fetch handler below). This keeps install
  // from failing even if there's no local stockfish.js fallback file.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Cache-first strategy, but only for requests related to the Stockfish
// engine (matches both the CDN URL and any local fallback file) —
// everything else is left alone so your normal site files always fetch
// fresh from the network as usual.
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('stockfish')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request, { mode: 'cors' }).then((response) => {
          // Only cache successful responses.
          if (response && response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        }).catch((err) => {
          console.error('SW: fetch failed for', url, err);
          throw err;
        });
      })
    );
  }
});
