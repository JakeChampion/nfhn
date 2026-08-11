// Service Worker for NFHN
const CACHE_NAME = "nfhn1-__DEPLOY_ID__";
const SAVED_CACHE_NAME = "nfhn-saved-v1";
const STATIC_ASSETS = [
  "/styles.css",
  "/icon.svg",
  "/manifest.json",
  "/app.js",
  "/offline.html",
  "/saved",
];

// Static routes, applied by the browser *before* the service worker starts.
//
// Without these, every request for /styles.css or /app.js has to boot the
// worker - spin up the thread, evaluate this script, run the fetch handler -
// only to be told "serve it from the cache". Static routing lets the browser
// make that decision itself, so the worker never starts.
//
// The cache-name route is safe here specifically because CACHE_NAME embeds the
// deploy id (nfhn1-__DEPLOY_ID__, stamped by scripts/build.ts): the cache name
// *is* the version, so there is no stale-asset risk from bypassing the
// revalidation logic in the fetch handler. If that ever stops being true, this
// route has to go.
//
// See docs/api-proposals/16-service-worker-routing.md
function staticRoutes() {
  const assets = STATIC_ASSETS.filter((path) => path !== "/saved");
  return [
    {
      condition: {
        urlPattern: new URLPattern({ pathname: `(${assets.join("|")})` }),
        requestMethod: "GET",
      },
      source: { cacheName: CACHE_NAME },
    },
    {
      // Reader mode is always network. The fetch handler already knows this;
      // declaring it here means the worker is not woken to find out.
      condition: { urlPattern: new URLPattern({ pathname: "/reader/*" }) },
      source: "network",
    },
    {
      // Same for the JSON and event-stream routes. The fetch handler falls
      // through for both already - neither is a static asset, an /item/ page,
      // or an Accept: text/html request - so all waking the worker achieves is
      // putting worker startup in front of them. That matters most for
      // /api/live/*, where the response is a connection held open for minutes:
      // there is nothing there for a cache to do.
      condition: { urlPattern: new URLPattern({ pathname: "/api/*" }) },
      source: "network",
    },
  ];
}

// Install - cache static assets
self.addEventListener("install", (event) => {
  if ("addRoutes" in event && typeof URLPattern !== "undefined") {
    try {
      event.addRoutes(staticRoutes());
    } catch (_err) {
      // A browser that has addRoutes but rejects these conditions should fall
      // through to the fetch handler, not fail the install.
    }
  }

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }),
  );
  self.skipWaiting();
});

// Cache lookup options for a same-origin page request.
// The edge functions send `No-Vary-Search: params, key-order` because no route
// reads query parameters, so an offline lookup for /top/1?utm_source=newsletter
// should still find the entry cached for /top/1. Reader URLs are exempt: the
// wrapped article URL carries its own query string, which does identify the
// article.
function pageCacheOptions(url) {
  return url.pathname.startsWith("/reader/") ? undefined : { ignoreSearch: true };
}

// Fetch - network first, fallback to cache
self.addEventListener("fetch", (event) => {
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
      }),
    );
    return;
  }

  // Static assets - cache first
  if (STATIC_ASSETS.some((asset) => url.pathname === asset)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      }),
    );
    return;
  }

  // Item pages - cache aggressively for saved stories
  if (url.pathname.startsWith("/item/")) {
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
          const options = pageCacheOptions(url);
          return caches.open(SAVED_CACHE_NAME).then((cache) => {
            return cache.match(request, options).then((saved) => {
              if (saved) return saved;
              return caches.match(request, options).then((cached) => {
                if (cached) return cached;
                return offlineResponse();
              });
            });
          });
        }),
    );
    return;
  }

  // HTML pages - network first with offline fallback
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      // Navigation preload starts the network request while the worker is still
      // booting, instead of serialising worker startup in front of the fetch.
      // event.preloadResponse is undefined for non-navigations and in browsers
      // without support, so the ?? falls back to a normal fetch.
      Promise.resolve(event.preloadResponse)
        .catch(() => undefined)
        .then((preloaded) => preloaded ?? fetch(request))
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
          return caches.match(request, pageCacheOptions(url)).then((cached) => {
            if (cached) return cached;
            // If this is the saved page, serve it from cache
            if (url.pathname === "/saved") {
              return caches.match("/saved").then((savedPage) => {
                if (savedPage) return savedPage;
                return offlineResponse();
              });
            }
            return offlineResponse();
          });
        }),
    );
    return;
  }
});

