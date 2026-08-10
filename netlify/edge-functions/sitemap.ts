// sitemap.ts - XML sitemap for the stable entry points
//
// robots.txt advertises a sitemap, so one has to exist: a crawler that follows
// the Sitemap: line to a 404 loses trust in the file it did parse.
//
// Only the feed entry points are listed. Story, profile and reader URLs are
// deliberately absent: item ids are unbounded and their pages are as ephemeral
// as Hacker News itself, and a sitemap whose entries decay into 404s is worse
// than a short one. No <lastmod> either - these pages change every few minutes,
// and a timestamp that is always "just now" is noise a crawler cannot schedule
// against.

import type { Config } from "@netlify/edge-functions";
import { FEEDS } from "./lib/feeds.ts";
import { applySecurityHeaders } from "./lib/security.ts";

export default (request: Request): Response => {
  const { origin } = new URL(request.url);

  const urls = FEEDS.map(({ slug }) => `  <url>\n    <loc>${origin}/${slug}/1</loc>\n  </url>`)
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  const headers = new Headers({
    "content-type": "application/xml; charset=utf-8",
    "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  });
  applySecurityHeaders(headers);
  // The CSS preload hint applies to HTML pages, not to XML.
  headers.delete("Link");

  return new Response(body, { status: 200, headers });
};

export const config: Config = {
  method: ["GET"],
  path: "/sitemap.xml",
  cache: "manual",
};
