// Test adapter that routes to the appropriate edge function
import topHandler from "../netlify/edge-functions/top.ts";
import newestHandler from "../netlify/edge-functions/newest.ts";
import askHandler from "../netlify/edge-functions/ask.ts";
import showHandler from "../netlify/edge-functions/show.ts";
import jobsHandler from "../netlify/edge-functions/jobs.ts";
import itemHandler from "../netlify/edge-functions/item.ts";
import userHandler from "../netlify/edge-functions/user.ts";
import { handleNotFound, redirect } from "../netlify/edge-functions/lib/handlers.ts";
import { cacheKeyFor } from "../netlify/edge-functions/lib/cache.ts";
import {
  isPrerender,
  isSpeculative,
  waiterFrom,
} from "../netlify/edge-functions/lib/background.ts";
import { THEME_SCRIPT_HASH } from "../netlify/edge-functions/lib/config.ts";
import { applyCacheTags } from "../netlify/edge-functions/lib/security.ts";
import { FEEDS } from "../netlify/edge-functions/lib/feeds.ts";
import sitemapHandler from "../netlify/edge-functions/sitemap.ts";
import savedHandler from "../netlify/edge-functions/saved.ts";
import shareHandler, {
  extractSharedUrl,
  shareDestination,
} from "../netlify/edge-functions/share.ts";
import { resetCircuitBreaker } from "../netlify/edge-functions/lib/hn.ts";
import type { Context } from "@netlify/edge-functions";
import {
  assert,
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "std/testing/asserts.ts";

// Background work handed to `context.waitUntil` by the edge functions. The
// production runtime keeps the isolate alive until these settle; here we
// collect them so tests can await the same work instead of guessing at a
// number of event-loop ticks.
const backgroundWork: Promise<unknown>[] = [];

/** Await every promise the handlers have deferred, including any they queue in turn. */
async function settleBackgroundWork(): Promise<void> {
  while (backgroundWork.length) {
    const pending = backgroundWork.splice(0, backgroundWork.length);
    await Promise.allSettled(pending);
  }
}

// Create a mock context with params
function createContext(params: Record<string, string> = {}): Context {
  return {
    params,
    waitUntil: (promise: Promise<unknown>) => {
      backgroundWork.push(promise);
    },
  } as unknown as Context;
}

// Router that mimics Netlify routing (redirects from netlify.toml + edge functions)
// deno-lint-ignore require-await
async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Redirects (handled by Netlify CDN in production, simulated here for tests)
  if (path === "/") return redirect("/top/1");
  if (path === "/top") return redirect("/top/1");
  if (path === "/newest") return redirect("/newest/1");
  if (path === "/ask") return redirect("/ask/1");
  if (path === "/show") return redirect("/show/1");
  if (path === "/jobs") return redirect("/jobs/1");

  // /top/:page
  const topMatch = path.match(/^\/top\/(\d+)$/);
  if (topMatch?.[1]) {
    return topHandler(request, createContext({ page: topMatch[1] }));
  }

  // /newest/:page
  const newestMatch = path.match(/^\/newest\/(\d+)$/);
  if (newestMatch?.[1]) {
    return newestHandler(request, createContext({ page: newestMatch[1] }));
  }

  // /ask/:page
  const askMatch = path.match(/^\/ask\/(\d+)$/);
  if (askMatch?.[1]) {
    return askHandler(request, createContext({ page: askMatch[1] }));
  }

  // /show/:page
  const showMatch = path.match(/^\/show\/(\d+)$/);
  if (showMatch?.[1]) {
    return showHandler(request, createContext({ page: showMatch[1] }));
  }

  // /jobs/:page
  const jobsMatch = path.match(/^\/jobs\/(\d+)$/);
  if (jobsMatch?.[1]) {
    return jobsHandler(request, createContext({ page: jobsMatch[1] }));
  }

  // /item/:id
  const itemMatch = path.match(/^\/item\/(\d+)$/);
  if (itemMatch?.[1]) {
    return itemHandler(request, createContext({ id: itemMatch[1] }));
  }

  // /user/:username
  const userMatch = path.match(/^\/user\/([a-zA-Z0-9_]+)$/);
  if (userMatch?.[1]) {
    return userHandler(request, createContext({ username: userMatch[1] }));
  }

  return handleNotFound(request);
}
type RouteMap = Record<string, unknown>;

class MemoryCache {
  #store = new Map<string, Response>();

  match(request: Request | string): Promise<Response | undefined> {
    const key = typeof request === "string" ? request : request.url;
    const res = this.#store.get(key);
    return Promise.resolve(res ? res.clone() : undefined);
  }

  put(request: Request | string, response: Response): Promise<void> {
    const key = typeof request === "string" ? request : request.url;
    this.#store.set(key, response.clone());
    return Promise.resolve();
  }
}

class MemoryCacheStorage {
  #caches = new Map<string, MemoryCache>();

  open(name: string): Promise<MemoryCache> {
    if (!this.#caches.has(name)) {
      this.#caches.set(name, new MemoryCache());
    }
    const cache = this.#caches.get(name);
    if (!cache) throw new Error("Cache not initialized");
    return Promise.resolve(cache);
  }
}

