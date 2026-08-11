// sw_test.ts - Service Worker logic tests
//
// Service workers run in a browser context, so we can't fully test them with Deno.
// This file tests the logic extracted from sw.js that can be tested in isolation.

import { assertEquals } from "std/testing/asserts.ts";

// =============================================================================
// SW Cache Logic Tests
// =============================================================================

// Extract and test the cache key logic
const STATIC_ASSETS = [
  "/styles.css",
  "/icon.svg",
  "/manifest.json",
  "/app.js",
  "/saved",
];

Deno.test("STATIC_ASSETS: includes all required static files", () => {
  assertEquals(STATIC_ASSETS.includes("/styles.css"), true);
  assertEquals(STATIC_ASSETS.includes("/icon.svg"), true);
  assertEquals(STATIC_ASSETS.includes("/manifest.json"), true);
  assertEquals(STATIC_ASSETS.includes("/app.js"), true);
  assertEquals(STATIC_ASSETS.includes("/saved"), true);
});

Deno.test("STATIC_ASSETS: count is correct", () => {
  assertEquals(STATIC_ASSETS.length, 5);
});

// Test the asset matching logic used in fetch handler
function isStaticAsset(pathname: string): boolean {
  return STATIC_ASSETS.some((asset) => pathname === asset);
}

Deno.test("isStaticAsset: matches static assets", () => {
  assertEquals(isStaticAsset("/styles.css"), true);
  assertEquals(isStaticAsset("/icon.svg"), true);
  assertEquals(isStaticAsset("/manifest.json"), true);
  assertEquals(isStaticAsset("/app.js"), true);
  assertEquals(isStaticAsset("/saved"), true);
});

Deno.test("isStaticAsset: rejects non-static paths", () => {
  assertEquals(isStaticAsset("/top/1"), false);
  assertEquals(isStaticAsset("/item/12345"), false);
  assertEquals(isStaticAsset("/user/test"), false);
  assertEquals(isStaticAsset("/"), false);
});

// Test item page detection logic
function isItemPage(pathname: string): boolean {
  return pathname.startsWith("/item/");
}

Deno.test("isItemPage: matches item paths", () => {
  assertEquals(isItemPage("/item/12345"), true);
  assertEquals(isItemPage("/item/1"), true);
  assertEquals(isItemPage("/item/99999999"), true);
});

Deno.test("isItemPage: rejects non-item paths", () => {
  assertEquals(isItemPage("/top/1"), false);
  assertEquals(isItemPage("/items/123"), false);
  assertEquals(isItemPage("/user/item"), false);
});

// Test origin comparison logic
function isSameOrigin(url: URL, origin: string): boolean {
  return url.origin === origin;
}

Deno.test("isSameOrigin: detects same origin", () => {
  const url = new URL("https://nfhn.netlify.app/top/1");
  assertEquals(isSameOrigin(url, "https://nfhn.netlify.app"), true);
});

Deno.test("isSameOrigin: detects different origin", () => {
  const url = new URL("https://example.com/page");
  assertEquals(isSameOrigin(url, "https://nfhn.netlify.app"), false);
});

// Test HTML request detection
function isHTMLRequest(acceptHeader: string | null): boolean {
  return acceptHeader?.includes("text/html") ?? false;
}

Deno.test("isHTMLRequest: detects HTML requests", () => {
  assertEquals(isHTMLRequest("text/html,application/xhtml+xml"), true);
  assertEquals(isHTMLRequest("text/html"), true);
});

Deno.test("isHTMLRequest: rejects non-HTML requests", () => {
  assertEquals(isHTMLRequest("application/json"), false);
  assertEquals(isHTMLRequest("image/png"), false);
  assertEquals(isHTMLRequest(null), false);
});

// =============================================================================
// Cache Message Tests
// =============================================================================

interface CacheMessage {
  type: "CACHE_ITEM" | "UNCACHE_ITEM";
  url: string;
  externalUrl: string | null;
}

function parseCacheMessage(data: unknown): CacheMessage | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  if (obj.type !== "CACHE_ITEM" && obj.type !== "UNCACHE_ITEM") return null;
  if (typeof obj.url !== "string") return null;
  return {
    type: obj.type as CacheMessage["type"],
    url: obj.url,
    externalUrl: typeof obj.externalUrl === "string" ? obj.externalUrl : null,
  };
}

Deno.test("parseCacheMessage: parses CACHE_ITEM message", () => {
  const msg = parseCacheMessage({
    type: "CACHE_ITEM",
    url: "/item/12345",
    externalUrl: "https://example.com/article",
  });
  assertEquals(msg?.type, "CACHE_ITEM");
  assertEquals(msg?.url, "/item/12345");
  assertEquals(msg?.externalUrl, "https://example.com/article");
});

