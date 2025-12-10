// handler.ts - Main request handler with routing logic

import { HTMLResponse } from "./html.ts";
import { FEEDS } from "./feeds.ts";
import { article, home } from "./render.ts";
import { type FeedSlug, fetchItem, fetchStoriesPage, mapStoryToItem } from "./hn.ts";
import {
  FEED_STALE_SECONDS,
  FEED_TTL_SECONDS,
  HTML_CACHE_NAME,
  ITEM_STALE_SECONDS,
  ITEM_TTL_SECONDS,
  MAX_PAGE_NUMBER,
} from "./config.ts";
import { applySecurityHeaders, getRequestId } from "./security.ts";
import { withProgrammableCache } from "./cache.ts";
import { renderErrorPage, renderOfflinePage } from "./errors.ts";
import { parseIntParam, redirect, route, Router, type RouteParams } from "./router.ts";

const encoder = new TextEncoder();

// --- Utility functions ---

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

// --- Route handlers ---

function handleFeed(
  slug: FeedSlug,
  emptyTitle: string,
  emptyDescription: string,
) {
  return (request: Request, params: RouteParams): Promise<Response> => {
    const requestId = getRequestId(request);
    const pageNumber = parseIntParam(params.page);

    if (pageNumber === null || pageNumber > MAX_PAGE_NUMBER) {
      return Promise.resolve(
        renderErrorPage(
          404,
          "Page not found",
          pageNumber !== null && pageNumber > MAX_PAGE_NUMBER
            ? "That page number is too large."
            : "That page number is invalid.",
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
          const results = await fetchStoriesPage(slug, pageNumber);
          if (results === null) {
            throw new Error(`${slug} feed fetch failed`);
          }
          if (!results.length) {
            return renderErrorPage(404, emptyTitle, emptyDescription, requestId);
          }
          const canonical = computeCanonical(request, `/${slug}/${pageNumber}`);
          const response = new HTMLResponse(home(results, pageNumber, slug, canonical));
          applySecurityHeaders(response.headers);
          const etag = await generateETag(
            results.map((r) =>
              [r.id, r.title, r.domain ?? "", r.comments_count, r.type, r.url ?? ""].join(":")
            ),
          );
          const lastModified = lastModifiedFromTimes(results.map((r) => r.time));
          if (etag) response.headers.set("ETag", etag);
          if (lastModified) response.headers.set("Last-Modified", lastModified);
          return response;
        } catch (e) {
          console.error(`${slug} stories fetch error:`, e);
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
  };
}

function handleItem(request: Request, params: RouteParams): Promise<Response> {
  const requestId = getRequestId(request);
  const id = parseIntParam(params.id);

  if (id === null) {
    return Promise.resolve(
      renderErrorPage(404, "Item not found", "That story ID looks invalid.", requestId),
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
          return renderErrorPage(404, "Item not found", "That story is unavailable.", requestId);
        }

        const story = mapStoryToItem(raw);
        if (!story) {
          return renderErrorPage(404, "Item not found", "That story is unavailable.", requestId);
        }
        story.comments = raw.comments ?? [];

        const canonical = computeCanonical(request, `/item/${id}`);
        const response = new HTMLResponse(article(story, canonical));
        applySecurityHeaders(response.headers);
        const etag = await generateETag([story.id, story.time, story.comments_count]);
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

// --- Router setup ---

const router = new Router();

// Root redirect
router.add("/", () => redirect("/top/1", 301, applySecurityHeaders));

// Feed redirects (bare slug -> /slug/1)
for (const { slug } of FEEDS) {
  router.add(`/${slug}`, () => redirect(`/${slug}/1`, 301, applySecurityHeaders));
}

// Feed pages with pagination
for (const { slug, emptyTitle, emptyDescription } of FEEDS) {
  router.add(`/${slug}/:page`, handleFeed(slug, emptyTitle, emptyDescription));
}

// Item pages
router.add("/item/:id", handleItem);

// Error handlers
router.onNotFound((request) =>
  renderErrorPage(
    404,
    "Page not found",
    "We couldn't find what you're looking for.",
    getRequestId(request),
  )
);

router.onError((error, request) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Unhandled error in edge function:", message);
  return renderErrorPage(
    500,
    "Something went wrong",
    "Please try again in a moment.",
    getRequestId(request),
  );
});

// --- Main handler ---

export default function handler(request: Request): Promise<Response> {
  return router.handle(request);
}

// Export for testing
export { route, Router } from "./router.ts";
