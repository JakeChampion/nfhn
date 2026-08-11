// security.ts - Security headers utilities

import {
  CSP_DIRECTIVES,
  INTEGRITY_POLICY_REPORT_ONLY,
  NO_VARY_SEARCH,
  REPORTING_ENDPOINT,
  REPORTING_GROUP,
  TRUSTED_TYPES_DIRECTIVES,
} from "./config.ts";
import { applyDictionaryVary, DICTIONARY_TRANSPORT_ENABLED } from "./dictionary.ts";

export const buildContentSecurityPolicy = (): string => {
  return CSP_DIRECTIVES.join("; ");
};

export const applySecurityHeaders = (headers: Headers): Headers => {
  if (!headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", buildContentSecurityPolicy());
  }
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );
  headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  // Tell caches (and the Speculation Rules prefetch cache) that query
  // parameters never change the response for these routes, so a prefetched
  // page still counts as a hit when the click adds tracking parameters.
  headers.set("No-Vary-Search", NO_VARY_SEARCH);
  // Names the collector that the CSP's `report-to` directive refers to, and
  // enables deprecation, intervention and crash reports at the same time.
  headers.set("Reporting-Endpoints", `${REPORTING_GROUP}="${REPORTING_ENDPOINT}"`);
  // Both of these are report-only on purpose - see the comments on the constants
  // in config.ts. They cost nothing in browsers that ignore them and, in the
  // ones that do not, they turn two silent assumptions into reported data.
  headers.set("Integrity-Policy-Report-Only", INTEGRITY_POLICY_REPORT_ONLY);
  if (!headers.has("Content-Security-Policy-Report-Only")) {
    headers.set("Content-Security-Policy-Report-Only", TRUSTED_TYPES_DIRECTIVES.join("; "));
  }
  // Applied to every page, not only the ones actually served as `dcz`. A cache
  // that stored a delta without this would later hand it to a client that never
  // had the dictionary, which cannot decode it. Vary must describe what the
  // response *could* depend on, not what this one happened to use.
  if (DICTIONARY_TRANSPORT_ENABLED) applyDictionaryVary(headers);
  // Early hint for CSS preload - improves LCP by starting CSS download before HTML parsing
  if (!headers.has("Link")) {
    headers.set("Link", "</styles.css>; rel=preload; as=style");
  }
  return headers;
};

export const getRequestId = (request: Request): string | undefined =>
  request.headers.get("x-nf-request-id") ?? undefined;

/**
 * Label a response for tag-based purging.
 *
 * `Netlify-Cache-Tag` is stripped before the response reaches the client and
 * only affects Netlify's CDN, which is what we want: these are internal
 * invalidation keys, not part of the public contract.
 *
 * Tags let the CDN TTL be raised without raising staleness, because the
 * scheduled function in netlify/functions/hn-invalidate.mts purges exactly the
 * items HN reports as changed instead of waiting for a guessed TTL to lapse.
 *
 * @see docs/netlify-proposals/02-cache-tags-and-purge-api.md
 */
export const applyCacheTags = (headers: Headers, tags: string[]): Headers => {
  const unique = [...new Set(tags.filter(Boolean))];
  if (unique.length) headers.set("Netlify-Cache-Tag", unique.join(","));
  return headers;
};

/** Cache tag for a single HN item. */
export const itemTag = (id: number): string => `item:${id}`;

/** Cache tag for a feed listing. */
export const feedTag = (slug: string): string => `feed:${slug}`;

/** Cache tag for a user profile. */
export const userTag = (username: string): string => `user:${username}`;
