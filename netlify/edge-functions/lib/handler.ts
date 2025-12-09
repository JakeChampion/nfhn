// handler.ts
import { contents } from "../handlers/icon.ts";
import { HTMLResponse } from "./html.ts";
import { home, article } from "./render.ts";
import {
  fetchTopStoriesPage,
  fetchItem,
  mapStoryToItem,
} from "./hn.ts";

const HTML_CACHE_NAME = "nfhn-html";
const ASSET_CACHE_NAME = "nfhn-assets";

async function withProgrammableCache(
  request: Request,
  cacheName: string,
  ttlSeconds: number,
  producer: () => Promise<Response>,
): Promise<Response> {
  const cache = await caches.open(cacheName);

  // 1. Cache-first
  const cached = await cache.match(request);
  if (cached) return cached;

  // 2. Produce fresh
  const response = await producer();

  // Only cache "successful" responses
  if (response.status < 200 || response.status >= 300) {
    return response;
  }

  const originalBody = response.body;
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", `public, max-age=${ttlSeconds}`);

  if (!originalBody) {
    const cacheable = new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });

    cache.put(request, cacheable).catch((err) => {
      console.error("Failed to cache (no-body) response:", err);
    });

    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const [bodyForClient, bodyForCache] = originalBody.tee();

  const responseForClient = new Response(bodyForClient, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  const responseForCache = new Response(bodyForCache, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  cache.put(request, responseForCache).catch((err) => {
    console.error("Failed to cache streaming response:", err);
  });

  return responseForClient;
}

const redirectToTop1 = (): Response =>
  new Response(null, {
    status: 301,
    headers: { Location: "/top/1" },
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
    30,
    async () => {
      try {
        const results = await fetchTopStoriesPage(pageNumber);
        if (!results.length) {
          return new Response("No such page", { status: 404 });
        }
        return new HTMLResponse(home(results, pageNumber));
      } catch (e) {
        console.error("Top stories fetch error:", e);
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
    60,
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
    86400,
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

    if (path === "/icon.svg") {
      return await handleIcon(request);
    }

    const topMatch = path.match(/^\/top\/(\d+)$/);
    if (topMatch) {
      const pageNumber = Number.parseInt(topMatch[1], 10);
      return await handleTop(request, pageNumber);
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