// saved.ts - Saved stories page (client-rendered from localStorage)
import type { Config, Context } from "@netlify/edge-functions";
import { savedPage } from "./lib/render/pages.ts";
import { htmlToString } from "./lib/html.ts";
import { applySecurityHeaders } from "./lib/security.ts";
import { rememberDeploy } from "./lib/deploy.ts";

export default async (request: Request, context: Context): Promise<Response> => {
  // The head this page renders carries versioned asset URLs. See lib/deploy.ts.
  rememberDeploy(context);
  const url = new URL(request.url);
  const canonicalUrl = `${url.origin}/saved`;

  const body = await htmlToString(savedPage(canonicalUrl));

  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    // Saved page is client-rendered, so minimal caching
    "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    // Nothing here is indexable: the server sends an empty shell and the list is
    // rendered from the visitor's own browser storage. `follow` keeps the nav
    // links in it worth crawling.
    "x-robots-tag": "noindex, follow",
  });
  applySecurityHeaders(headers);

  return new Response(body, {
    status: 200,
    headers,
  });
};

export const config: Config = {
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: "ip",
  },
  method: ["GET"],
  path: "/saved",
  cache: "manual",
};
