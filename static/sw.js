// Service Worker for NFHN
const CACHE_NAME = 'nfhn-__DEPLOY_ID__';
const SAVED_CACHE_NAME = 'nfhn-saved-v1';
const STATIC_ASSETS = [
  '/styles.css',
  '/icon.svg',
  '/manifest.json',
  '/saved'
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
          .filter((name) => name !== CACHE_NAME && name !== SAVED_CACHE_NAME)
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

  // Handle cross-origin requests for saved external content
  if (url.origin !== location.origin) {
    // Check if this is an external URL we might have cached
    event.respondWith(
      fetch(request).catch(() => {
        // If network fails, try to serve from saved cache
        return caches.open(SAVED_CACHE_NAME).then((cache) => {
          return cache.match(request);
        });
      })
    );
    return;
  }

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

  // Item pages - cache aggressively for saved stories
  if (url.pathname.startsWith('/item/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            // Cache in both regular and saved cache for better offline support
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone.clone()));
            caches.open(SAVED_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Try saved cache first, then regular cache
          return caches.open(SAVED_CACHE_NAME).then((cache) => {
            return cache.match(request).then((saved) => {
              if (saved) return saved;
              return caches.match(request).then((cached) => {
                if (cached) return cached;
                return offlineResponse();
              });
            });
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
            // If this is the saved page, serve it from cache
            if (url.pathname === '/saved') {
              return caches.match('/saved').then((savedPage) => {
                if (savedPage) return savedPage;
                return offlineResponse();
              });
            }
            return offlineResponse();
          });
        })
    );
    return;
  }
});

function offlineResponse() {
  return new Response(
    `<!DOCTYPE html>
<html lang="en" data-theme="auto">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Offline | NFHN</title>
  <link rel="icon" type="image/svg+xml" href="/icon.svg">
  <link rel="stylesheet" href="/styles.css">
  <script>
    (function() {
      const stored = localStorage.getItem('theme') || 'auto';
      document.documentElement.setAttribute('data-theme', stored);
    })();
  </script>
</head>
<body>
  <main id="main-content" aria-label="Main content">
    <div class="header-bar">
      <nav class="nav-feeds" aria-label="Primary">
        <a href="/top/1">Top</a>
        <a href="/newest/1">New</a>
        <a href="/ask/1">Ask</a>
        <a href="/show/1">Show</a>
        <a href="/jobs/1">Jobs</a>
        <a href="/saved">Saved</a>
      </nav>
    </div>
    <article class="offline-message">
      <h1>You're offline</h1>
      <p>It looks like you've lost your internet connection.</p>
      <p>You can still <a href="/saved">view your saved stories</a> while offline.</p>
      <p><a href="" class="more-link">Try again</a></p>
    </article>
  </main>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}

// Listen for messages from clients to cache specific item pages
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CACHE_ITEM') {
    const itemUrl = event.data.url;
    const externalUrl = event.data.externalUrl;
    
    caches.open(SAVED_CACHE_NAME).then((cache) => {
      // Cache the item page
      fetch(itemUrl).then((response) => {
        if (response.ok) {
          cache.put(itemUrl, response);
        }
      }).catch(() => {
        // Silently fail if offline
      });
      
      // Cache the external URL if it exists
      if (externalUrl) {
        fetch(externalUrl, { mode: 'no-cors' }).then((response) => {
          cache.put(externalUrl, response);
        }).catch(() => {
          // Silently fail - external site may block requests
        });
        
        // Cache the reader version (same-origin, so no special mode needed)
        const readerUrl = '/reader/' + externalUrl;
        fetch(readerUrl).then((response) => {
          if (response.ok) {
            cache.put(readerUrl, response);
          }
        }).catch(() => {
          // Silently fail if reader service unavailable
        });
      }
    });
  }
  
  if (event.data && event.data.type === 'UNCACHE_ITEM') {
    const itemUrl = event.data.url;
    const externalUrl = event.data.externalUrl;
    
    caches.open(SAVED_CACHE_NAME).then((cache) => {
      cache.delete(itemUrl);
      
      if (externalUrl) {
        cache.delete(externalUrl);
        cache.delete('/reader/' + externalUrl);
      }
    });
  }
});
