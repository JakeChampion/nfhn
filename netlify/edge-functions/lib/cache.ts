// cache.ts - Programmable cache utilities

import { applySecurityHeaders, getRequestId } from "./security.ts";
import { renderErrorPage } from "./errors.ts";

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
  const headers = applySecurityHeaders(new Headers(response.headers));
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

export const applyConditionalRequest = (request: Request, response: Response): Response => {
  if (request.method !== "GET") return response;
  const etag = response.headers.get("etag");
  const ifNoneMatch = request.headers.get("if-none-match");
  const lastModified = response.headers.get("last-modified");
  const ifModifiedSince = request.headers.get("if-modified-since");

  let notModified = false;

  if (etag && ifNoneMatch) {
    const tags = ifNoneMatch.split(",").map((t) => t.trim());
    if (tags.includes(etag) || tags.includes("*")) {
      notModified = true;
    }
  }

  if (!notModified && lastModified && ifModifiedSince) {
    const sinceTime = Date.parse(ifModifiedSince);
    const lastTime = Date.parse(lastModified);
    if (!Number.isNaN(sinceTime) && !Number.isNaN(lastTime) && sinceTime >= lastTime) {
      notModified = true;
    }
  }

  if (!notModified) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(null, { status: 304, headers });
};

export async function withProgrammableCache(
  request: Request,
  cacheName: string,
  ttlSeconds: number,
  swrSeconds: number,
  producer: () => Promise<Response>,
  offlineFallback?: () => Response,
): Promise<Response> {
  const requestId = getRequestId(request);
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const cachedAge = cached ? ageSeconds(cached) : Infinity;

  const serveFresh = (response: Response): Response => applyConditionalRequest(request, response);

  const revalidateInBackground = (): void => {
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
  };

  const serveStaleAndRevalidate = (stale: Response): Response => {
    revalidateInBackground();
    return serveFresh(stale);
  };

  const cacheAndReturn = (response: Response): Response => {
    const { client, cacheable } = prepareResponses(
      response,
      ttlSeconds,
      swrSeconds,
    );

    cache.put(request, cacheable).catch((err) => {
      console.error("Failed to cache response:", err);
    });

    return serveFresh(client);
  };

  // Fresh hit
  if (cached && cachedAge <= ttlSeconds) {
    return serveFresh(cached);
  }

  // Stale-but-serveable hit: return now and refresh in background
  if (cached && cachedAge <= ttlSeconds + swrSeconds) {
    return serveStaleAndRevalidate(cached);
  }

  // Miss or too stale: fetch fresh
  const fallback = cached ?? null;

  try {
    const response = await producer();

    if (!isCacheable(response)) {
      if (offlineFallback && response.status >= 500) {
        return offlineFallback();
      }
      // Avoid caching errors; fall back to stale if available
      if (fallback) return fallback;
      return response;
    }

    return cacheAndReturn(response);
  } catch (err) {
    console.error("Cache producer threw:", err);
    if (offlineFallback) return offlineFallback();
    if (fallback) return applyConditionalRequest(request, fallback);
    return renderErrorPage(
      500,
      "Something went wrong",
      "Please try again in a moment.",
      requestId,
    );
  }
}
