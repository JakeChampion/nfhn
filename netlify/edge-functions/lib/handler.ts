// handler.ts
import { escape, HTMLResponse } from "./html.ts";
import { article, home } from "./render.ts";
import { feedConfigs, type FeedConfig, type FeedSlug } from "./feeds.ts";
import { fetchItem, mapStoryToItem } from "./hn.ts";

const HTML_CACHE_NAME = "nfhn-html";
const FEED_TTL_SECONDS = 30;
const FEED_STALE_SECONDS = 300;
const ITEM_TTL_SECONDS = 60;
const ITEM_STALE_SECONDS = 600;
const encoder = new TextEncoder();

const applySecurityHeaders = (headers: Headers): Headers => {
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join("; "),
  );
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );
  return headers;
};

const getRequestId = (request: Request): string | undefined =>
  request.headers.get("x-nf-request-id") ?? undefined;

const computeCanonical = (request: Request, pathname: string): string =>
  new URL(pathname, request.url).toString();

const lastModifiedFromTimes = (times: number[]): string | undefined => {
  const finiteTimes = times.filter((t) => Number.isFinite(t) && t > 0);
  if (!finiteTimes.length) return undefined;
  const max = Math.max(...finiteTimes);
  return new Date(max * 1000).toUTCString();
};

const generateETag = async (parts: Array<string | number>): Promise<string> => {
  const data = encoder.encode(parts.join("|"));
  const hash = await crypto.subtle.digest("SHA-1", data);
  const bytes = Array.from(new Uint8Array(hash));
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `"${hex}"`;
};

const parsePositiveInt = (value: string): number | null => {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num) || num < 1) return null;
  return num;
};

const applyConditionalRequest = (request: Request, response: Response): Response => {
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

const renderErrorPage = (
  status: number,
  title: string,
  description: string,
  requestId?: string,
): Response => {
  const now = new Date();
  const id = requestId ?? crypto.randomUUID();

  const headers = applySecurityHeaders(new Headers());
  return new HTMLResponse(
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escape(title)} | NFHN</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
        background-color: whitesmoke;
        margin: 40px auto;
        max-width: 600px;
        line-height: 1.6;
        font-size: 18px;
        padding: 0 1em;
        color: #333;
        text-align: center;
      }
      h1 { margin-bottom: 0.2em; }
      p { margin-top: 0; }
      a {
        color: inherit;
        text-decoration: none;
        border-bottom: 1px solid rgba(0,0,0,0.2);
      }
      a:hover { border-bottom-color: rgba(0,0,0,0.5); }
    </style>
  </head>
  <body>
    <main aria-live="polite">
      <h1>${escape(title)}</h1>
      <p>${escape(description)}</p>
      <p><a href="/">Return to home</a> &middot; <a href="#" onclick="location.reload();return false;">Retry</a></p>
      <p style="font-size:0.9em; opacity:0.7;">Request ID: ${escape(id)}<br/>${
      escape(
        now.toUTCString(),
      )
    }</p>
    </main>
  </body>
</html>`,
    { status, headers },
  );
};

const renderOfflinePage = (requestId?: string): Response => {
  const now = new Date();
  const id = requestId ?? crypto.randomUUID();
  const headers = applySecurityHeaders(new Headers());
  return new HTMLResponse(
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Offline | NFHN</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background: #f5f5f5;
        color: #333;
        max-width: 600px;
        margin: 40px auto;
        padding: 0 1em;
        text-align: center;
        line-height: 1.6;
      }
      a { color: inherit; text-decoration: none; border-bottom: 1px solid rgba(0,0,0,0.2); }
      a:hover { border-bottom-color: rgba(0,0,0,0.5); }
    </style>
  </head>
  <body>
    <main aria-live="polite">
      <h1>Offline</h1>
      <p>We can't reach Hacker News right now. Please check your connection and try again.</p>
      <p><a href="#" onclick="location.reload();return false;">Retry</a> · <a href="/">Go home</a></p>
      <p style="font-size:0.9em; opacity:0.7;">Request ID: ${escape(id)}<br/>${
      escape(
        now.toUTCString(),
      )
    }</p>
    </main>
  </body>
</html>`,
    { status: 503, headers },
  );
};

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

