// preview.ts - A story's preview, for the hover card on feed pages.
//
// A feed row tells you a story's title, domain and comment count. What it does
// not tell you is whether the thing is worth opening, which is the question you
// are actually asking when you hover it. This returns the smallest answer to
// that question: one paragraph, from whichever of three sources has one.
//
// It costs nothing extra to produce. The story text and the comment tree are
// already in the item payload the site fetches anyway, and the article excerpt
// is already sitting in the Blobs store that reader mode fills. This route is
// mostly an exercise in not re-fetching things.
//
// See docs/api-proposals/14-invoker-commands.md and
// docs/netlify-proposals/03-netlify-blobs.md

import type { Config, Context } from "@netlify/edge-functions";
import { fetchItem, type HNAPIItem, mapStoryToItem } from "./lib/hn.ts";
import { parsePositiveInt } from "./lib/handlers.ts";
import { waiterFrom } from "./lib/background.ts";
import {
  HN_MIRROR_STORE,
  itemKey,
  READER_STORE,
  readerKey,
  readMirror,
  writeMirror,
} from "./lib/store.ts";
import { applyCacheTags, itemTag } from "./lib/security.ts";
import { ITEM_TTL_SECONDS } from "./lib/config.ts";

/**
 * Characters of preview text.
 *
 * Long enough to tell an essay from a press release, short enough that the card
 * never becomes a thing you have to read rather than glance at.
 */
export const PREVIEW_LENGTH = 280;

export interface Preview {
  id: number;
  title: string;
  domain?: string;
  points: number | null;
  user: string | null;
  time: number;
  comments: number;
  /** The paragraph, or absent when none of the three sources had one. */
  excerpt?: string;
  /** Which source the excerpt came from, so the card can label it honestly. */
  source?: "story" | "article" | "comment";
}

/**
 * Strip tags and collapse whitespace.
 *
 * HN comment and story bodies are HTML fragments. The card renders this as
 * text, never as markup, so this is about legibility rather than safety - but
 * it is also the reason the client sets `textContent` and not `innerHTML`.
 */
export function toPlainText(html: string): string {
  return html
    .replace(/<\/(p|div|li|br)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The handful of entities HN actually emits. Anything else becomes a space. */
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

/**
 * Truncate on a word boundary, with an ellipsis when anything was cut.
 *
 * Cutting mid-word reads as a rendering bug rather than as a deliberate
 * excerpt, and the last partial word carries no information anyway.
 */
export function clip(text: string, limit = PREVIEW_LENGTH): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > limit * 0.6 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

/** The first comment worth showing, depth-first. */
const firstComment = (comments: HNAPIItem[] | undefined): string | undefined => {
  for (const comment of comments ?? []) {
    if (comment.deleted || comment.dead) continue;
    const text = toPlainText(comment.content ?? "");
    if (text.length >= 40) return text;
  }
  return undefined;
};

/**
 * Pick the excerpt.
 *
 * Order matters and it is not arbitrary. The story's own text is what the
 * submitter wrote and is always on topic. The article excerpt is the thing
 * itself, but we only have it when somebody has opened this URL in reader mode.
 * A comment is the weakest of the three - it is one person's reaction, not a
 * description - so it is the fallback rather than the default.
 */
export function chooseExcerpt(
  storyText: string,
  articleExcerpt: string | undefined,
  comments: HNAPIItem[] | undefined,
): Pick<Preview, "excerpt" | "source"> {
  const own = toPlainText(storyText);
  if (own.length >= 40) return { excerpt: clip(own), source: "story" };

  const article = (articleExcerpt ?? "").trim();
  if (article.length >= 40) return { excerpt: clip(article), source: "article" };

  const comment = firstComment(comments);
  if (comment) return { excerpt: clip(comment), source: "comment" };

  return {};
}

const json = (body: unknown, status: number, tags: string[] = []): Response => {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    // Hover is bursty: a reader scanning a feed page can ask for a dozen of
    // these in a few seconds, and the same ones again on the way back up.
    "cache-control": `public, max-age=${ITEM_TTL_SECONDS}`,
    // The CDN can hold it far longer, because the scheduled purge in
    // hn-invalidate.mts drops the tag the moment HN reports the item changed.
    "Netlify-CDN-Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex",
  });
  if (tags.length) applyCacheTags(headers, tags);
  return new Response(JSON.stringify(body), { status, headers });
};

export default async (_request: Request, context: Context): Promise<Response> => {
  const id = parsePositiveInt(context.params.id);
  if (id === null) return json({ error: "bad id" }, 400);

  const waitUntil = waiterFrom(context);

  // The mirror first. It is written on every item page view, so for anything
  // near the top of a feed it is almost always warm, and it means hovering
  // stories does not turn into load on HN's API.
  const mirrored = await readMirror<HNAPIItem>(HN_MIRROR_STORE, itemKey(id));
  let raw = mirrored?.value ?? null;
  if (!raw) {
    raw = await fetchItem(id);
    if (raw && !raw.deleted && !raw.dead) {
      writeMirror(HN_MIRROR_STORE, itemKey(id), raw, waitUntil);
    }
  }

  const story = raw && !raw.deleted && !raw.dead ? mapStoryToItem(raw) : null;
  if (!story) return json({ error: "unavailable" }, 404);

  // Reader mode's extraction cache, when this URL has been through it. No fetch
  // and no parse here: if it is not already stored, there is simply no excerpt
  // from this source, and one of the other two answers.
  let articleExcerpt: string | undefined;
  if (story.url) {
    const cached = await readMirror<{ excerpt?: string }>(
      READER_STORE,
      await readerKey(story.url),
    );
    articleExcerpt = cached?.value?.excerpt;
  }

  const preview: Preview = {
    id: story.id,
    title: story.title,
    domain: story.domain,
    points: story.points,
    user: story.user,
    time: story.time,
    comments: story.comments_count,
    ...chooseExcerpt(story.content, articleExcerpt, raw?.comments),
  };

  return json(preview, 200, [itemTag(story.id)]);
};

export const config: Config = {
  method: ["GET"],
  path: "/api/preview/:id",
  rateLimit: {
    // Higher than a page route: one feed page can legitimately produce a
    // preview request per row as the reader scans down it.
    windowLimit: 300,
    windowSize: 60,
    aggregateBy: "ip",
  },
};
