// Service Worker for NFHN
const DEPLOY_ID = "__DEPLOY_ID__";
const CACHE_NAME = "nfhn1-" + DEPLOY_ID;
const SAVED_CACHE_NAME = "nfhn-saved-v1";
const STATIC_ASSETS = [
  "/styles.css",
  "/icon.svg",
  "/manifest.json",
  "/app.js",
  "/offline.html",
  "/saved",
];

// Assets the pages request with `?v=<deploy id>`.
//
// Those two are served `immutable` for a year so they can be used as compression
// dictionaries, which is only safe because the URL changes every deploy - see
// netlify/edge-functions/asset.ts. The precache has to store them under the *same*
// URL the pages ask for, or the entry is there and never found: `caches.match`
// keys on the full URL, query included.
const VERSIONED_ASSETS = ["/styles.css", "/app.js"];

// The URL to precache a given asset under, and the one the pages request.
function assetUrl(path) {
  return VERSIONED_ASSETS.includes(path) ? path + "?v=" + DEPLOY_ID : path;
}

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
    // One route per asset, not one alternation over all of them. `addRoutes`
    // rejects any pattern containing a regexp group, and `(a|b|c)` is one - so
    // the single combined route threw, and because addRoutes takes the whole
    // array at once it took the network-only routes below down with it. Every
    // request had been booting the worker regardless.
    ...assets.map((asset) => ({
      condition: { urlPattern: new URLPattern({ pathname: asset }), requestMethod: "GET" },
      source: { cacheName: CACHE_NAME },
    })),
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
      // addRoutes rejects a promise rather than throwing, so the try/catch on
      // its own caught nothing - the failure surfaced only as an unhandled
      // rejection in the console. A browser that refuses these conditions
      // should fall through to the fetch handler, not fail the install.
      event.addRoutes(staticRoutes())?.catch?.(() => {});
    } catch (_err) {
      // Synchronous rejection, same handling.
    }
  }

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS.map(assetUrl));
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
        if (cached) return cached;
        // Same asset, different `?v=`. Two ways to get here: an unversioned
        // reference (offline.html links plain /styles.css), or a deploy id that
        // differs from the one the pages ask for. The search-insensitive lookup is
        // scoped to *this* deploy's cache, which holds exactly one version of each
        // asset - widening it to caches.match would risk answering with the
        // previous deploy's copy in the window before activate() prunes it.
        return caches.open(CACHE_NAME)
          .then((cache) => cache.match(request, { ignoreSearch: true }))
          .then((sameAsset) =>
            sameAsset || fetch(request).then((response) => {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
              return response;
            })
          );
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

// --- Saving a thread for offline, properly ---
//
// The CACHE_ITEM message handler above already fetches an item page, the
// article and the reader version into the saved cache. Its weakness is that it
// is an ordinary fetch started from a message handler: nothing holds the worker
// alive, so a slow article on a slow connection can be killed halfway, and the
// reader gets no indication either way.
//
// Background Fetch is the API for exactly this. The browser owns the download:
// it survives the page closing and the browser restarting, it shows OS-level
// progress, and it hands the whole set of responses back here when it is done.
// A saved story then actually is saved, rather than probably saved.
//
// It is Chrome-only, so the message handler stays as the fallback. Which path
// ran is invisible to the reader except in the good case.
//
// See docs/api-proposals/18-pwa-integration-surface.md

const BACKGROUND_FETCH_PREFIX = "save-item-";

/** Move a completed background fetch's responses into the saved cache. */
async function storeFetchedRecords(registration) {
  const cache = await caches.open(SAVED_CACHE_NAME);
  const records = await registration.matchAll();

  for (const record of records) {
    try {
      const response = await record.responseReady;
      // An opaque response (the article, fetched no-cors) has status 0 and is
      // still worth storing - it renders. A 404 is not.
      if (response.status === 0 || response.ok) {
        await cache.put(record.request, response);
      }
    } catch {
      // One failed part of a set should not lose the rest of it.
    }
  }
}