async function withProgrammableCache(
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

  // Fresh hit
  if (cached && cachedAge <= ttlSeconds) {
    return applyConditionalRequest(request, cached);
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

    return applyConditionalRequest(request, cached);
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

    const { client, cacheable } = prepareResponses(
      response,
      ttlSeconds,
      swrSeconds,
    );

    cache.put(request, cacheable).catch((err) => {
      console.error("Failed to cache response:", err);
    });

    return applyConditionalRequest(request, client);
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

const redirectToFeed1 = (slug: FeedSlug): Response =>
  new Response(null, {
    status: 301,
    headers: applySecurityHeaders(new Headers({ Location: `/${slug}/1` })),
  });

function handleFeed(
  request: Request,
  pageNumber: number,
  config: FeedConfig,
): Promise<Response> {
  const requestId = getRequestId(request);
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return Promise.resolve(
      renderErrorPage(
        404,
        "Page not found",
        "That page number is invalid.",
        requestId,
      ),
    );
  }

  return withProgrammableCache(
    request,
    HTML_CACHE_NAME,
    FEED_TTL_SECONDS,
    FEED_STALE_SECONDS,
    async () => {
      try {
        const results = await config.fetchPage(pageNumber);
        if (!results.length) {
          return renderErrorPage(
            404,
            config.emptyTitle,
            config.emptyDescription,
            requestId,
          );
        }
        const canonical = computeCanonical(request, config.canonicalPath(pageNumber));
        const response = new HTMLResponse(home(results, pageNumber, config.slug, canonical));
        const etag = await generateETag(results.map((r) => r.id));
        const lastModified = lastModifiedFromTimes(results.map((r) => r.time));
        if (etag) response.headers.set("ETag", etag);
        if (lastModified) response.headers.set("Last-Modified", lastModified);
        return response;
      } catch (e) {
        console.error(`${config.logLabel} fetch error:`, e);
        return renderErrorPage(
          502,
          "Hacker News is unavailable",
          "Please try again in a moment.",
          requestId,
        );
      }
    },
    () => renderOfflinePage(requestId),
  );
}

function handleItem(request: Request, id: number): Promise<Response> {
  const requestId = getRequestId(request);
  if (!Number.isFinite(id)) {
    return Promise.resolve(
      renderErrorPage(
        404,
        "Item not found",
        "That story ID looks invalid.",
        requestId,
      ),
    );
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
          return renderErrorPage(
            404,
            "Item not found",
            "That story is unavailable.",
            requestId,
          );
        }

        const story = mapStoryToItem(raw);
        story.comments = raw.comments ?? [];

        const canonical = computeCanonical(request, `/item/${id}`);
        const response = new HTMLResponse(article(story, canonical));
        const etag = await generateETag([
          story.id,
          story.time,
          story.comments_count,
        ]);
        const lastModified = lastModifiedFromTimes([story.time]);
        if (etag) response.headers.set("ETag", etag);
        if (lastModified) response.headers.set("Last-Modified", lastModified);
        return response;
      } catch (e) {
        console.error("Item fetch error:", e);
        return renderErrorPage(
          502,
          "Hacker News is unavailable",
          "Please try again in a moment.",
          requestId,
        );
      }
    },
    () => renderOfflinePage(requestId),
  );
}

export default async function handler(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const defaultFeedSlug: FeedSlug = feedConfigs[0]?.slug ?? "top";

  try {
    if (path === "/") {
      return redirectToFeed1(defaultFeedSlug);
    }

    for (const route of feedConfigs) {
      if (path === `/${route.slug}` || path === `/${route.slug}/`) {
        return redirectToFeed1(route.slug);
      }

      const match = path.match(route.pattern);
      if (!match) continue;
      const pageNumber = parsePositiveInt(match[1]);
      if (pageNumber === null) {
        return renderErrorPage(
          404,
          "Page not found",
          "That page number is invalid.",
          getRequestId(request),
        );
      }
      return await handleFeed(request, pageNumber, route);
    }

    const itemMatch = path.match(/^\/item\/(\d+)$/);
    if (itemMatch) {
      const id = parsePositiveInt(itemMatch[1]);
      if (id === null) {
        return renderErrorPage(
          404,
          "Item not found",
          "That story ID looks invalid.",
          getRequestId(request),
        );
      }
      return await handleItem(request, id);
    }

    return renderErrorPage(
      404,
      "Page not found",
      "We couldn't find what you're looking for.",
      getRequestId(request),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Unhandled error in edge function:", message);
    return renderErrorPage(
      500,
      "Something went wrong",
      "Please try again in a moment.",
      getRequestId(request),
    );
  }
}