function offlineResponse() {
  // Try to serve the cached offline page first
  return caches.match("/offline.html").then((cached) => {
    if (cached) return cached;

    // Fallback inline offline page if offline.html isn't cached
    return new Response(
      `<!DOCTYPE html>
<html lang="en" data-theme="auto">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Offline | NFHN</title>
  <link rel="icon" type="image/svg+xml" href="/icon.svg">
  <link rel="stylesheet" href="/styles.css">
  <script>document.documentElement.setAttribute('data-theme',localStorage.getItem('theme')||'auto');</script>
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
    <div style="max-width:600px;margin:2rem auto;padding:1rem;text-align:center">
      <h1>You're offline</h1>
      <p>It looks like you've lost your internet connection.</p>
      <p>You can still <a href="/saved">view your saved stories</a> while offline.</p>
      <p><a href="" onclick="location.reload();return false">Try again</a></p>
    </div>
  </main>
</body>
</html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  });
}

// Listen for messages from clients to cache specific item pages
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CACHE_ITEM") {
    const itemUrl = event.data.url;
    const externalUrl = event.data.externalUrl;

    caches.open(SAVED_CACHE_NAME).then((cache) => {
      // Cache the item page
      fetch(itemUrl).then((response) => {
        if (response.ok) {
          cache.put(itemUrl, response);
        }
      }).catch(() => {
        // Silently fail if offline - queue for background sync
        queueCacheAction("cache", itemUrl, externalUrl);
      });

      // Cache the external URL if it exists
      if (externalUrl) {
        fetch(externalUrl, { mode: "no-cors" }).then((response) => {
          cache.put(externalUrl, response);
        }).catch(() => {
          // Silently fail - external site may block requests
        });

        // Cache the reader version (same-origin, so no special mode needed)
        const readerUrl = "/reader/" + externalUrl;
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

  if (event.data && event.data.type === "UNCACHE_ITEM") {
    const itemUrl = event.data.url;
    const externalUrl = event.data.externalUrl;

    caches.open(SAVED_CACHE_NAME).then((cache) => {
      cache.delete(itemUrl);

      if (externalUrl) {
        cache.delete(externalUrl);
        cache.delete("/reader/" + externalUrl);
      }
    });
  }
});

// --- Background Sync Support ---
// Queue actions for when connectivity is restored

const SYNC_QUEUE_NAME = "nfhn-sync-queue";

// Store pending actions in IndexedDB for persistence
function openSyncDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("nfhn-sync", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("queue")) {
        db.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
      }
    };
  });
}

async function queueCacheAction(action, itemUrl, externalUrl) {
  try {
    const db = await openSyncDB();
    const tx = db.transaction("queue", "readwrite");
    const store = tx.objectStore("queue");
    store.add({
      action,
      itemUrl,
      externalUrl,
      timestamp: Date.now(),
    });

    // Request background sync if available
    if ("sync" in self.registration) {
      await self.registration.sync.register("cache-items");
    }
  } catch (e) {
    console.error("Failed to queue cache action:", e);
  }
}

async function processQueuedActions() {
  try {
    const db = await openSyncDB();
    const tx = db.transaction("queue", "readwrite");
    const store = tx.objectStore("queue");
    const queue = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const cache = await caches.open(SAVED_CACHE_NAME);

    for (const item of queue) {
      try {
        if (item.action === "cache") {
          const response = await fetch(item.itemUrl);
          if (response.ok) {
            await cache.put(item.itemUrl, response);
          }

          if (item.externalUrl) {
            try {
              const extResponse = await fetch(item.externalUrl, { mode: "no-cors" });
              await cache.put(item.externalUrl, extResponse);
            } catch {
              // External URL may be blocked
            }

            try {
              const readerResponse = await fetch("/reader/" + item.externalUrl);
              if (readerResponse.ok) {
                await cache.put("/reader/" + item.externalUrl, readerResponse);
              }
            } catch {
              // Reader service may be unavailable
            }
          }
        }

        // Remove processed item from queue
        store.delete(item.id);
      } catch (e) {
        console.error("Failed to process queued action:", e);
        // Keep in queue for retry
      }
    }
  } catch (e) {
    console.error("Failed to process sync queue:", e);
  }
}

// Handle background sync event
self.addEventListener("sync", (event) => {
  if (event.tag === "cache-items") {
    event.waitUntil(processQueuedActions());
  }
});

// Also process queue when service worker activates (user comes back)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      // Start the network request for navigations while this worker is still
      // booting, rather than after. One call, and it removes worker startup
      // from the critical path of every cache-missing navigation.
      self.registration.navigationPreload
        ? self.registration.navigationPreload.enable().catch(() => {})
        : Promise.resolve(),
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== SAVED_CACHE_NAME)
            .map((name) => caches.delete(name)),
        );
      }),
      // Process any queued actions
      processQueuedActions(),
    ]),
  );
  self.clients.claim();
});
