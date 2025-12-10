// handlers.ts - Shared request handlers for edge functions

import { HTMLResponse } from "./html.ts";
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

/**
 * Parse a string as a positive integer, returning null if invalid.
 */
export const parsePositiveInt = (value: string | undefined): number | null => {
  if (!value) return null;
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num) || num < 1) return null;
  return num;
};

/**
 * Create a redirect response with security headers.
 */
export const redirect = (location: string, status: 301 | 302 = 301): Response =>
  new Response(null, {
    status,
    headers: applySecurityHeaders(new Headers({ Location: location })),
  });

/**
 * Handle a feed page request.
 */
export function handleFeed(
  request: Request,
  slug: FeedSlug,
  pageNumber: number,
  emptyTitle: string,
  emptyDescription: string,
): Promise<Response> {
  const requestId = getRequestId(request);

  if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > MAX_PAGE_NUMBER) {
    return Promise.resolve(renderErrorPage(
      404,
      "Page not found",
      pageNumber > MAX_PAGE_NUMBER
        ? "That page number is too large."
        : "That page number is invalid.",
      requestId,
    ));
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
}

/**
 * Handle an item page request.
 */
export function handleItem(request: Request, id: number): Promise<Response> {
  const requestId = getRequestId(request);

  if (!Number.isFinite(id) || id < 1) {
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

/**
 * Handle a 404 not found request.
 */
export function handleNotFound(request: Request): Response {
  return renderErrorPage(
    404,
    "Page not found",
    "We couldn't find what you're looking for.",
    getRequestId(request),
  );
}