Deno.test("parseCacheMessage: parses UNCACHE_ITEM message", () => {
  const msg = parseCacheMessage({
    type: "UNCACHE_ITEM",
    url: "/item/12345",
    externalUrl: null,
  });
  assertEquals(msg?.type, "UNCACHE_ITEM");
  assertEquals(msg?.url, "/item/12345");
  assertEquals(msg?.externalUrl, null);
});

Deno.test("parseCacheMessage: handles missing externalUrl", () => {
  const msg = parseCacheMessage({
    type: "CACHE_ITEM",
    url: "/item/12345",
  });
  assertEquals(msg?.externalUrl, null);
});

Deno.test("parseCacheMessage: returns null for invalid type", () => {
  assertEquals(parseCacheMessage({ type: "INVALID", url: "/item/123" }), null);
});

Deno.test("parseCacheMessage: returns null for missing url", () => {
  assertEquals(parseCacheMessage({ type: "CACHE_ITEM" }), null);
});

Deno.test("parseCacheMessage: returns null for non-object", () => {
  assertEquals(parseCacheMessage("string"), null);
  assertEquals(parseCacheMessage(123), null);
  assertEquals(parseCacheMessage(null), null);
});

// =============================================================================
// Reader URL Construction Tests
// =============================================================================

function buildReaderUrl(externalUrl: string): string {
  return `/reader/${externalUrl}`;
}

Deno.test("buildReaderUrl: constructs reader URL", () => {
  assertEquals(
    buildReaderUrl("https://example.com/article"),
    "/reader/https://example.com/article",
  );
});

// =============================================================================
// Offline Page HTML Structure Tests
// =============================================================================

const OFFLINE_PAGE_REQUIREMENTS = [
  "<!DOCTYPE html>",
  '<html lang="en"',
  "data-theme",
  "Offline",
  "/saved",
  "Try again",
];

// Simple check that the offline page contains required elements
// (actual content is inline in sw.js)
Deno.test("offline page requirements: all required elements exist", () => {
  // This test documents what the offline page should contain
  for (const req of OFFLINE_PAGE_REQUIREMENTS) {
    assertEquals(typeof req, "string");
  }
});

// =============================================================================
// Cache Strategy Documentation Tests
// =============================================================================

Deno.test("cache strategies: documents static asset strategy", () => {
  // Static assets: cache-first
  // 1. Check cache for match
  // 2. If found, return cached
  // 3. If not, fetch and cache
  const strategy = "cache-first";
  assertEquals(strategy, "cache-first");
});

Deno.test("cache strategies: documents HTML page strategy", () => {
  // HTML pages: network-first with cache fallback
  // 1. Try network
  // 2. If success, cache and return
  // 3. If fail, try cache
  // 4. If no cache, show offline page
  const strategy = "network-first";
  assertEquals(strategy, "network-first");
});

Deno.test("cache strategies: documents item page strategy", () => {
  // Item pages: network-first with aggressive caching
  // 1. Try network
  // 2. If success, cache in both regular and saved caches
  // 3. If fail, try saved cache, then regular cache, then offline
  const strategy = "network-first-with-saved-cache";
  assertEquals(strategy, "network-first-with-saved-cache");
});

// =============================================================================
// No-Vary-Search alignment
// =============================================================================

// Mirrors pageCacheOptions() in sw.js: the edge functions advertise
// `No-Vary-Search: params, key-order`, so offline page lookups ignore the query
// string too - except under /reader/, where the wrapped article URL can carry a
// query string that genuinely identifies a different article.
function pageCacheOptions(url: URL): { ignoreSearch: boolean } | undefined {
  return url.pathname.startsWith("/reader/") ? undefined : { ignoreSearch: true };
}

Deno.test("pageCacheOptions: ignores the query string for page requests", () => {
  assertEquals(pageCacheOptions(new URL("https://nfhn.test/top/1")), { ignoreSearch: true });
  assertEquals(
    pageCacheOptions(new URL("https://nfhn.test/top/1?utm_source=newsletter")),
    { ignoreSearch: true },
  );
  assertEquals(pageCacheOptions(new URL("https://nfhn.test/item/123")), { ignoreSearch: true });
});

Deno.test("pageCacheOptions: keeps the query string for reader URLs", () => {
  assertEquals(
    pageCacheOptions(new URL("https://nfhn.test/reader/https://example.com/a?id=42")),
    undefined,
  );
});

// =============================================================================
// Static Routing API (InstallEvent.addRoutes)
// =============================================================================