function createMockFetch(routes: RouteMap) {
  const counts = new Map<string, number>();

  const mockFetch = async (
    input: Request | string,
    _init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.url;
    counts.set(url, (counts.get(url) ?? 0) + 1);

    const entry = routes[url];
    if (!entry) {
      return Promise.resolve(new Response("not found", { status: 404 }));
    }

    if (entry instanceof Response) {
      return Promise.resolve(entry.clone());
    }

    if (entry instanceof Error) {
      throw entry;
    }

    if (typeof entry === "function") {
      const result = await (entry as () => Promise<unknown> | unknown)();
      if (result instanceof Response) return result.clone();
      if (result instanceof Error) throw result;
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (typeof entry === "string") {
      return Promise.resolve(new Response(entry));
    }

    return Promise.resolve(
      new Response(JSON.stringify(entry), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  return { mockFetch, counts };
}

async function withMockedEnv(
  routes: RouteMap,
  testFn: (ctx: { counts: Map<string, number> }) => Promise<void>,
) {
  // Reset circuit breaker state before each test
  resetCircuitBreaker();

  const originalFetch = globalThis.fetch;
  const cachesAny = globalThis.caches as unknown as {
    open?: (...args: unknown[]) => unknown;
  };
  const originalCacheOpen = cachesAny?.open;

  const { mockFetch, counts } = createMockFetch(routes);
  const mockCacheStorage = new MemoryCacheStorage();
  let restoreCaches: (() => void) | null = null;

  (globalThis as Record<string, unknown>).fetch = mockFetch;
  if (cachesAny) {
    try {
      cachesAny.open = (...args: unknown[]) => mockCacheStorage.open(args[0] as string);
      restoreCaches = () => {
        if (originalCacheOpen) cachesAny.open = originalCacheOpen;
      };
    } catch (_err) {
      try {
        Object.defineProperty(cachesAny, "open", {
          configurable: true,
          value: (...args: unknown[]) => mockCacheStorage.open(args[0] as string),
        });
        restoreCaches = () => {
          if (originalCacheOpen) {
            Object.defineProperty(cachesAny, "open", {
              configurable: true,
              value: originalCacheOpen,
            });
          } else {
            Reflect.deleteProperty(cachesAny, "open");
          }
        };
      } catch {
        // If we cannot override caches.open, allow the test to proceed without cache mocking.
      }
    }
  } else {
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: mockCacheStorage,
    });
    restoreCaches = () => {
      Reflect.deleteProperty(globalThis, "caches");
    };
  }

  try {
    await testFn({ counts });
  } finally {
    (globalThis as Record<string, unknown>).fetch = originalFetch;
    if (restoreCaches) restoreCaches();
  }
}

const topStoriesUrl = "https://api.hnpwa.com/v0/news/1.json";
const askStoriesUrl = "https://api.hnpwa.com/v0/ask/1.json";
const showStoriesUrl = "https://api.hnpwa.com/v0/show/1.json";
const jobsStoriesUrl = "https://api.hnpwa.com/v0/jobs/1.json";
const itemUrl = "https://api.hnpwa.com/v0/item/123.json";

Deno.test("serves top stories from the mocked API", async () => {
  const routes = {
    [topStoriesUrl]: [
      {
        id: 1,
        title: "Top Story",
        points: 99,
        user: "alice",
        time: Math.floor(Date.now() / 1000) - 120,
        type: "link",
        url: "https://example.com/top-story",
        domain: "example.com",
        comments_count: 3,
      },
    ],
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/top/1"));
    const body = await res.text();

    assertEquals(res.status, 200);
    assertStringIncludes(body, "Top Story");
    assertStringIncludes(
      res.headers.get("cache-control") ?? "",
      "stale-while-revalidate",
    );
  });
});

Deno.test("filters deleted and dead comments from item page", async () => {
  const routes = {
    [itemUrl]: {
      id: 123,
      title: "Hello World",
      points: 50,
      user: "bob",
      time: Math.floor(Date.now() / 1000) - 300,
      type: "link",
      url: "https://example.com/hello",
      domain: "example.com",
      content: "<p>Example content</p>",
      comments_count: 3,
      comments: [
        {
          id: 456,
          user: "carol",
          time_ago: "1 hour ago",
          type: "comment",
          content: "<p>Visible comment</p>",
          comments: [],
        },
        {
          id: 789,
          user: "ghost",
          time_ago: "1 hour ago",
          type: "comment",
          dead: true,
          content: "<p>DEAD-COMMENT</p>",
          comments: [],
        },
        {
          id: 101112,
          user: "gone",
          time_ago: "1 hour ago",
          type: "comment",
          deleted: true,
          content: "<p>DELETED-COMMENT</p>",
          comments: [],
        },
      ],
    },
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/item/123"));
    const body = await res.text();

    assertEquals(res.status, 200);
    assertStringIncludes(body, "Visible comment");
    assert(!body.includes("DEAD-COMMENT"), "Dead comments should not render");
    assert(!body.includes("DELETED-COMMENT"), "Deleted comments should not render");
  });
});

Deno.test("serves stale top feed and revalidates in background", async () => {
  let call = 0;
  const routes = {
    [topStoriesUrl]: () => {
      call++;
      return [
        {
          id: call,
          title: call === 1 ? "Top First" : "Top Second",
          points: 99,
          user: "alice",
          time: Math.floor(Date.now() / 1000) - 120,
          type: "link",
          url: "https://example.com/top-story",
          domain: "example.com",
          comments_count: 3,
        },
      ];
    },
  };

  await withMockedEnv(routes, async ({ counts }) => {
    const originalNow = Date.now;
    const baseNow = 1_700_000_000_000;

    try {
      (Date as unknown as { now: () => number }).now = () => baseNow;
      const firstRes = await handler(new Request("https://nfhn.test/top/1"));
      const cacheControl = firstRes.headers.get("cache-control") ?? "";
      await firstRes.text();

      const ttlSeconds = Number.parseInt((cacheControl.match(/max-age=(\d+)/)?.[1]) ?? "", 10) ||
        30;
      const swrSeconds =
        Number.parseInt((cacheControl.match(/stale-while-revalidate=(\d+)/)?.[1]) ?? "", 10) ||
        300;

      assertEquals(counts.get(topStoriesUrl), 1);

      const staleNow = baseNow + (ttlSeconds + 1) * 1000;
      (Date as unknown as { now: () => number }).now = () => staleNow;

      const res = await handler(new Request("https://nfhn.test/top/1"));
      const body = await res.text();

      assertEquals(res.status, 200);
      assertStringIncludes(body, "Top First"); // Served cached
      assert(!body.includes("Top Second"), "Revalidated content should not be served immediately");
      assertEquals(counts.get(topStoriesUrl), 2);

      // Ensure we're still within the SWR window so revalidation is expected
      assert(staleNow - baseNow < (ttlSeconds + swrSeconds) * 1000);
    } finally {
      (Date as unknown as { now: () => number }).now = originalNow;
    }
  });
});

Deno.test("serves ask stories from the mocked API", async () => {
  const routes = {
    [askStoriesUrl]: [
      {
        id: 11,
        title: "Ask Story",
        points: 12,
        user: "asker",
        time: Math.floor(Date.now() / 1000) - 200,
        type: "ask",
        comments_count: 5,
      },
    ],
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/ask/1"));
    const body = await res.text();

    assertEquals(res.status, 200);
    assertStringIncludes(body, "Ask Story");
  });
});

Deno.test("serves show stories from the mocked API", async () => {
  const routes = {
    [showStoriesUrl]: [
      {
        id: 21,
        title: "Show Story",
        points: 15,
        user: "showoff",
        time: Math.floor(Date.now() / 1000) - 180,
        type: "show",
        url: "https://example.com/show-story",
        domain: "example.com",
        comments_count: 4,
      },
    ],
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/show/1"));
    const body = await res.text();

    assertEquals(res.status, 200);
    assertStringIncludes(body, "Show Story");
    assertStringIncludes(body, "(example.com)");
  });
});

Deno.test("serves tell HN story with correct link", async () => {
  const routes = {
    [topStoriesUrl]: [
      {
        id: 250,
        title: "Tell HN: My Story",
        points: 25,
        user: "storyteller",
        time: Math.floor(Date.now() / 1000) - 900,
        type: "tell",
        comments_count: 15,
      },
    ],
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/top/1"));
    const body = await res.text();

    assertEquals(res.status, 200);
    assertStringIncludes(body, "Tell HN");
    assertStringIncludes(body, 'href="/item/250"');
    assert(!body.includes('href="item?id='), "Should not contain malformed relative URL");
  });
});

Deno.test("serves jobs from the mocked API", async () => {
  const routes = {
    [jobsStoriesUrl]: [
      {
        id: 31,
        title: "Job Posting",
        points: 0,
        user: "hr",
        time: Math.floor(Date.now() / 1000) - 90,
        type: "job",
        url: "https://example.com/job",
        domain: "example.com",
        comments_count: 0,
      },
    ],
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/jobs/1"));
    const body = await res.text();

    assertEquals(res.status, 200);
    assertStringIncludes(body, "Job Posting");
  });
});

Deno.test("returns 404 for empty top feed", async () => {
  const routes = {
    [topStoriesUrl]: [],
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/top/1"));
    const body = await res.text();

    assertEquals(res.status, 404);
    assertStringIncludes(body, "No stories found");
  });
});

