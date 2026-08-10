# Service Worker Static Routing API + navigation preload

**Status:** Proposed · **Browser support:** `addRoutes()` Chromium 123+ (Firefox positive, WebKit no
signal); navigation preload Baseline · **Impact:** Medium · **Effort:** Low

Two service-worker optimisations that NFHN's existing `sw.js` is set up for but does not use.

## 1. Stop waking the service worker for static assets

`static/sw.js` registers a `fetch` listener that handles everything:

```js
self.addEventListener("fetch", (event) => { … });
```

Every request for `/styles.css`, `/app.js`, `/icon.svg` and `/hyphens_en-us.js` therefore has to
**start the service worker** — spin up the worker thread, evaluate the script, run the handler — just
to be told "serve it from the cache". On a cold start that is tens of milliseconds of pure overhead
in front of a resource the browser could have fetched from cache directly.

`InstallEvent.addRoutes()` declares those decisions up front, so the browser applies them without
ever booting the worker:

```js
self.addEventListener("install", (event) => {
  event.addRoutes([
    {
      // Precached, immutable assets: straight from the cache, worker never starts
      condition: {
        urlPattern: new URLPattern({ pathname: "/(styles.css|app.js|icon.svg|justify.js|hyphens_en-us.js)" }),
        requestMethod: "GET",
      },
      source: { cacheName: CACHE_NAME },
    },
    {
      // Reader mode is always network — no reason to wake the worker to discover that
      condition: { urlPattern: new URLPattern({ pathname: "/reader/*" }) },
      source: "network",
    },
  ]);

  event.waitUntil(/* existing precache logic */);
});
```

The `STATIC_ASSETS` array at the top of `sw.js` already enumerates exactly the right list, so the
first route can be generated from it rather than duplicated.

The second route encodes a rule `pageCacheOptions()` already knows — `/reader/*` is exempt from the
page cache — and moves it from "decided in JS after starting the worker" to "decided by the browser
before starting it".

## 2. Turn on navigation preload

`sw.js` never calls `navigationPreload.enable()`. Without it, a navigation to `/top/1` waits for the
worker to boot *before* the network request starts — the boot time is serialised in front of the
fetch, even though the fetch will happen regardless.

```js
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    // existing cache-cleanup logic
  })());
});
```

Then use the preloaded response in the fetch handler instead of issuing a fresh one:

```js
const preloaded = await event.preloadResponse;
const response = preloaded ?? await fetch(event.request);
```

This is a handful of lines and it removes worker startup from the critical path of every navigation
that misses the cache.

## Why the ordering matters for this site

NFHN's whole performance posture is speculative: `prerender: moderate` over every internal link,
No-Vary-Search so decorated URLs still hit, cross-document View Transitions to hide the seam. All of
that assumes the navigation itself is cheap. A service worker that has to cold-start before it can
say "here is the cached CSS" is a fixed tax sitting underneath all of it, and it is invisible in
local testing where the worker is always already warm.

## Caveats

- **`addRoutes()` is Chromium-only for now.** It is additive — a browser that does not support it
  falls through to the existing `fetch` handler, which is the current behaviour. Guard with
  `if ("addRoutes" in event)`.
- **Cache-name routes bypass the handler entirely.** A route pointing at `CACHE_NAME` will serve a
  stale asset with no revalidation logic, because the worker never runs. That is safe here only
  because `CACHE_NAME` is `nfhn1-__DEPLOY_ID__` and `scripts/build.ts` stamps a new deploy id per
  build — the cache name itself is the version. Worth a comment in `sw.js` saying so, since the route
  silently depends on it.
- **Test the interaction with the offline fallback.** `offlineResponse()` and the `/reader/*` network
  route need to agree about what happens with no connectivity.

## Sources

- [`InstallEvent.addRoutes()` on MDN](https://developer.mozilla.org/en-US/docs/Web/API/InstallEvent/addRoutes)
- [Use the Service Worker Static Routing API | Chrome for Developers](https://developer.chrome.com/blog/service-worker-static-routing)
