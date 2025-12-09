import handler from "../netlify/edge-functions/lib/handler.ts";
import { assertEquals, assertStringIncludes } from "std/testing/asserts.ts";

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

  const mockFetch = (
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