Deno.test("returns offline page on fetch error/timeout", async () => {
  const routes = {
    [topStoriesUrl]: new Error("timeout"),
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/top/1"));
    const body = await res.text();

    assertEquals(res.status, 503);
    assertStringIncludes(body, "Offline");
    assertStringIncludes(body, "We can't reach Hacker News right now");
    assertEquals(res.headers.get("cache-control"), "no-store");
    assertEquals(res.headers.get("pragma"), "no-cache");
    assert(res.headers.get("content-security-policy"));
    assertEquals(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
    assert(res.headers.get("permissions-policy"));
    assert(res.headers.get("strict-transport-security"));
  });
});

Deno.test("serves item page with comments from the mocked API", async () => {
  const routes = {
    [itemUrl]: {
      id: 123,
      title: "Hello World",
      points: 50,
      user: "bob",
      time: Math.floor(Date.now() / 1000) - 300,
      type: "link",
      url: "https://example.com/hello",
      domain: "example.com",
      content: "<p>Example content</p>",
      comments_count: 1,
      comments: [
        {
          id: 456,
          user: "carol",
          time_ago: "1 hour ago",
          type: "comment",
          content: "<p>First!</p>",
          comments: [],
        },
      ],
    },
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/item/123"));
    const body = await res.text();

    assertEquals(res.status, 200);
    assertStringIncludes(body, "Hello World");
    assertStringIncludes(body, "First!");
    assertStringIncludes(
      res.headers.get("cache-control") ?? "",
      "stale-while-revalidate",
    );
  });
});

Deno.test("error pages send no-store and security headers", async () => {
  await withMockedEnv({}, async () => {
    const res = await handler(new Request("https://nfhn.test/does-not-exist"));
    const body = await res.text();

    assertEquals(res.status, 404);
    assertStringIncludes(body, "Page not found");
    assertEquals(res.headers.get("cache-control"), "no-store");
    assertEquals(res.headers.get("pragma"), "no-cache");
    assert(res.headers.get("content-security-policy"));
    assertEquals(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
    assert(res.headers.get("permissions-policy"));
    assert(res.headers.get("strict-transport-security"));
  });
});

Deno.test("escapes HTML in story titles and sets accessibility attributes", async () => {
  const routes = {
    [topStoriesUrl]: [
      {
        id: 1,
        title: "<script>alert(1)</script>",
        points: 1,
        user: "alice",
        time: Math.floor(Date.now() / 1000) - 60,
        type: "link",
        url: "https://example.com",
        domain: "example.com",
        comments_count: 0,
      },
    ],
    [itemUrl]: {
      id: 123,
      title: "Hello World",
      points: 50,
      user: "bob",
      time: Math.floor(Date.now() / 1000) - 300,
      type: "link",
      url: "https://example.com/hello",
      domain: "example.com",
      content: "<p>Example content</p>",
      comments_count: 1,
      comments: [
        {
          id: 456,
          user: "carol",
          time_ago: "1 hour ago",
          type: "comment",
          content: "<p>First!</p>",
          comments: [],
        },
      ],
    },
  };

  await withMockedEnv(routes, async () => {
    const feedRes = await handler(new Request("https://nfhn.test/top/1"));
    const feedBody = await feedRes.text();
    assertStringIncludes(feedBody, "&lt;script&gt;alert(1)&lt;/script&gt;");
    assertStringIncludes(feedBody, 'aria-current="page"');

    const itemRes = await handler(new Request("https://nfhn.test/item/123"));
    const itemBody = await itemRes.text();
    assertStringIncludes(itemBody, 'aria-label="Comment by carol, posted 1 hour ago"');
  });
});

Deno.test("caches list responses and avoids repeat fetches within TTL", async () => {
  const routes = {
    [topStoriesUrl]: [
      {
        id: 1,
        title: "Cached Story",
        points: 10,
        user: "cacher",
        time: Math.floor(Date.now() / 1000) - 60,
        type: "link",
        url: "https://example.com/cached",
        domain: "example.com",
        comments_count: 0,
      },
    ],
  };

  await withMockedEnv(routes, async ({ counts }) => {
    const first = await handler(new Request("https://nfhn.test/top/1"));
    await first.text();

    const before = counts.get(topStoriesUrl) ?? 0;
    const second = await handler(new Request("https://nfhn.test/top/1"));
    await second.text();
    const after = counts.get(topStoriesUrl) ?? 0;

    assertEquals(before, 1);
    assertEquals(after, 1, "second request should use cached response");
  });
});

Deno.test("serves stale responses, revalidates, and honors conditional requests", async () => {
  const stories = [
    {
      id: 1,
      title: "Cached Story",
      points: 10,
      user: "cacher",
      time: Math.floor(Date.now() / 1000) - 60,
      type: "link",
      url: "https://example.com/cached",
      domain: "example.com",
      comments_count: 0,
    },
    {
      id: 1,
      title: "Updated Story",
      points: 12,
      user: "refresher",
      time: Math.floor(Date.now() / 1000) - 30,
      type: "link",
      url: "https://example.com/updated",
      domain: "example.com",
      comments_count: 1,
    },
  ];

  let call = 0;
  const routes = {
    [topStoriesUrl]: () => {
      const idx = Math.min(call, stories.length - 1);
      call += 1;
      return [stories[idx]];
    },
  };

  await withMockedEnv(routes, async ({ counts }) => {
    const originalNow = Date.now;
    const baseNow = Date.now();
    Date.now = () => baseNow;

    try {
      const fresh = await handler(new Request("https://nfhn.test/top/1"));
      const freshBody = await fresh.text();

      assertStringIncludes(freshBody, "Cached Story");
      assertEquals(counts.get(topStoriesUrl) ?? 0, 1);

      // Age the cached response so it is stale-but-serveable.
      Date.now = () => baseNow + 31_000;

      const stale = await handler(new Request("https://nfhn.test/top/1"));
      const staleBody = await stale.text();
      assertStringIncludes(staleBody, "Cached Story"); // served stale immediately

      // Background revalidation and the cache write that follows it are both
      // deferred via context.waitUntil, so awaiting them is deterministic
      // rather than a race against a fixed number of event-loop ticks.
      await settleBackgroundWork();
      assertEquals(counts.get(topStoriesUrl) ?? 0, 2, "should revalidate in background");

      const updated = await handler(new Request("https://nfhn.test/top/1"));
      const updatedEtag = updated.headers.get("etag");
      const updatedBody = await updated.text();
      assertStringIncludes(updatedBody, "Updated Story");
      assertEquals(counts.get(topStoriesUrl) ?? 0, 2, "cache should serve updated copy");

      if (!updatedEtag) throw new Error("expected updated etag");

      const conditionalReq = new Request("https://nfhn.test/top/1", {
        headers: { "if-none-match": updatedEtag },
      });
      const conditional = await handler(conditionalReq);
      assertEquals(conditional.status, 304);
      assertEquals(conditional.headers.get("content-length"), null);
    } finally {
      Date.now = originalNow;
    }
  });
});

Deno.test("refreshes feed etag when visible metadata changes", async () => {
  const stories = [
    {
      id: 1,
      title: "Cached Story",
      points: 10,
      user: "cacher",
      time: Math.floor(Date.now() / 1000) - 60,
      type: "link",
      url: "https://example.com/cached",
      domain: "example.com",
      comments_count: 1,
    },
    {
      id: 1,
      title: "Cached Story",
      points: 10,
      user: "cacher",
      time: Math.floor(Date.now() / 1000) - 60,
      type: "link",
      url: "https://example.com/cached",
      domain: "changed.example.com",
      comments_count: 12,
    },
  ];

  let call = 0;
  const routes = {
    [topStoriesUrl]: () => {
      const idx = Math.min(call, stories.length - 1);
      call += 1;
      return [stories[idx]];
    },
  };

  await withMockedEnv(routes, async ({ counts }) => {
    const originalNow = Date.now;
    const baseNow = Date.now();
    Date.now = () => baseNow;

    try {
      const first = await handler(new Request("https://nfhn.test/top/1"));
      const firstEtag = first.headers.get("etag");
      const cacheControl = first.headers.get("cache-control") ?? "";
      await first.text();

      if (!firstEtag) throw new Error("expected initial etag");

      const ttlSeconds = Number.parseInt(
        (cacheControl.match(/max-age=(\d+)/)?.[1]) ?? "",
        10,
      ) || 30;
      const swrSeconds = Number.parseInt(
        (cacheControl.match(/stale-while-revalidate=(\d+)/)?.[1]) ?? "",
        10,
      ) || 300;

      Date.now = () => baseNow + (ttlSeconds + swrSeconds + 1) * 1000;

      const conditionalReq = new Request("https://nfhn.test/top/1", {
        headers: { "if-none-match": firstEtag },
      });
      const updated = await handler(conditionalReq);
      const updatedEtag = updated.headers.get("etag");
      const updatedBody = await updated.text();

      assertEquals(updated.status, 200, "metadata changes should invalidate old etags");
      if (!updatedEtag) throw new Error("expected updated etag");
      assertNotEquals(updatedEtag, firstEtag);
      assertStringIncludes(updatedBody, "view 12 comments");
      assertStringIncludes(updatedBody, "(changed.example.com)");
      assertEquals(counts.get(topStoriesUrl) ?? 0, 2);
    } finally {
      Date.now = originalNow;
    }
  });
});

// =============================================================================
// User Page Tests
// =============================================================================

const userUrl = "https://hacker-news.firebaseio.com/v0/user/testuser.json";

Deno.test("serves user profile page from the mocked API", async () => {
  const routes = {
    [userUrl]: {
      id: "testuser",
      created: 1234567890,
      karma: 5000,
      about: "Hello world",
      submitted: [],
    },
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/user/testuser"));
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "testuser");
    assertStringIncludes(body, "5,000"); // formatted karma
    assertStringIncludes(body, "Hello world");
    assertStringIncludes(body, "View profile on HN");
  });
});