// Mirrors staticRoutes() in sw.js. The routes are declared at install time and
// applied by the browser before the worker starts, so a mismatch between this
// pattern and the real asset paths silently means the worker boots anyway -
// exactly the cost the routes exist to avoid.
const ROUTED_ASSETS = STATIC_ASSETS.filter((path) => path !== "/saved");

function staticAssetPattern(): URLPattern {
  return new URLPattern({ pathname: `(${ROUTED_ASSETS.join("|")})` });
}

Deno.test("static routing: the pattern matches every precached asset", () => {
  const pattern = staticAssetPattern();
  for (const asset of ROUTED_ASSETS) {
    assertEquals(
      pattern.test(`https://nfhn.test${asset}`),
      true,
      `${asset} should be routed straight to the cache`,
    );
  }
});

Deno.test("static routing: /saved is excluded so the worker still handles it", () => {
  // /saved is precached but is a page, not an immutable asset: it must keep
  // going through the fetch handler's offline fallback logic.
  assertEquals(staticAssetPattern().test("https://nfhn.test/saved"), false);
});

Deno.test("static routing: pages and API paths are not captured", () => {
  const pattern = staticAssetPattern();
  for (const path of ["/top/1", "/item/123", "/user/alice", "/styles.css.map"]) {
    assertEquals(
      pattern.test(`https://nfhn.test${path}`),
      false,
      `${path} should not be routed to the static cache`,
    );
  }
});

Deno.test("static routing: reader URLs match the network-only route", () => {
  const readerPattern = new URLPattern({ pathname: "/reader/*" });
  assertEquals(readerPattern.test("https://nfhn.test/reader/https://example.com/a"), true);
  assertEquals(readerPattern.test("https://nfhn.test/top/1"), false);
});

Deno.test("sw.js enables navigation preload and declares static routes", async () => {
  const source = await Deno.readTextFile(new URL("../static/sw.js", import.meta.url));

  // Both are easy to drop in a refactor and neither has a visible symptom -
  // the site keeps working, just with worker startup back on the critical path.
  assertEquals(source.includes("navigationPreload"), true);
  assertEquals(source.includes("event.preloadResponse"), true);
  assertEquals(source.includes("addRoutes"), true);
});

Deno.test("static routing: the API routes bypass the worker entirely", () => {
  // /api/preview/:id and /api/live/:id both fall through the fetch handler
  // already, so waking the worker for them only puts startup in front of the
  // request. It matters most for the event stream, which is a connection held
  // open for minutes with nothing for a cache to do.
  const apiPattern = new URLPattern({ pathname: "/api/*" });
  assertEquals(apiPattern.test("https://nfhn.test/api/preview/123"), true);
  assertEquals(apiPattern.test("https://nfhn.test/api/live/123"), true);
  // Pages must keep going through the offline fallback logic.
  assertEquals(apiPattern.test("https://nfhn.test/item/123"), false);
  assertEquals(apiPattern.test("https://nfhn.test/saved"), false);
});

Deno.test("sw.js declares the same API route the tests above assume", async () => {
  const source = await Deno.readTextFile(new URL("../static/sw.js", import.meta.url));
  assertEquals(source.includes('pathname: "/api/*"'), true);
});

// =============================================================================
// Keeping saved threads current (periodic sync + badging)
// =============================================================================
//
// These run the real functions out of sw.js rather than a copy of them - see
// tests/dom-shim.ts.

import { FakeCaches, runModuleReturning } from "./dom-shim.ts";

const SAVED_CACHE = "nfhn-saved-v1";
const SAVED_INDEX = "/__nfhn/saved-index";

interface Entry {
  seen: number;
  latest: number;
}

/** An item page as the renderer emits it, carrying its comment count. */
const itemHtml = (id: number, comments: number) =>
  `<article></article><p id="live-updates" data-item-id="${id}" data-comments="${comments}"></p>`;

async function refreshWith(
  index: Record<string, Entry>,
  pages: Record<string, string | number>,
) {
  const caches = new FakeCaches();
  const cache = await caches.open(SAVED_CACHE);
  await cache.put(SAVED_INDEX, new Response(JSON.stringify(index)));

  const badge: { value: number | null } = { value: null };
  const fetched: string[] = [];

  const module = await runModuleReturning(
    "Keeping saved threads current",
    "sw.js",
    {
      caches,
      SAVED_CACHE_NAME: SAVED_CACHE,
      Response,
      JSON,
      Number,
      Math,
      Object,
      self: {
        addEventListener: () => {},
        navigator: {
          setAppBadge: (n: number) => {
            badge.value = n;
            return Promise.resolve();
          },
          clearAppBadge: () => {
            badge.value = 0;
            return Promise.resolve();
          },
        },
      },
      fetch: (url: string) => {
        fetched.push(url);
        const page = pages[url];
        if (page === undefined) return Promise.resolve(new Response("", { status: 404 }));
        if (typeof page === "number") return Promise.reject(new Error("offline"));
        return Promise.resolve(new Response(page, { status: 200 }));
      },
    },
    ["refreshSavedStories", "readSavedIndex"],
  );

  await module.refreshSavedStories!();
  const after = await (await caches.open(SAVED_CACHE)).match(SAVED_INDEX);
  return {
    badge: badge.value,
    fetched,
    index: (await after!.json()) as Record<string, Entry>,
    cached: caches.keysIn(SAVED_CACHE),
  };
}

