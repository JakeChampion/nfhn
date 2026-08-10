// handlers.ts - Shared request handlers for edge functions

import { HTMLResponse } from "./html.ts";
import { article, home, userProfile } from "./render.ts";
import {
  type FeedSlug,
  fetchItem,
  fetchStoriesPage,
  fetchUser,
  fetchUserSubmissions,
  type HNAPIItem,
  mapApiUser,
  mapStoryToItem,
  type StoryItem,
} from "./hn.ts";
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
import {
  applyCacheTags,
  applySecurityHeaders,
  feedTag,
  getRequestId,
  itemTag,
  userTag,
} from "./security.ts";
import { withProgrammableCache } from "./cache.ts";
import { waiterFrom, type WaitUntilCapable } from "./background.ts";
import { feedKey, HN_MIRROR_STORE, itemKey, readMirror, writeMirror } from "./store.ts";
import { encodeWithDictionary } from "./dictionary.ts";
import { renderErrorPage, renderOfflinePage } from "./errors.ts";
import { log } from "./logger.ts";
import {
  APIUnavailableError,
  isNFHNError,
  NotFoundError,
  toNFHNError,
  ValidationError,
} from "./errors/types.ts";

const encoder = new TextEncoder();

// --- Performance timing utility ---

/**
 * Add Server-Timing header for performance monitoring.
 */
const addServerTiming = (
  response: Response,
  name: string,
  startTime: number,
  description?: string,
): void => {
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
    headers: applySecurityHeaders(
      // Redirect-By names the layer that produced the redirect. Netlify's own
      // rules in netlify.toml redirect some of these paths too, so when a chain
      // misbehaves this says which hop was ours.
      new Headers({ "Location": location, "Redirect-By": "NFHN" }),
    ),
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
  context?: WaitUntilCapable,
): Promise<Response> {
  const requestId = getRequestId(request);
  const startTime = performance.now();

  if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > MAX_PAGE_NUMBER) {
    const error = new ValidationError(
      "pageNumber",
      pageNumber,
      pageNumber > MAX_PAGE_NUMBER
        ? "That page number is too large."
        : "That page number is invalid.",
      requestId,
    );
    return Promise.resolve(renderErrorPage(
      error.statusCode,
      error.title,
      error.description,
      requestId,
    ));
  }

  const waitUntil = waiterFrom(context);

  return withProgrammableCache(
    request,
    HTML_CACHE_NAME,
    FEED_TTL_SECONDS,
    FEED_STALE_SECONDS,
    async () => {
      try {
        const fetchStart = performance.now();
        const fresh = await fetchStoriesPage(slug, pageNumber);
        const fetchDuration = performance.now() - fetchStart;

        // HN unreachable: fall back to the durable mirror rather than erroring.
        // Being up and honestly labelled beats a 503, and the mirror is the only
        // thing standing between an HN outage and a dead site.
        let results = fresh;
        let staleSince: number | undefined;
        if (results === null) {
          const mirrored = await readMirror<StoryItem[]>(
            HN_MIRROR_STORE,
            feedKey(slug, pageNumber),
          );
          if (!mirrored?.value?.length) {
            throw new APIUnavailableError(`${slug} feed`, undefined, requestId);
          }
          results = mirrored.value;
          staleSince = mirrored.storedAt;
          log.warn("Serving feed from mirror", { slug, pageNumber, requestId });
        }

        if (!results.length) {
          const error = new NotFoundError("feed", emptyDescription, requestId);
          return renderErrorPage(error.statusCode, emptyTitle, emptyDescription, requestId);
        }

        if (fresh) {
          writeMirror(HN_MIRROR_STORE, feedKey(slug, pageNumber), fresh, waitUntil);
        }

        const canonical = computeCanonical(request, `/${slug}/${pageNumber}`);
        const response = new HTMLResponse(home(results, pageNumber, slug, canonical, staleSince));
        applySecurityHeaders(response.headers);
        // Tagging with every story on the page means a purge of any one of them
        // also drops the listings it appears on, which is what keeps a raised
        // CDN TTL honest.
        applyCacheTags(response.headers, [
          feedTag(slug),
          ...results.map((story) => itemTag(story.id)),
        ]);
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
        const nfhnError = isNFHNError(e) ? e : toNFHNError(e, requestId);
        log.error("Feed fetch error", { slug, requestId }, nfhnError);
        return renderErrorPage(
          nfhnError.statusCode,
          nfhnError.title,
          nfhnError.description,
          requestId,
        );
      }
    },
    () => renderOfflinePage(requestId),
    waiterFrom(context),
  );
}

/**
 * Handle an item page request.
 */