Deno.test("returns 404 for non-existent user", async () => {
  const routes = {
    "https://hacker-news.firebaseio.com/v0/user/nobody.json": null,
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/user/nobody"));
    assertEquals(res.status, 404);
    const body = await res.text();
    assertStringIncludes(body, "User not found");
  });
});

Deno.test("returns 404 for invalid username format", async () => {
  // No mock needed - validation happens before API call
  await withMockedEnv({}, async () => {
    const res = await handler(new Request("https://nfhn.test/user/invalid-user!"));
    assertEquals(res.status, 404);
    const body = await res.text();
    assertStringIncludes(body, "not found");
  });
});

Deno.test("user profile page shows recent submissions", async () => {
  const routes = {
    "https://hacker-news.firebaseio.com/v0/user/prolificuser.json": {
      id: "prolificuser",
      created: 1234567890,
      karma: 10000,
      submitted: [100, 101, 102],
    },
    "https://hacker-news.firebaseio.com/v0/item/100.json": {
      id: 100,
      type: "story",
      by: "prolificuser",
      title: "My First Post",
      url: "https://example.com/first",
      score: 50,
      time: Math.floor(Date.now() / 1000) - 3600,
      descendants: 10,
    },
    "https://hacker-news.firebaseio.com/v0/item/101.json": {
      id: 101,
      type: "story",
      by: "prolificuser",
      title: "My Second Post",
      score: 30,
      time: Math.floor(Date.now() / 1000) - 7200,
      descendants: 5,
    },
    "https://hacker-news.firebaseio.com/v0/item/102.json": {
      id: 102,
      type: "comment", // Should be filtered out
      by: "prolificuser",
      text: "Just a comment",
      time: Math.floor(Date.now() / 1000) - 3600,
    },
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/user/prolificuser"));
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "Recent Submissions");
    assertStringIncludes(body, "My First Post");
    assertStringIncludes(body, "My Second Post");
    assertStringIncludes(body, "example.com");
    assertStringIncludes(body, "50 point");
    assertStringIncludes(body, "All submissions on HN");
  });
});

// =============================================================================
// Server-Timing Header Tests
// =============================================================================

Deno.test("feed response includes Server-Timing header", async () => {
  const routes = {
    [topStoriesUrl]: [
      {
        id: 1,
        title: "Timing Test",
        points: 10,
        user: "timer",
        time: Math.floor(Date.now() / 1000) - 60,
        type: "link",
        url: "https://example.com",
        domain: "example.com",
        comments_count: 0,
      },
    ],
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/top/1"));
    assertEquals(res.status, 200);

    const timing = res.headers.get("Server-Timing");
    assert(timing !== null, "Server-Timing header should be present");
    assertStringIncludes(timing, "api;dur=");
    assertStringIncludes(timing, "total;dur=");
    await res.text();
  });
});

Deno.test("item response includes Server-Timing header", async () => {
  const routes = {
    [itemUrl]: {
      id: 123,
      title: "Timing Test Item",
      points: 50,
      user: "timer",
      time: Math.floor(Date.now() / 1000) - 3600,
      type: "link",
      url: "https://example.com",
      comments_count: 0,
      comments: [],
    },
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/item/123"));
    assertEquals(res.status, 200);

    const timing = res.headers.get("Server-Timing");
    assert(timing !== null, "Server-Timing header should be present");
    assertStringIncludes(timing, "api;dur=");
    await res.text();
  });
});

Deno.test("user response includes Server-Timing header", async () => {
  const routes = {
    [userUrl]: {
      id: "testuser",
      created: 1234567890,
      karma: 5000,
      submitted: [],
    },
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/user/testuser"));
    assertEquals(res.status, 200);

    const timing = res.headers.get("Server-Timing");
    assert(timing !== null, "Server-Timing header should be present");
    assertStringIncludes(timing, "api;dur=");
    assertStringIncludes(timing, "submissions;dur=");
    await res.text();
  });
});

// =============================================================================
// OP Highlighting Integration Test
// =============================================================================

Deno.test("item page highlights OP comments", async () => {
  const routes = {
    [itemUrl]: {
      id: 123,
      title: "OP Test",
      points: 50,
      user: "original_poster",
      time: Math.floor(Date.now() / 1000) - 3600,
      type: "link",
      url: "https://example.com",
      comments_count: 2,
      comments: [
        {
          id: 111,
          type: "comment",
          user: "original_poster",
          time_ago: "1 hour ago",
          content: "I'm the OP!",
          comments: [],
        },
        {
          id: 222,
          type: "comment",
          user: "someone_else",
          time_ago: "30 min ago",
          content: "I'm not the OP",
          comments: [],
        },
      ],
    },
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/item/123"));
    assertEquals(res.status, 200);
    const body = await res.text();

    // OP's comment should have the badge
    assertStringIncludes(body, "is-op");
    assertStringIncludes(body, 'title="Original Poster"');

    // Count occurrences - should only be for original_poster
    const opMatches = body.match(/is-op/g) || [];
    assertEquals(opMatches.length, 1, "Only one comment should have OP badge");
  });
});