self.addEventListener("backgroundfetchsuccess", (event) => {
  event.waitUntil((async () => {
    await storeFetchedRecords(event.registration);
    // The OS notification stops saying "downloading" and becomes something the
    // reader can tap to get to what they saved.
    await event.updateUI?.({ title: "Saved for offline" });
  })());
});

self.addEventListener("backgroundfetchfail", (event) => {
  // Partial is better than nothing: whatever did arrive is still readable
  // offline, and the item page is the first request in the set.
  event.waitUntil(storeFetchedRecords(event.registration));
});

self.addEventListener("backgroundfetchclick", (event) => {
  const target = event.registration.id.startsWith(BACKGROUND_FETCH_PREFIX)
    ? "/item/" + event.registration.id.slice(BACKGROUND_FETCH_PREFIX.length)
    : "/saved";
  event.waitUntil(clients.openWindow(target));
});

// --- Keeping saved threads current ---
//
// Saved stories are the one thing on this site with a reason to be updated
// while nobody is looking at them: a thread you saved this morning has more
// comments by the evening, and finding that out currently means opening it.
//
// Periodic Background Sync gives an installed app a slot to do that work, and
// the Badging API is where the answer goes - a count on the app icon, which is
// the only ambient surface a web app has.
//
// The saved list lives in localStorage, which a service worker cannot read, so
// the page mirrors it into the cache under SAVED_INDEX_URL whenever it changes.
// A synthetic URL rather than IndexedDB because the cache is already open here
// and the value is a single small document.

const SAVED_INDEX_URL = "/__nfhn/saved-index";
const PERIODIC_SYNC_TAG = "refresh-saved";

async function readSavedIndex() {
  try {
    const cache = await caches.open(SAVED_CACHE_NAME);
    const response = await cache.match(SAVED_INDEX_URL);
    if (!response) return {};
    const parsed = await response.json();
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeSavedIndex(index) {
  try {
    const cache = await caches.open(SAVED_CACHE_NAME);
    await cache.put(
      SAVED_INDEX_URL,
      new Response(JSON.stringify(index), {
        headers: { "content-type": "application/json" },
      }),
    );
  } catch {
    // Storage pressure. Next refresh re-reads whatever survived.
  }
}

/**
 * Re-fetch every saved thread, record what it found, and badge the unread ones.
 *
 * The count is threads with new comments, not new comments - a badge saying "3"
 * that means three conversations worth returning to is actionable, and one
 * saying "147" is wallpaper.
 *
 * `seen` is only ever written by the page, when the reader opens the thread.
 * This writes `latest`. Keeping the two apart is what lets the badge survive a
 * refresh without ever outliving the reader actually catching up.
 */
async function refreshSavedStories() {
  const index = await readSavedIndex();
  const ids = Object.keys(index);
  if (!ids.length) return;

  const cache = await caches.open(SAVED_CACHE_NAME);

  for (const id of ids) {
    const itemUrl = "/item/" + id;
    try {
      const response = await fetch(itemUrl);
      if (!response.ok) continue;

      const clone = response.clone();
      await cache.put(itemUrl, response);

      // The page carries its own comment count for the live-updates banner,
      // which makes it readable here without a second API call.
      const match = (await clone.text()).match(/data-comments="(\d+)"/);
      if (!match) continue;
      index[id] = {
        seen: index[id]?.seen ?? 0,
        latest: Math.max(Number(match[1]), index[id]?.latest ?? 0),
      };
    } catch {
      // Offline, or the item is gone. Either way the saved copy stands.
    }
  }

  await writeSavedIndex(index);

  try {
    const unread = Object.values(index)
      .filter((entry) => (entry?.latest ?? 0) > (entry?.seen ?? 0)).length;
    if (unread > 0) await self.navigator.setAppBadge(unread);
    else await self.navigator.clearAppBadge();
  } catch {
    // Not installed, or badging unsupported. The cache refresh still happened,
    // which is the half of this that works everywhere.
  }
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === PERIODIC_SYNC_TAG) event.waitUntil(refreshSavedStories());
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
