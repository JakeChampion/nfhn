// handler.ts
import { contents } from "../handlers/icon.ts";
import { HTMLResponse } from "./html.ts";
import { home, article } from "./render.ts";
import {
  fetchTopStoriesPage,
  fetchAskStoriesPage,
  fetchShowStoriesPage,
  fetchJobsStoriesPage,
  fetchItem,
  mapStoryToItem,
} from "./hn.ts";

const HTML_CACHE_NAME = "nfhn-html";
const ASSET_CACHE_NAME = "nfhn-assets";
const FEED_TTL_SECONDS = 30;
const FEED_STALE_SECONDS = 300;
const ITEM_TTL_SECONDS = 60;
const ITEM_STALE_SECONDS = 600;
const ICON_TTL_SECONDS = 86400;
const ICON_STALE_SECONDS = 604800;

const cacheControlValue = (ttlSeconds: number, swrSeconds: number): string => {
  const parts = [`public`, `max-age=${ttlSeconds}`];
  if (swrSeconds > 0) parts.push(`stale-while-revalidate=${swrSeconds}`);
  return parts.join(", ");
};

const isCacheable = (response: Response): boolean =>
  response.status >= 200 && response.status < 300;

const ageSeconds = (response: Response): number => {
  const cachedAt = Number.parseInt(
    response.headers.get("x-cached-at") ?? "",
    10,
  );
  if (!Number.isFinite(cachedAt)) return Infinity;
  return (Date.now() - cachedAt) / 1000;
};

const prepareResponses = (
  response: Response,
  ttlSeconds: number,
  swrSeconds: number,
): { client: Response; cacheable: Response } => {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", cacheControlValue(ttlSeconds, swrSeconds));
  headers.set("x-cached-at", Date.now().toString());

  const init: ResponseInit = {
    status: response.status,
    statusText: response.statusText,
    headers,
  };

  if (!response.body) {
    const cacheable = new Response(null, init);
    const client = new Response(null, init);
    return { client, cacheable };
  }

  const [bodyForClient, bodyForCache] = response.body.tee();

  return {
    client: new Response(bodyForClient, init),
    cacheable: new Response(bodyForCache, init),
  };
};

async function withProgrammableCache(
  request: Request,
  cacheName: string,
  ttlSeconds: number,
  swrSeconds: number,
  producer: () => Promise<Response>,
): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const cachedAge = cached ? ageSeconds(cached) : Infinity;

  // Fresh hit
  if (cached && cachedAge <= ttlSeconds) {
    return cached;
  }

  // Stale-but-serveable hit: return now and refresh in background
  if (cached && cachedAge <= ttlSeconds + swrSeconds) {
    producer()
      .then((response) => {
        if (!isCacheable(response)) return;
        const { cacheable } = prepareResponses(
          response,
          ttlSeconds,
          swrSeconds,
        );
        cache.put(request, cacheable).catch((err) => {
          console.error("Failed to update cache in background:", err);
        });
      })
      .catch((err) => {
        console.error("Background revalidation failed:", err);
      });

    return cached;
  }

  // Miss or too stale: fetch fresh
  const fallback = cached ?? null;

  try {
    const response = await producer();

    if (!isCacheable(response)) {
      // Avoid caching errors; fall back to stale if available
      if (fallback) return fallback;
      return response;
    }

    const { client, cacheable } = prepareResponses(
      response,
      ttlSeconds,
      swrSeconds,
    );

    cache.put(request, cacheable).catch((err) => {
      console.error("Failed to cache response:", err);
    });

    return client;
  } catch (err) {
    console.error("Cache producer threw:", err);
    if (fallback) return fallback;
    return new Response("Internal Server Error", { status: 500 });
  }
}

const redirectToTop1 = (): Response =>
  new Response(null, {
    status: 301,
    headers: { Location: "/top/1" },
  });

const redirectToAsk1 = (): Response =>
  new Response(null, {
    status: 301,
    headers: { Location: "/ask/1" },
  });

const redirectToShow1 = (): Response =>
  new Response(null, {
    status: 301,
    headers: { Location: "/show/1" },
  });

const redirectToJobs1 = (): Response =>
  new Response(null, {
    status: 301,
    headers: { Location: "/jobs/1" },
  });

async function handleTop(
  request: Request,
  pageNumber: number,
): Promise<Response> {
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return new Response("Not Found", { status: 404 });
  }

  return withProgrammableCache(
    request,
    HTML_CACHE_NAME,
    FEED_TTL_SECONDS,
    FEED_STALE_SECONDS,
    async () => {
      try {
        const results = await fetchTopStoriesPage(pageNumber);
        if (!results.length) {
          return new Response("No such page", { status: 404 });
        }
        return new HTMLResponse(home(results, pageNumber, "top"));
      } catch (e) {
        console.error("Top stories fetch error:", e);
        return new Response("Hacker News API error", { status: 502 });
      }
    },
  );
}