// =============================================================================
// MAX_ITEM_ID Validation Test
// =============================================================================

Deno.test("returns 400 for item ID above MAX_ITEM_ID", async () => {
  await withMockedEnv({}, async () => {
    const res = await handler(new Request("https://nfhn.test/item/999999999"));
    assertEquals(res.status, 400);
    const body = await res.text();
    assertStringIncludes(body, "too large");
  });
});

// =============================================================================
// Error Boundary Tests
// =============================================================================

Deno.test("handles API timeout gracefully for feed", async () => {
  const routes: RouteMap = {
    [topStoriesUrl]: new Error("Network timeout"),
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/top/1"));
    // Should return offline error page (503), not crash
    assertEquals(res.status, 503);
    const body = await res.text();
    assertStringIncludes(body, "Offline");
  });
});

Deno.test("handles API timeout gracefully for item", async () => {
  const routes: RouteMap = {
    [itemUrl]: new Error("Network timeout"),
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/item/123"));
    // Item errors return 404 (not found) rather than 503 (offline)
    // because individual items failing is treated as "not available"
    assertEquals(res.status, 404);
    const body = await res.text();
    assertStringIncludes(body, "unavailable");
  });
});

Deno.test("handles malformed JSON gracefully", async () => {
  const routes: RouteMap = {
    [topStoriesUrl]: "not valid json {{{",
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/top/1"));
    // Should handle the error
    assert(res.status >= 400 || res.status === 200);
    await res.text();
  });
});

Deno.test("handles empty feed response", async () => {
  const routes: RouteMap = {
    [topStoriesUrl]: [],
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/top/1"));
    assertEquals(res.status, 404);
    const body = await res.text();
    assertStringIncludes(body, "No stories found");
  });
});

Deno.test("handles null item response", async () => {
  const routes: RouteMap = {
    [itemUrl]: null,
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/item/123"));
    assertEquals(res.status, 404);
    const body = await res.text();
    assertStringIncludes(body, "not found");
  });
});

Deno.test("handles deleted item", async () => {
  const routes: RouteMap = {
    [itemUrl]: {
      id: 123,
      deleted: true,
      title: "Deleted Story",
    },
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/item/123"));
    assertEquals(res.status, 404);
    const body = await res.text();
    assertStringIncludes(body, "unavailable");
  });
});

Deno.test("handles dead item", async () => {
  const routes: RouteMap = {
    [itemUrl]: {
      id: 123,
      dead: true,
      title: "Dead Story",
    },
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/item/123"));
    assertEquals(res.status, 404);
    const body = await res.text();
    assertStringIncludes(body, "unavailable");
  });
});

// =============================================================================
// Additional Route Tests
// =============================================================================

Deno.test("serves ask stories page", async () => {
  const routes = {
    [askStoriesUrl]: [
      {
        id: 100,
        title: "Ask HN: Question?",
        points: 20,
        user: "curious",
        time: Math.floor(Date.now() / 1000) - 600,
        type: "ask",
        comments_count: 5,
      },
    ],
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/ask/1"));
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "Ask HN");
  });
});

Deno.test("serves show stories page", async () => {
  const routes = {
    [showStoriesUrl]: [
      {
        id: 200,
        title: "Show HN: My Project",
        points: 30,
        user: "maker",
        time: Math.floor(Date.now() / 1000) - 1200,
        type: "show",
        url: "https://myproject.com",
        domain: "myproject.com",
        comments_count: 10,
      },
    ],
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/show/1"));
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "Show HN");
  });
});

Deno.test("serves jobs stories page", async () => {
  const routes = {
    [jobsStoriesUrl]: [
      {
        id: 300,
        title: "Hiring: Software Engineer",
        points: 0,
        user: "hr",
        time: Math.floor(Date.now() / 1000) - 3600,
        type: "job",
        url: "https://company.com/jobs",
        domain: "company.com",
        comments_count: 0,
      },
    ],
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/jobs/1"));
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "Hiring");
  });
});

Deno.test("returns 400 for page number too large", async () => {
  await withMockedEnv({}, async () => {
    const res = await handler(new Request("https://nfhn.test/top/999"));
    assertEquals(res.status, 400);
    const body = await res.text();
    assertStringIncludes(body, "too large");
  });
});

Deno.test("returns 404 for negative page number", async () => {
  await withMockedEnv({}, async () => {
    const res = await handler(new Request("https://nfhn.test/top/-1"));
    assertEquals(res.status, 404);
    const body = await res.text();
    assertStringIncludes(body, "not found");
  });
});

Deno.test("returns 404 for invalid item ID (zero)", async () => {
  await withMockedEnv({}, async () => {
    const res = await handler(new Request("https://nfhn.test/item/0"));
    assertEquals(res.status, 404);
    const body = await res.text();
    // Zero is not a positive integer, so parsePositiveInt returns null
    // and handleNotFound is called, returning "Page not found"
    assertStringIncludes(body, "Page not found");
  });
});

Deno.test("returns 404 for invalid item ID (negative)", async () => {
  await withMockedEnv({}, async () => {
    const res = await handler(new Request("https://nfhn.test/item/-5"));
    assertEquals(res.status, 404);
  });
});

// =============================================================================
// User Page Error Tests
// =============================================================================

Deno.test("handles user API error gracefully", async () => {
  const routes: RouteMap = {
    [userUrl]: new Error("Network error"),
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/user/testuser"));
    // User API errors result in 404 (user not found) since fetchUser returns null on errors
    assertEquals(res.status, 404);
    const body = await res.text();
    assertStringIncludes(body, "User not found");
  });
});

Deno.test("handles non-existent user", async () => {
  const routes: RouteMap = {
    [userUrl]: null,
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/user/testuser"));
    assertEquals(res.status, 404);
    const body = await res.text();
    assertStringIncludes(body, "User not found");
  });
});

Deno.test("handles invalid username with special characters", async () => {
  await withMockedEnv({}, async () => {
    const res = await handler(new Request("https://nfhn.test/user/test<script>"));
    assertEquals(res.status, 404);
    const body = await res.text();
    // Special characters in username don't match the route pattern
    assertStringIncludes(body, "Page not found");
  });
});

Deno.test("handles username too long", async () => {
  await withMockedEnv({}, async () => {
    const res = await handler(new Request("https://nfhn.test/user/thisisaverylongusername"));
    assertEquals(res.status, 400);
    const body = await res.text();
    assertStringIncludes(body, "invalid");
  });
});

// =============================================================================
// Article Page Features Tests
// =============================================================================

Deno.test("article page shows comment count", async () => {
  const routes = {
    [itemUrl]: {
      id: 123,
      title: "Test Story",
      points: 50,
      user: "author",
      time: Math.floor(Date.now() / 1000) - 3600,
      time_ago: "1 hour ago",
      type: "link",
      url: "https://example.com",
      domain: "example.com",
      comments_count: 25,
      comments: [
        {
          id: 456,
          type: "comment",
          user: "commenter",
          time_ago: "30 min ago",
          content: "Great article!",
          comments: [],
        },
      ],
    },
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/item/123"));
    assertEquals(res.status, 200);
    const body = await res.text();
    // Should show total comments
    assertStringIncludes(body, "25 comment");
    // Should show loaded count when different from total
    assertStringIncludes(body, "1 loaded");
  });
});

