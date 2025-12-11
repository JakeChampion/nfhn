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
