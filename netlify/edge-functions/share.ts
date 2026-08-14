// share.ts - Web Share Target
//
// Registered in manifest.json as the app's share_target, so NFHN appears in the
// OS share sheet. Sharing a link from any app lands here and is handed to reader
// mode; sharing plain text with a URL in it works too, because share sheets are
// inconsistent about which field a URL ends up in.
//
// NOTE: this is the only route on the site whose response depends on a query
// parameter. Every other handler derives its response from the path alone, which
// is what lets lib/security.ts advertise `No-Vary-Search: params, key-order`
// site-wide. Applying those headers here would make that claim false and let a
// cache serve one shared link's redirect for a different shared link, so this
// handler deliberately builds its own headers - the same exemption /reader/*
// already has.
//
// See docs/api-proposals/18-pwa-integration-surface.md

import type { Config } from "@netlify/edge-functions";

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/;

/**
 * Pull a shareable URL out of the share target's parameters.
 *
 * Android puts the link in `url`, but several apps (and iOS Safari) send the
 * whole thing as `text` instead, sometimes with a title prepended.
 */
export const extractSharedUrl = (params: URLSearchParams): string | null => {
  const candidates = [params.get("url"), params.get("text"), params.get("title")];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();

    const direct = parseHttpUrl(trimmed);
    if (direct) return direct;

    const embedded = trimmed.match(URL_IN_TEXT)?.[0];
    if (embedded) {
      const parsed = parseHttpUrl(embedded);
      if (parsed) return parsed;
    }
  }

  return null;
};

const parseHttpUrl = (value: string): string | null => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  // Only http(s). Anything else - javascript:, data:, file: - must not be
  // reflected into a redirect.
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.toString();
};

/**
 * Where a shared value should send the visitor.
 *
 * Same-origin links go to the page itself rather than being wrapped in reader
 * mode; sharing an NFHN item URL back into NFHN should open the discussion.
 */
export const shareDestination = (params: URLSearchParams, origin: string): string => {
  const shared = extractSharedUrl(params);
  if (!shared) return "/top/1";

  const target = new URL(shared);
  if (target.origin === origin) return target.pathname + target.search;

  return `/reader/${shared}`;
};

export default (request: Request): Response => {
  const url = new URL(request.url);
  const location = shareDestination(url.searchParams, url.origin);

  return new Response(null, {
    status: 302,
    headers: {
      "Location": location,
      "Redirect-By": "HN",
      // Never cached, and never advertised as query-independent: the query
      // string *is* the request here.
      "Cache-Control": "no-store",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
};

export const config: Config = {
  method: ["GET"],
  path: "/share",
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: "ip",
  },
};
