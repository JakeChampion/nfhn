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

const encoder = new TextEncoder();

type FeedHandler = (request: Request, pageNumber: number) => Promise<Response>;

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

const parsePositiveInt = (value: string): number | null => {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num) || num < 1) return null;
  return num;
};

// --- Route handlers ---

function createFeedHandler({
  slug,
  emptyTitle,
  emptyDescription,
}: {
  slug: FeedSlug;
  emptyTitle: string;
  emptyDescription: string;
}): FeedHandler {
  return (request, pageNumber) => {
    const requestId = getRequestId(request);
    if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > MAX_PAGE_NUMBER) {
      return Promise.resolve(
        renderErrorPage(
          404,
          "Page not found",
          pageNumber > MAX_PAGE_NUMBER
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
            return renderErrorPage(
              404,
              emptyTitle,
              emptyDescription,
              requestId,
            );
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

const feedRoutes: { slug: FeedSlug; pattern: RegExp; handler: FeedHandler }[] = FEEDS.map((
  { slug, emptyTitle, emptyDescription },
) => ({
  slug,
  pattern: new RegExp(`^/${slug}/(\\d+)$`),
  handler: createFeedHandler({ slug, emptyTitle, emptyDescription }),
}));

const redirectToFirst = (slug: FeedSlug): Response =>
  new Response(null, {
    status: 301,
    headers: applySecurityHeaders(new Headers({ Location: `/${slug}/1` })),
  });

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
        if (!story) {
          return renderErrorPage(
            404,
            "Item not found",
            "That story is unavailable.",
            requestId,
          );
        }
        story.comments = raw.comments ?? [];

        const canonical = computeCanonical(request, `/item/${id}`);
        const response = new HTMLResponse(article(story, canonical));
        applySecurityHeaders(response.headers);
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

// --- Main handler ---

export default async function handler(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === "/") {
      return redirectToFirst("top");
    }

    for (const { slug } of FEEDS) {
      if (path === `/${slug}` || path === `/${slug}/`) {
        return redirectToFirst(slug);
      }
    }

    for (const route of feedRoutes) {
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
      return await route.handler(request, pageNumber);
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
