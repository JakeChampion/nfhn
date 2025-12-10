import handler from "../netlify/edge-functions/lib/handler.ts";
import { assert, assertEquals, assertStringIncludes } from "std/testing/asserts.ts";

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

      // Wait for background revalidation to complete.
      for (let i = 0; i < 5 && (counts.get(topStoriesUrl) ?? 0) < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      assertEquals(counts.get(topStoriesUrl) ?? 0, 2, "should revalidate in background");
      // Give the background cache put a moment to settle.
      await new Promise((resolve) => setTimeout(resolve, 0));

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
