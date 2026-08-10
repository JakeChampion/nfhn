// og.ts - Per-story Open Graph card
//
// The spec review lists a missing og:image as an open gap, so every link to
// NFHN renders as bare text on Slack, Discord, Mastodon and iMessage. A static
// logo card would close it; a per-story card is better, because item URLs are
// what people actually paste.
//
// The card is composed as SVG, which the edge runtime can do with no tooling.
// Turning it into the PNG/JPEG that social platforms require is the part that
// needs the platform - see `og:image` wiring in render/pages.ts and the
// verification note in docs/netlify-proposals/05-generated-images.md.

import type { Config, Context } from "@netlify/edge-functions";
import { fetchItem, mapStoryToItem } from "./lib/hn.ts";
import { escape } from "./lib/html.ts";
import { parsePositiveInt } from "./lib/handlers.ts";
import { MAX_ITEM_ID } from "./lib/config.ts";
import { itemTag } from "./lib/security.ts";

/** Card dimensions. 1.91:1 is what every major platform crops to. */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/**
 * Break a title into lines that fit the card.
 *
 * There is no text measurement in the runtime, so this estimates from an average
 * glyph width for the font size. Intl.Segmenter gives word boundaries that are
 * correct for Japanese and Chinese titles too, which a whitespace split is not.
 */
export function wrapTitle(title: string, maxLines = 4, charsPerLine = 34): string[] {
  const segmenter = new Intl.Segmenter("en", { granularity: "word" });
  // Every segment is kept, whitespace included, so the joined lines still read
  // as the original title. Dropping the separators would run words together.
  const segments = [...segmenter.segment(title)].map(({ segment }) => segment);

  const lines: string[] = [];
  let current = "";

  for (const segment of segments) {
    const candidate = current + segment;
    if (candidate.trim().length > charsPerLine && current.trim()) {
      lines.push(current.trim());
      current = segment.trimStart();
      if (lines.length === maxLines) break;
    } else {
      current = candidate;
    }
  }

  if (lines.length < maxLines && current.trim()) lines.push(current.trim());

  if (lines.length === maxLines) {
    const last = lines[maxLines - 1] ?? "";
    // Only ellipsize if something was actually dropped.
    const rendered = lines.join("").replace(/\s+/g, "");
    const whole = title.replace(/\s+/g, "");
    if (rendered.length < whole.length) {
      lines[maxLines - 1] = last.replace(/[\s.,;:]+$/, "") + "…";
    }
  }

  return lines;
}

export interface CardData {
  title: string;
  points: number;
  user: string | null;
  comments: number;
  domain: string | null;
}

export function renderCard(data: CardData): string {
  const lines = wrapTitle(data.title);
  const lineHeight = 78;
  // Vertically centre the title block in the space above the metadata row.
  const blockTop = 210 - ((lines.length - 1) * lineHeight) / 2;

  const meta = [
    `${data.points} point${data.points === 1 ? "" : "s"}`,
    data.user ? `by ${data.user}` : null,
    `${data.comments} comment${data.comments === 1 ? "" : "s"}`,
  ].filter(Boolean).join("  ·  ");

  const titleLines = lines
    .map((line, index) =>
      `<text x="80" y="${blockTop + index * lineHeight}" class="t">${escape(line)}</text>`
    )
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" role="img" aria-label="${
    escape(data.title)
  }">
  <style>
    .t { font: 700 64px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; fill: #f0f6fc; }
    .m { font: 400 32px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; fill: #8b949e; }
    .b { font: 600 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; fill: #58a6ff; }
  </style>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#0d1117"/>
  <rect x="0" y="0" width="12" height="${OG_HEIGHT}" fill="#ff6600"/>
  <text x="80" y="110" class="b">HN${data.domain ? `  ·  ${escape(data.domain)}` : ""}</text>
    ${titleLines}
  <text x="80" y="540" class="m">${escape(meta)}</text>
</svg>
`;
}

export default async (_request: Request, context: Context): Promise<Response> => {
  const id = parsePositiveInt(context.params.id);
  if (id === null || id > MAX_ITEM_ID) {
    return new Response("Not found", { status: 404 });
  }

  const raw = await fetchItem(id);
  const story = raw && !raw.deleted && !raw.dead ? mapStoryToItem(raw) : null;
  if (!story) {
    return new Response("Not found", { status: 404 });
  }

  const svg = renderCard({
    title: story.title,
    points: story.points ?? 0,
    user: story.user,
    comments: story.comments_count ?? 0,
    domain: story.domain ?? null,
  });

  return new Response(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // Long-lived, and purged by tag when the story's score changes.
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
      "Netlify-CDN-Cache-Control": "public, s-maxage=31536000, stale-while-revalidate=60",
      "Netlify-Cache-Tag": itemTag(id),
      "x-content-type-options": "nosniff",
    },
  });
};

export const config: Config = {
  method: ["GET"],
  path: "/og/item/:id.svg",
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: "ip",
  },
};