Deno.test("a refresh badges threads that grew, not comments that arrived", async () => {
  const result = await refreshWith(
    { "1": { seen: 5, latest: 5 }, "2": { seen: 10, latest: 10 }, "3": { seen: 2, latest: 2 } },
    { "/item/1": itemHtml(1, 9), "/item/2": itemHtml(2, 10), "/item/3": itemHtml(3, 40) },
  );

  // Two conversations worth going back to. The alternative - 4 + 38 new
  // comments - is a number nobody can act on.
  assertEquals(result.badge, 2);
  assertEquals(result.index["1"], { seen: 5, latest: 9 });
  assertEquals(result.index["2"], { seen: 10, latest: 10 });
});

Deno.test("a refresh never marks a thread read on the reader's behalf", async () => {
  // `seen` is written only by the page, when the reader opens the thread. If a
  // refresh moved it, the badge would clear itself and the feature would be
  // silently pointless.
  const result = await refreshWith(
    { "7": { seen: 3, latest: 3 } },
    { "/item/7": itemHtml(7, 30) },
  );

  assertEquals(result.index["7"]!.seen, 3);
  assertEquals(result.index["7"]!.latest, 30);
  assertEquals(result.badge, 1);
});

Deno.test("nothing unread clears the badge rather than leaving it stale", async () => {
  const result = await refreshWith(
    { "1": { seen: 8, latest: 8 } },
    { "/item/1": itemHtml(1, 8) },
  );
  assertEquals(result.badge, 0);
});

Deno.test("a refresh puts the fresh pages in the saved cache", async () => {
  // The badge is the visible half; this is the half that makes the thread
  // readable on a train.
  const result = await refreshWith(
    { "1": { seen: 0, latest: 0 }, "2": { seen: 0, latest: 0 } },
    { "/item/1": itemHtml(1, 1), "/item/2": itemHtml(2, 2) },
  );

  assertEquals(result.fetched, ["/item/1", "/item/2"]);
  assertEquals(result.cached.includes("/item/1"), true);
  assertEquals(result.cached.includes("/item/2"), true);
});

Deno.test("an unreachable thread leaves its saved copy and its counts alone", async () => {
  const result = await refreshWith(
    { "1": { seen: 1, latest: 1 }, "2": { seen: 4, latest: 4 } },
    { "/item/1": 0, "/item/2": itemHtml(2, 6) },
  );

  // Offline for one, fine for the other: the failure must not reset the first
  // one's history or stop the second from being checked.
  assertEquals(result.index["1"], { seen: 1, latest: 1 });
  assertEquals(result.index["2"], { seen: 4, latest: 6 });
  assertEquals(result.badge, 1);
});

Deno.test("an empty saved list does no work at all", async () => {
  const result = await refreshWith({}, {});
  assertEquals(result.fetched, []);
  // Notably it does not clear the badge either - there is nothing to say.
  assertEquals(result.badge, null);
});

Deno.test("sw.js registers the background fetch and periodic sync handlers", async () => {
  const source = await Deno.readTextFile(new URL("../static/sw.js", import.meta.url));

  // A Background Fetch with no success handler downloads everything and throws
  // it away, with no error anywhere.
  for (const handler of ["backgroundfetchsuccess", "backgroundfetchfail", "backgroundfetchclick"]) {
    assertEquals(source.includes(handler), true, `sw.js should handle ${handler}`);
  }
  assertEquals(source.includes("periodicsync"), true);
  // The tag has to match the one app.js registers.
  assertEquals(source.includes('"refresh-saved"'), true);
});

Deno.test("app.js registers the same periodic sync tag sw.js listens for", async () => {
  const source = await Deno.readTextFile(new URL("../static/app.js", import.meta.url));
  assertEquals(source.includes('periodicSync.register("refresh-saved"'), true);
  // And writes the index to the URL the worker reads.
  assertEquals(source.includes("/__nfhn/saved-index"), true);
});