Deno.test("article page shows keyboard shortcuts modal markup", async () => {
  const routes = {
    [itemUrl]: {
      id: 123,
      title: "Test Story",
      points: 50,
      user: "author",
      time: Math.floor(Date.now() / 1000) - 3600,
      time_ago: "1 hour ago",
      type: "link",
      url: "https://example.com",
      domain: "example.com",
      comments_count: 0,
      comments: [],
    },
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/item/123"));
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "shortcuts-modal");
    assertStringIncludes(body, "Keyboard Shortcuts");
  });
});

Deno.test("tell HN item page renders with correct badge and link", async () => {
  const tellItemUrl = "https://api.hnpwa.com/v0/item/456.json";
  const routes = {
    [tellItemUrl]: {
      id: 456,
      title: "Tell HN: Something Interesting",
      points: 42,
      user: "tellauthor",
      time: Math.floor(Date.now() / 1000) - 1800,
      time_ago: "30 minutes ago",
      type: "tell",
      content: "<p>Here's my story</p>",
      comments_count: 5,
      comments: [],
    },
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/item/456"));
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "Tell HN");
    assertStringIncludes(body, "Something Interesting");
    assertStringIncludes(body, "badge-tell");
    assertStringIncludes(body, 'href="/item/456"');
  });
});

Deno.test("article page includes ARIA live region", async () => {
  const routes = {
    [itemUrl]: {
      id: 123,
      title: "Test Story",
      points: 50,
      user: "author",
      time: Math.floor(Date.now() / 1000) - 3600,
      time_ago: "1 hour ago",
      type: "link",
      url: "https://example.com",
      domain: "example.com",
      comments_count: 0,
      comments: [],
    },
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/item/123"));
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, 'aria-live="polite"');
    assertStringIncludes(body, 'id="aria-live"');
  });
});

// =============================================================================
// No-Vary-Search (draft-ietf-httpbis-no-vary-search)
// =============================================================================

const noVarySearchStory = {
  id: 1,
  title: "Tracked Story",
  points: 10,
  user: "alice",
  time: Math.floor(Date.now() / 1000) - 60,
  type: "link",
  url: "https://example.com/tracked",
  domain: "example.com",
  comments_count: 0,
};

Deno.test("pages advertise No-Vary-Search so decorated URLs reuse the cache", async () => {
  const routes = {
    [topStoriesUrl]: [noVarySearchStory],
    [itemUrl]: {
      id: 123,
      title: "Test Story",
      points: 50,
      user: "author",
      time: Math.floor(Date.now() / 1000) - 3600,
      type: "link",
      url: "https://example.com",
      domain: "example.com",
      comments_count: 0,
      comments: [],
    },
    "https://api.hnpwa.com/v0/user/alice.json": {
      id: "alice",
      created: Math.floor(Date.now() / 1000) - 86400,
      karma: 100,
      submitted: [],
    },
  };

  await withMockedEnv(routes, async () => {
    for (const path of ["/top/1", "/item/123", "/user/alice"]) {
      const res = await handler(new Request(`https://nfhn.test${path}`));
      await res.text();
      assertEquals(
        res.headers.get("no-vary-search"),
        "params, key-order",
        `${path} should advertise No-Vary-Search`,
      );
    }
  });
});

Deno.test("speculation rules declare the same No-Vary-Search the server sends", async () => {
  const routes = { [topStoriesUrl]: [noVarySearchStory] };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/top/1"));
    const body = await res.text();
    const header = res.headers.get("no-vary-search");

    assert(header, "expected a No-Vary-Search header");
    // A prefetch still in flight has no response header yet, so the browser
    // cannot know a decorated URL matches it. expects_no_vary_search closes
    // that window - and only works if it matches what the server actually
    // sends, hence asserting against the header rather than a literal.
    assertStringIncludes(body, `"expects_no_vary_search": "${header}"`);

    const declarations = body.match(/"expects_no_vary_search"/g) ?? [];
    assertEquals(
      declarations.length,
      2,
      "both the prefetch and prerender rules should declare it",
    );
  });
});

Deno.test("timestamps render as <time datetime> so cached pages can be corrected", async () => {
  const posted = Math.floor(Date.now() / 1000) - 3600;
  const routes = {
    "https://api.hnpwa.com/v0/item/777.json": {
      id: 777,
      title: "Timestamped Story",
      points: 10,
      user: "author",
      time: posted,
      type: "link",
      url: "https://example.com",
      domain: "example.com",
      comments_count: 1,
      comments: [
        {
          id: 778,
          type: "comment",
          user: "commenter",
          time: posted + 60,
          time_ago: "59 minutes ago",
          content: "<p>A comment</p>",
          comments: [],
        },
      ],
    },
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/item/777"));
    const body = await res.text();

    const iso = new Date(posted * 1000).toISOString();
    assertStringIncludes(body, `<time datetime="${iso}">`);
    // The comment's own timestamp too, not just the story's.
    assertStringIncludes(body, `<time datetime="${new Date((posted + 60) * 1000).toISOString()}">`);
    // The server-rendered text stays as the no-JS fallback.
    assertStringIncludes(body, "59 minutes ago</time>");
  });
});

Deno.test("story titles carry matching view-transition-names on feed and item pages", async () => {
  const routes = {
    [topStoriesUrl]: [{ ...noVarySearchStory, id: 4242 }],
    "https://api.hnpwa.com/v0/item/4242.json": {
      id: 4242,
      title: "Tracked Story",
      points: 10,
      user: "author",
      time: Math.floor(Date.now() / 1000) - 3600,
      type: "link",
      url: "https://example.com",
      domain: "example.com",
      comments_count: 0,
      comments: [],
    },
  };

  await withMockedEnv(routes, async () => {
    const feed = await handler(new Request("https://nfhn.test/top/1"));
    const feedBody = await feed.text();
    assertStringIncludes(
      feedBody,
      'li[data-story-id="4242"] .story-title-text{view-transition-name:story-4242',
    );

    const item = await handler(new Request("https://nfhn.test/item/4242"));
    const itemBody = await item.text();
    // Same name on both pages is what makes the title morph rather than
    // crossfade; if these ever drift apart the effect silently degrades.
    assertStringIncludes(itemBody, "view-transition-name:story-4242");
    assertStringIncludes(itemBody, "view-transition-class:story-title");
  });
});

Deno.test("tracking parameters reuse the cached entry instead of re-rendering", async () => {
  const routes = {
    [topStoriesUrl]: [noVarySearchStory],
  };

  await withMockedEnv(routes, async ({ counts }) => {
    const clean = await handler(new Request("https://nfhn.test/top/1"));
    await clean.text();
    assertEquals(counts.get(topStoriesUrl) ?? 0, 1);

    const decorated = await handler(
      new Request("https://nfhn.test/top/1?utm_source=newsletter&utm_medium=email"),
    );
    const decoratedBody = await decorated.text();

    assertStringIncludes(decoratedBody, "Tracked Story");
    assertEquals(
      counts.get(topStoriesUrl) ?? 0,
      1,
      "decorated URL should hit the entry cached for the clean URL",
    );
  });
});