export function handleItem(
  request: Request,
  id: number,
  context?: WaitUntilCapable,
): Promise<Response> {
  const requestId = getRequestId(request);
  const startTime = performance.now();
  const waitUntil = waiterFrom(context);

  if (!Number.isFinite(id) || id < 1 || id > MAX_ITEM_ID) {
    const error = new ValidationError(
      "itemId",
      id,
      id > MAX_ITEM_ID ? "That item ID is too large." : "That story ID looks invalid.",
      requestId,
    );
    return Promise.resolve(
      renderErrorPage(
        error.statusCode,
        error.title,
        error.description,
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
        const fresh = await fetchItem(id);
        const fetchDuration = performance.now() - fetchStart;

        // Same fallback as the feeds: prefer a labelled stale copy over a 503.
        let raw = fresh;
        let staleSince: number | undefined;
        if (!raw) {
          const mirrored = await readMirror<HNAPIItem>(HN_MIRROR_STORE, itemKey(id));
          if (mirrored?.value) {
            raw = mirrored.value;
            staleSince = mirrored.storedAt;
            log.warn("Serving item from mirror", { itemId: id, requestId });
          }
        }

        if (!raw || raw.deleted || raw.dead) {
          const error = new NotFoundError("item", "That story is unavailable.", requestId);
          return renderErrorPage(error.statusCode, error.title, error.description, requestId);
        }

        if (fresh && !fresh.deleted && !fresh.dead) {
          writeMirror(HN_MIRROR_STORE, itemKey(id), fresh, waitUntil);
        }

        const story = mapStoryToItem(raw);
        if (!story) {
          const error = new NotFoundError("item", "That story is unavailable.", requestId);
          return renderErrorPage(error.statusCode, error.title, error.description, requestId);
        }
        story.comments = raw.comments ?? [];

        const canonical = computeCanonical(request, `/item/${id}`);
        const response = new HTMLResponse(article(story, canonical, staleSince));
        applySecurityHeaders(response.headers);
        applyCacheTags(
          response.headers,
          story.user ? [itemTag(story.id), userTag(story.user)] : [itemTag(story.id)],
        );
        const etag = await generateETag([story.id, story.time, story.comments_count]);
        const lastModified = lastModifiedFromTimes([story.time]);
        if (etag) response.headers.set("ETag", etag);
        if (lastModified) response.headers.set("Last-Modified", lastModified);
        response.headers.set("Server-Timing", `api;dur=${fetchDuration.toFixed(2)};desc="HN API"`);
        addServerTiming(response, "total", startTime, "Total");
        return response;
      } catch (e) {
        const nfhnError = isNFHNError(e) ? e : toNFHNError(e, requestId);
        log.error("Item fetch error", { itemId: id, requestId }, nfhnError);
        return renderErrorPage(
          nfhnError.statusCode,
          nfhnError.title,
          nfhnError.description,
          requestId,
        );
      }
    },
    () => renderOfflinePage(requestId),
    waiterFrom(context),
  );
}

/**
 * Handle a 404 not found request.
 */
export function handleNotFound(request: Request): Response {
  const error = new NotFoundError(
    "page",
    "We couldn't find what you're looking for.",
    getRequestId(request),
  );
  return renderErrorPage(
    error.statusCode,
    error.title,
    error.description,
    error.requestId,
  );
}

/**
 * Validate username format - alphanumeric, hyphens, underscores, 1-15 chars.
 * HN usernames follow this pattern.
 */
const isValidUsername = (username: string): boolean => {
  return /^[a-zA-Z0-9_-]{1,15}$/.test(username);
};

/**
 * Handle a user profile page request.
 */
export function handleUser(
  request: Request,
  username: string,
  context?: WaitUntilCapable,
): Promise<Response> {
  const requestId = getRequestId(request);
  const startTime = performance.now();

  if (!username || !isValidUsername(username)) {
    const error = new ValidationError(
      "username",
      username,
      "That username looks invalid.",
      requestId,
    );
    return Promise.resolve(
      renderErrorPage(
        error.statusCode,
        error.title,
        error.description,
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
          const error = new NotFoundError("user", "That user doesn't exist.", requestId);
          return renderErrorPage(error.statusCode, error.title, error.description, requestId);
        }

        // Fetch recent submissions (stories only)
        const submissionsStart = performance.now();
        const submissions = user.submitted.length > 0
          ? await fetchUserSubmissions(user.submitted, 10)
          : [];
        const submissionsDuration = performance.now() - submissionsStart;

        const canonical = new URL(`/user/${username}`, request.url).toString();
        const response = new HTMLResponse(userProfile(user, submissions, canonical));
        applySecurityHeaders(response.headers);
        applyCacheTags(response.headers, [userTag(user.id)]);
        const etag = await generateETag([user.id, user.karma, user.created]);
        const lastModified = new Date(user.created * 1000).toUTCString();
        if (etag) response.headers.set("ETag", etag);
        if (lastModified) response.headers.set("Last-Modified", lastModified);
        response.headers.set(
          "Server-Timing",
          `api;dur=${fetchDuration.toFixed(2)};desc="HN API", submissions;dur=${
            submissionsDuration.toFixed(2)
          };desc="Submissions"`,
        );
        addServerTiming(response, "total", startTime, "Total");
        return response;
      } catch (e) {
        const nfhnError = isNFHNError(e) ? e : toNFHNError(e, requestId);
        log.error("User fetch error", { username, requestId }, nfhnError);
        return renderErrorPage(
          nfhnError.statusCode,
          nfhnError.title,
          nfhnError.description,
          requestId,
        );
      }
    },
    () => renderOfflinePage(requestId),
    waiterFrom(context),
  );
}

/**
 * Apply dictionary compression to a handler's response, if the client can use it.
 *
 * Deliberately wraps the handler from *outside* rather than being folded into
 * one: `withProgrammableCache` keys on the URL alone, so the encode has to
 * happen after the cache, never before it. A `dcz` body in that cache would
 * later be handed to a client that never had the dictionary.
 *
 * @see lib/dictionary.ts
 */
export async function withDictionaryEncoding(
  request: Request,
  pending: Promise<Response> | Response,
): Promise<Response> {
  const response = await pending;
  return await encodeWithDictionary(request, response);
}
