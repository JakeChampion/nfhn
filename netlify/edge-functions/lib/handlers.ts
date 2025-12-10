// handlers.ts - Shared request handlers for edge functions

import { HTMLResponse } from "./html.ts";
import { article, home, userProfile } from "./render.ts";
import { type FeedSlug, fetchItem, fetchStoriesPage, fetchUser, mapApiUser, mapStoryToItem } from "./hn.ts";
import {
  FEED_STALE_SECONDS,
  FEED_TTL_SECONDS,
  HTML_CACHE_NAME,
  ITEM_STALE_SECONDS,
  ITEM_TTL_SECONDS,
  MAX_ITEM_ID,
  MAX_PAGE_NUMBER,
  USER_STALE_SECONDS,
  USER_TTL_SECONDS,
} from "./config.ts";
import { applySecurityHeaders, getRequestId } from "./security.ts";
import { withProgrammableCache } from "./cache.ts";
import { renderErrorPage, renderOfflinePage } from "./errors.ts";
import { log } from "./logger.ts";

const encoder = new TextEncoder();

// --- Performance timing utility ---

/**
 * Add Server-Timing header for performance monitoring.
 */
const addServerTiming = (response: Response, name: string, startTime: number, description?: string): void => {
  const duration = performance.now() - startTime;
  const value = description
    ? `${name};dur=${duration.toFixed(2)};desc="${description}"`
    : `${name};dur=${duration.toFixed(2)}`;
  const existing = response.headers.get("Server-Timing");
  response.headers.set("Server-Timing", existing ? `${existing}, ${value}` : value);
};

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
  const startTime = performance.now();

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
        const fetchStart = performance.now();
        const results = await fetchStoriesPage(slug, pageNumber);
        const fetchDuration = performance.now() - fetchStart;
        
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
        response.headers.set("Server-Timing", `api;dur=${fetchDuration.toFixed(2)};desc="HN API"`);
        addServerTiming(response, "total", startTime, "Total");
        return response;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        log.error("Feed fetch error", { slug, requestId }, error);
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
  const startTime = performance.now();

  if (!Number.isFinite(id) || id < 1 || id > MAX_ITEM_ID) {
    return Promise.resolve(
      renderErrorPage(
        404,
        "Item not found",
        id > MAX_ITEM_ID ? "That item ID is too large." : "That story ID looks invalid.",
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
        const fetchStart = performance.now();
        const raw = await fetchItem(id);
        const fetchDuration = performance.now() - fetchStart;
        
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
        response.headers.set("Server-Timing", `api;dur=${fetchDuration.toFixed(2)};desc="HN API"`);
        addServerTiming(response, "total", startTime, "Total");
        return response;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        log.error("Item fetch error", { itemId: id, requestId }, error);
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

/**
 * Validate username format - alphanumeric and underscores, 1-15 chars.
 */
const isValidUsername = (username: string): boolean => {
  return /^[a-zA-Z0-9_]{1,15}$/.test(username);
};

/**
 * Handle a user profile page request.
 */
export function handleUser(request: Request, username: string): Promise<Response> {
  const requestId = getRequestId(request);
  const startTime = performance.now();

  if (!username || !isValidUsername(username)) {
    return Promise.resolve(
      renderErrorPage(
        404,
        "User not found",
        "That username looks invalid.",
        requestId,
      ),
    );
  }

  return withProgrammableCache(
    request,
    HTML_CACHE_NAME,
    USER_TTL_SECONDS,
    USER_STALE_SECONDS,
    async () => {
      try {
        const fetchStart = performance.now();
        const rawUser = await fetchUser(username);
        const fetchDuration = performance.now() - fetchStart;
        
        const user = mapApiUser(rawUser);
        if (!user) {
          return renderErrorPage(404, "User not found", "That user doesn't exist.", requestId);
        }

        const canonical = new URL(`/user/${username}`, request.url).toString();
        const response = new HTMLResponse(userProfile(user, canonical));
        applySecurityHeaders(response.headers);
        const etag = await generateETag([user.id, user.karma, user.created]);
        const lastModified = new Date(user.created * 1000).toUTCString();
        if (etag) response.headers.set("ETag", etag);
        if (lastModified) response.headers.set("Last-Modified", lastModified);
        response.headers.set("Server-Timing", `api;dur=${fetchDuration.toFixed(2)};desc="HN API"`);
        addServerTiming(response, "total", startTime, "Total");
        return response;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        log.error("User fetch error", { username, requestId }, error);
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