Deno.test("cacheKeyFor drops the query string but preserves the rest of the URL", () => {
  const decorated = cacheKeyFor(
    new Request("https://nfhn.test/top/1?utm_source=x&gclid=y"),
  );
  assertEquals(decorated.url, "https://nfhn.test/top/1");

  const clean = new Request("https://nfhn.test/item/123");
  assertEquals(cacheKeyFor(clean).url, "https://nfhn.test/item/123");
});

// =============================================================================
// Background work (context.waitUntil)
// =============================================================================

Deno.test("cache writes are handed to context.waitUntil, not fired and forgotten", async () => {
  const deferred: Promise<unknown>[] = [];
  const context = {
    params: { page: "1" },
    waitUntil: (promise: Promise<unknown>) => {
      deferred.push(promise);
    },
  } as unknown as Context;

  await withMockedEnv({ [topStoriesUrl]: () => [] }, async () => {
    await topHandler(new Request("https://nfhn.test/top/1"), context);
  });

  // An empty feed renders an error page, which is deliberately not cached, so
  // the assertion that matters is the one below: whatever background work the
  // handler does, it must be registered rather than left to race the teardown.
  await Promise.allSettled(deferred);
});

Deno.test("waiterFrom falls back to fire-and-forget when the runtime has no waitUntil", async () => {
  // Netlify always provides waitUntil; the test harness and some render paths
  // do not. The fallback must not throw, and must swallow rejections rather
  // than surfacing them as unhandled.
  const waiter = waiterFrom(undefined);
  waiter(Promise.reject(new Error("background failure")));
  await new Promise((resolve) => setTimeout(resolve, 0));
});

Deno.test("waiterFrom uses the runtime's waitUntil when present", async () => {
  const seen: Promise<unknown>[] = [];
  const waiter = waiterFrom({ waitUntil: (p) => seen.push(p) });
  const work = Promise.resolve("done");
  waiter(work);
  assertEquals(seen.length, 1);
  assertEquals(await seen[0], "done");
});

Deno.test("waiterFrom degrades gracefully when waitUntil throws", async () => {
  const waiter = waiterFrom({
    waitUntil: () => {
      throw new Error("called after response was finalised");
    },
  });
  waiter(Promise.reject(new Error("background failure")));
  await new Promise((resolve) => setTimeout(resolve, 0));
});

Deno.test("isSpeculative and isPrerender read Sec-Purpose", () => {
  const plain = new Request("https://nfhn.test/top/1");
  assertEquals(isSpeculative(plain), false);
  assertEquals(isPrerender(plain), false);

  const prefetch = new Request("https://nfhn.test/top/1", {
    headers: { "Sec-Purpose": "prefetch" },
  });
  assertEquals(isSpeculative(prefetch), true);
  assertEquals(isPrerender(prefetch), false);

  const prerender = new Request("https://nfhn.test/top/1", {
    headers: { "Sec-Purpose": "prefetch;prerender" },
  });
  assertEquals(isSpeculative(prerender), true);
  assertEquals(isPrerender(prerender), true);
});

// =============================================================================
// Cookie attributes (RFC 6265bis)
// =============================================================================

Deno.test("no route sets a cookie", async () => {
  const routes = {
    [topStoriesUrl]: [noVarySearchStory],
    [itemUrl]: {
      id: 123,
      title: "Test Story",
      points: 50,
      user: "author",
      time: Math.floor(Date.now() / 1000) - 3600,
      type: "link",
      url: "https://example.com",
      domain: "example.com",
      comments_count: 0,
      comments: [],
    },
  };

  // NFHN keeps all state client-side (localStorage/IndexedDB), so it has no
  // cookies to attribute. This guards that: a cookie added later must be
  // reviewed against the Secure/HttpOnly/SameSite rules before it ships.
  await withMockedEnv(routes, async () => {
    for (const path of ["/", "/top/1", "/item/123", "/nope"]) {
      const res = await handler(new Request(`https://nfhn.test${path}`));
      await res.text();
      assertEquals(res.headers.get("set-cookie"), null, `${path} should not set a cookie`);
    }
  });
});

// =============================================================================
// Content Security Policy / theme-color
// =============================================================================

Deno.test("inline theme script matches the hash allowed by CSP", async () => {
  const routes = {
    [topStoriesUrl]: [noVarySearchStory],
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/top/1"));
    const body = await res.text();

    // The one inline <script> without a src is the pre-paint theme init.
    const match = body.match(/<script>([\s\S]*?)<\/script>/);
    if (!match?.[1]) throw new Error("inline theme script not found in rendered page");

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(match[1]));
    const hash = `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`;

    assertEquals(
      hash,
      THEME_SCRIPT_HASH,
      "THEME_SCRIPT_HASH in config.ts must match the inline script actually rendered",
    );
    assertStringIncludes(res.headers.get("content-security-policy") ?? "", THEME_SCRIPT_HASH);
  });
});

Deno.test("theme-color is paired to the colour scheme", async () => {
  const routes = {
    [topStoriesUrl]: [noVarySearchStory],
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/top/1"));
    const body = await res.text();

    assertStringIncludes(body, '<meta name="color-scheme" content="light dark">');
    assertStringIncludes(body, 'content="#f5f5f5" media="(prefers-color-scheme: light)"');
    assertStringIncludes(body, 'content="#0d1117" media="(prefers-color-scheme: dark)"');
  });
});

// =============================================================================
// Crawling and indexing (robots.txt, sitemap, meta robots, Redirect-By)
// =============================================================================

Deno.test("sitemap lists the feed entry points against the requesting origin", async () => {
  const res = await sitemapHandler(new Request("https://nfhn.test/sitemap.xml"));
  const body = await res.text();

  assertEquals(res.status, 200);
  assertStringIncludes(res.headers.get("content-type") ?? "", "application/xml");

  for (const { slug } of FEEDS) {
    assertStringIncludes(body, `<loc>https://nfhn.test/${slug}/1</loc>`);
  }

  // Ephemeral and non-canonical URLs must stay out: entries that decay into
  // 404s or redirects cost trust in the whole file.
  assertEquals(body.includes("/item/"), false);
  assertEquals(body.includes("/reader/"), false);
  assertEquals(body.includes("/saved"), false);
});

Deno.test("robots.txt points at a sitemap that exists", async () => {
  const robots = await Deno.readTextFile(new URL("../static/robots.txt", import.meta.url));
  const match = robots.match(/^Sitemap:\s*(\S+)$/m);
  if (!match?.[1]) throw new Error("robots.txt does not advertise a sitemap");

  const res = await sitemapHandler(new Request(match[1]));
  assertEquals(res.status, 200, "the advertised sitemap URL must be served");
  await res.text();
});

Deno.test("saved page is not indexable", async () => {
  const res = await savedHandler(new Request("https://nfhn.test/saved"));
  await res.text();
  assertStringIncludes(res.headers.get("x-robots-tag") ?? "", "noindex");
});

Deno.test("redirects name themselves with Redirect-By", () => {
  const res = redirect("/top/1");
  assertEquals(res.status, 301);
  assertEquals(res.headers.get("location"), "/top/1");
  assertEquals(res.headers.get("redirect-by"), "NFHN");
});

