// handler.ts
import { contents } from "../handlers/icon.ts";
import { HTMLResponse } from "./html.ts";
import { home, article } from "./render.ts";
import {
  fetchTopStoriesPage,
  fetchItem,
  mapStoryToItem,
  HNAPIItem,
} from "./hn.ts";

const redirectToTop1 = (): Response =>
  new Response(null, {
    status: 301,
    headers: { Location: "/top/1" },
  });

async function handleTop(pageNumber: number): Promise<Response> {
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return new Response("Not Found", { status: 404 });
  }

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
}

async function handleItem(id: number): Promise<Response> {
  if (!Number.isFinite(id)) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const raw = await fetchItem(id);
    if (!raw || raw.deleted || raw.dead) {
      return new Response("No such page", { status: 404 });
    }

    const story = mapStoryToItem(raw);
    const rootCommentIds = raw.kids ?? [];

    return new HTMLResponse(article(story, rootCommentIds));
  } catch (e) {
    console.error("Item fetch error:", e);
    return new Response("Hacker News API error", { status: 502 });
  }
}

const ASSET_CACHE_NAME = "nfhn-assets";

async function handleIcon(request: Request): Promise<Response> {
  const cache = await caches.open(ASSET_CACHE_NAME);

  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  // Build the response once
  const baseHeaders = {
    "content-type": "image/svg+xml; charset=utf-8",
    // long-ish TTL, tweak as you like
    "Cache-Control": "public, max-age=86400, immutable",
  };

  const response = new Response(contents, {
    status: 200,
    headers: baseHeaders,
  });

  // Put a clone into the programmable cache
  const cacheable = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(baseHeaders),
  });

  cache.put(request, cacheable).catch((err) => {
    console.error("Failed to cache icon.svg:", err);
  });

  return response;
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
      return handleIcon(request);
    }

    const topMatch = path.match(/^\/top\/(\d+)$/);
    if (topMatch) {
      const pageNumber = Number.parseInt(topMatch[1], 10);
      return await handleTop(pageNumber);
    }

    const itemMatch = path.match(/^\/item\/(\d+)$/);
    if (itemMatch) {
      const id = Number.parseInt(itemMatch[1], 10);
      return await handleItem(id);
    }

    return new Response("Not Found", { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Unhandled error in edge function:", message);
    return new Response("Internal Server Error", { status: 500 });
  }
}