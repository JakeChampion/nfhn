// Service Worker for NFHN
const CACHE_NAME = 'nfhn-v1';
const STATIC_ASSETS = [
  '/styles.css',
  '/icon.svg',
  '/manifest.json'
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) return;

  // Static assets - cache first
  if (STATIC_ASSETS.some(asset => url.pathname === asset)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // HTML pages - network first with offline fallback
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Try cache, then offline page
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return new Response(
              `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Offline | NFHN</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 100px auto; text-align: center; padding: 1em; }
    h1 { margin-bottom: 0.5em; }
    a { color: #ff7a18; }
  </style>
</head>
<body>
  <h1>You're offline</h1>
  <p>Check your connection and <a href="">try again</a>.</p>
</body>
</html>`,
              { headers: { 'Content-Type': 'text/html' } }
            );
          });
        })
    );
    return;
  }
});