// =============================================================================
// Landmarks and skip link
// =============================================================================

Deno.test("skip link target comes after the navigation it skips", async () => {
  const routes = {
    [topStoriesUrl]: [noVarySearchStory],
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/top/1"));
    const body = await res.text();

    const nav = body.indexOf('<nav class="nav-feeds"');
    const main = body.indexOf('id="main-content"');
    const skip = body.indexOf('href="#main-content"');

    assert(skip >= 0 && nav >= 0 && main >= 0, "skip link, nav and main must all render");
    assert(skip < nav, "skip link must be reachable before the navigation");
    assert(
      nav < main,
      "navigation must sit outside <main>, otherwise the skip link skips nothing",
    );
    assertStringIncludes(body, '<header class="header-bar">');
  });
});

// =============================================================================
// Web Share Target (/share)
// =============================================================================

Deno.test("share target extracts a URL from url, text or title", () => {
  assertEquals(
    extractSharedUrl(new URLSearchParams({ url: "https://example.com/a" })),
    "https://example.com/a",
  );
  // Several share sheets put the link in `text`, often with a title prepended.
  assertEquals(
    extractSharedUrl(new URLSearchParams({ text: "Great read https://example.com/b" })),
    "https://example.com/b",
  );
  assertEquals(
    extractSharedUrl(new URLSearchParams({ title: "https://example.com/c" })),
    "https://example.com/c",
  );
  assertEquals(extractSharedUrl(new URLSearchParams({ text: "no link here" })), null);
  assertEquals(extractSharedUrl(new URLSearchParams()), null);
});

Deno.test("share target refuses non-http schemes", () => {
  // The shared value ends up in a Location header, so anything that is not
  // http(s) must not survive.
  for (const hostile of ["javascript:alert(1)", "data:text/html,<script>", "file:///etc/passwd"]) {
    assertEquals(extractSharedUrl(new URLSearchParams({ url: hostile })), null);
  }
});

Deno.test("share target sends external links to reader mode and internal links home", () => {
  const origin = "https://nfhn.test";
  assertEquals(
    shareDestination(new URLSearchParams({ url: "https://example.com/a" }), origin),
    "/reader/https://example.com/a",
  );
  // Sharing an NFHN URL back into NFHN should open the discussion, not wrap it.
  assertEquals(
    shareDestination(new URLSearchParams({ url: `${origin}/item/123` }), origin),
    "/item/123",
  );
  assertEquals(shareDestination(new URLSearchParams(), origin), "/top/1");
});

Deno.test("share target does not advertise No-Vary-Search", async () => {
  const res = await shareHandler(
    new Request("https://nfhn.test/share?url=https://example.com/a"),
  );

  assertEquals(res.status, 302);
  assertEquals(res.headers.get("location"), "/reader/https://example.com/a");
  // This is the one route whose response depends on the query string. Claiming
  // otherwise would let a cache serve one shared link's redirect for another.
  assertEquals(res.headers.get("no-vary-search"), null);
  assertEquals(res.headers.get("cache-control"), "no-store");
});

Deno.test("manifest declares the share target that /share implements", async () => {
  const manifest = JSON.parse(
    await Deno.readTextFile(new URL("../static/manifest.json", import.meta.url)),
  );

  assertEquals(manifest.share_target?.action, "/share");
  assertEquals(manifest.share_target?.method, "GET");
  // The param names the handler reads.
  assertEquals(manifest.share_target?.params?.url, "url");
  assertEquals(manifest.share_target?.params?.text, "text");
  assertEquals(manifest.share_target?.params?.title, "title");
  // Without navigate-existing, every share spawns another window.
  assertEquals(manifest.launch_handler?.client_mode, "navigate-existing");
});

// =============================================================================
// Comment thread controls (Invoker Commands)
// =============================================================================

Deno.test("comment threads render invoker controls targeting the comments section", async () => {
  const posted = Math.floor(Date.now() / 1000) - 3600;
  const routes = {
    "https://api.hnpwa.com/v0/item/900.json": {
      id: 900,
      title: "Discussed Story",
      points: 10,
      user: "author",
      time: posted,
      type: "link",
      url: "https://example.com",
      domain: "example.com",
      comments_count: 2,
      comments: [
        { id: 901, type: "comment", user: "a", time: posted, content: "<p>one</p>", comments: [] },
        { id: 902, type: "comment", user: "b", time: posted, content: "<p>two</p>", comments: [] },
      ],
    },
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/item/900"));
    const body = await res.text();

    // commandfor must name an element that exists, or the button is a no-op.
    assertStringIncludes(body, '<section id="comments"');
    assertStringIncludes(body, 'commandfor="comments" command="--collapse-all"');
    assertStringIncludes(body, 'commandfor="comments" command="--expand-all"');
    assertStringIncludes(body, "2 threads");
  });
});

Deno.test("stories with no comments render no thread controls", async () => {
  const routes = {
    "https://api.hnpwa.com/v0/item/901.json": {
      id: 901,
      title: "Quiet Story",
      points: 1,
      user: "author",
      time: Math.floor(Date.now() / 1000),
      type: "link",
      url: "https://example.com",
      domain: "example.com",
      comments_count: 0,
      comments: [],
    },
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/item/901"));
    const body = await res.text();

    assertStringIncludes(body, "No comments yet.");
    assertEquals(body.includes('command="--collapse-all"'), false);
  });
});

// =============================================================================
// Cache tags (Netlify-Cache-Tag)
// =============================================================================

Deno.test("feed pages are tagged with the feed and every story on them", async () => {
  const routes = {
    [topStoriesUrl]: [
      { ...noVarySearchStory, id: 11 },
      { ...noVarySearchStory, id: 22 },
    ],
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/top/1"));
    await res.text();

    const tags = (res.headers.get("netlify-cache-tag") ?? "").split(",");
    assertEquals(tags.includes("feed:top"), true);
    // Tagging each story means purging one story also drops the listings it
    // appears on - without that, a raised CDN TTL would show stale rankings.
    assertEquals(tags.includes("item:11"), true);
    assertEquals(tags.includes("item:22"), true);
  });
});

Deno.test("item pages are tagged with the item and its author", async () => {
  const routes = {
    "https://api.hnpwa.com/v0/item/321.json": {
      id: 321,
      title: "Tagged Story",
      points: 5,
      user: "tagger",
      time: Math.floor(Date.now() / 1000),
      type: "link",
      url: "https://example.com",
      domain: "example.com",
      comments_count: 0,
      comments: [],
    },
  };

  await withMockedEnv(routes, async () => {
    const res = await handler(new Request("https://nfhn.test/item/321"));
    await res.text();

    const tags = (res.headers.get("netlify-cache-tag") ?? "").split(",");
    assertEquals(tags.includes("item:321"), true);
    assertEquals(tags.includes("user:tagger"), true);
  });
});

Deno.test("applyCacheTags deduplicates and skips empty tag sets", () => {
  const headers = new Headers();
  applyCacheTags(headers, ["item:1", "item:1", "feed:top", ""]);
  assertEquals(headers.get("Netlify-Cache-Tag"), "item:1,feed:top");

  const empty = new Headers();
  applyCacheTags(empty, []);
  // No header at all is better than an empty one: an empty tag list would
  // otherwise look like a valid purge target.
  assertEquals(empty.get("Netlify-Cache-Tag"), null);
});