async function handleAsk(
  request: Request,
  pageNumber: number,
): Promise<Response> {
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return new Response("Not Found", { status: 404 });
  }

  return withProgrammableCache(
    request,
    HTML_CACHE_NAME,
    FEED_TTL_SECONDS,
    FEED_STALE_SECONDS,
    async () => {
      try {
        const results = await fetchAskStoriesPage(pageNumber);
        if (!results.length) {
          return new Response("No such page", { status: 404 });
        }
        return new HTMLResponse(home(results, pageNumber, "ask"));
      } catch (e) {
        console.error("Ask stories fetch error:", e);
        return new Response("Hacker News API error", { status: 502 });
      }
    },
  );
}

async function handleShow(
  request: Request,
  pageNumber: number,
): Promise<Response> {
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return new Response("Not Found", { status: 404 });
  }

  return withProgrammableCache(
    request,
    HTML_CACHE_NAME,
    FEED_TTL_SECONDS,
    FEED_STALE_SECONDS,
    async () => {
      try {
        const results = await fetchShowStoriesPage(pageNumber);
        if (!results.length) {
          return new Response("No such page", { status: 404 });
        }
        return new HTMLResponse(home(results, pageNumber, "show"));
      } catch (e) {
        console.error("Show stories fetch error:", e);
        return new Response("Hacker News API error", { status: 502 });
      }
    },
  );
}

async function handleJobs(
  request: Request,
  pageNumber: number,
): Promise<Response> {
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return new Response("Not Found", { status: 404 });
  }

  return withProgrammableCache(
    request,
    HTML_CACHE_NAME,
    FEED_TTL_SECONDS,
    FEED_STALE_SECONDS,
    async () => {
      try {
        const results = await fetchJobsStoriesPage(pageNumber);
        if (!results.length) {
          return new Response("No such page", { status: 404 });
        }
        return new HTMLResponse(home(results, pageNumber, "jobs"));
      } catch (e) {
        console.error("Jobs stories fetch error:", e);
        return new Response("Hacker News API error", { status: 502 });
      }
    },
  );
}

async function handleItem(request: Request, id: number): Promise<Response> {
  if (!Number.isFinite(id)) {
    return new Response("Not Found", { status: 404 });
  }

  return withProgrammableCache(
    request,
    HTML_CACHE_NAME,
    ITEM_TTL_SECONDS,
    ITEM_STALE_SECONDS,
    async () => {
      try {
        const raw = await fetchItem(id);
        if (!raw || raw.deleted || raw.dead) {
          return new Response("No such page", { status: 404 });
        }

        const story = mapStoryToItem(raw);
        story.comments = raw.comments ?? [];

        return new HTMLResponse(article(story));
      } catch (e) {
        console.error("Item fetch error:", e);
        return new Response("Hacker News API error", { status: 502 });
      }
    },
  );
}

async function handleIcon(request: Request): Promise<Response> {
  return withProgrammableCache(
    request,
    ASSET_CACHE_NAME,
    ICON_TTL_SECONDS,
    ICON_STALE_SECONDS,
    async () =>
      new Response(contents, {
        status: 200,
        headers: {
          "content-type": "image/svg+xml; charset=utf-8",
        },
      }),
  );
}

export default async function handler(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === "/" || path === "/top" || path === "/top/") {
      return redirectToTop1();
    }

    if (path === "/ask" || path === "/ask/") {
      return redirectToAsk1();
    }

    if (path === "/show" || path === "/show/") {
      return redirectToShow1();
    }

    if (path === "/jobs" || path === "/jobs/") {
      return redirectToJobs1();
    }

    if (path === "/icon.svg") {
      return await handleIcon(request);
    }

    const topMatch = path.match(/^\/top\/(\d+)$/);
    if (topMatch) {
      const pageNumber = Number.parseInt(topMatch[1], 10);
      return await handleTop(request, pageNumber);
    }

    const askMatch = path.match(/^\/ask\/(\d+)$/);
    if (askMatch) {
      const pageNumber = Number.parseInt(askMatch[1], 10);
      return await handleAsk(request, pageNumber);
    }

    const showMatch = path.match(/^\/show\/(\d+)$/);
    if (showMatch) {
      const pageNumber = Number.parseInt(showMatch[1], 10);
      return await handleShow(request, pageNumber);
    }

    const jobsMatch = path.match(/^\/jobs\/(\d+)$/);
    if (jobsMatch) {
      const pageNumber = Number.parseInt(jobsMatch[1], 10);
      return await handleJobs(request, pageNumber);
    }

    const itemMatch = path.match(/^\/item\/(\d+)$/);
    if (itemMatch) {
      const id = Number.parseInt(itemMatch[1], 10);
      return await handleItem(request, id);
    }

    return new Response("Not Found", { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Unhandled error in edge function:", message);
    return new Response("Internal Server Error", { status: 500 });
  }
}
