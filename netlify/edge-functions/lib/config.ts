// config.ts - Centralized configuration constants

export const HTML_CACHE_NAME = "nfhn-html";

// Canonical public origin.
// Three different hostnames were baked into the repo - robots.txt and
// security.txt said nfhn.netlify.app, the JSON-LD said hn.jakechampion.name,
// and deploys land on a third. Crawlers believe whichever they find first, so
// they now all read from here. Runtime canonical/og URLs are still derived from
// the request where one is available; this is for the places that have no
// request to derive from (static files, structured data).
export const SITE_ORIGIN = "https://hn.jakechampion.name";

// Pagination
export const MAX_PAGE_NUMBER = 100;

// Item validation - HN item IDs are sequential; set a reasonable upper bound
// Current max is ~42 million (Dec 2024), allow up to 100 million for growth
export const MAX_ITEM_ID = 100_000_000;

// Username validation
// HN usernames: alphanumeric plus hyphen and underscore, 2-15 chars
// Note: HN actually allows 1-char usernames but they're very rare
export const USERNAME_MIN_LENGTH = 1;
export const USERNAME_MAX_LENGTH = 15;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{1,15}$/;

// Feed caching
export const FEED_TTL_SECONDS = 30;
export const FEED_STALE_SECONDS = 300;

// Item caching - adaptive based on activity
// Hot items (many comments) get shorter TTL
export const ITEM_TTL_SECONDS = 60;
export const ITEM_STALE_SECONDS = 600;
export const ITEM_HOT_THRESHOLD_COMMENTS = 100; // items with 100+ comments are "hot"
export const ITEM_HOT_TTL_SECONDS = 30; // hot items refresh more often
export const ITEM_COLD_TTL_SECONDS = 300; // old/inactive items cache longer

// User profile caching
export const USER_TTL_SECONDS = 300;
export const USER_STALE_SECONDS = 3600;

// Circuit breaker settings
export const CIRCUIT_BREAKER_THRESHOLD = 5; // failures before opening
export const CIRCUIT_BREAKER_RESET_MS = 30_000; // 30 seconds

// Rate limiting documentation (not enforced at edge, but for reference)
// HN API has informal rate limits; be a good citizen
// Recommended: max 1 request per second per endpoint
// HNPWA API is cached and more lenient
export const RATE_LIMIT_REQUESTS_PER_MINUTE = 60;
export const RATE_LIMIT_BURST = 10;

// SHA-256 hash of the critical theme init inline script in render/pages.ts,
// which applies the stored theme and the matching theme-color before first
// paint. A test hashes the rendered markup and asserts it equals this value, so
// editing the script without updating the hash fails the suite rather than
// silently breaking the page under CSP.
export const THEME_SCRIPT_HASH = "'sha256-6hO62gdSSJDQ6/I94TG7pbIBUb/WZCv/YmMI/Is6yZU='";

// No-Vary-Search (draft-ietf-httpbis-no-vary-search)
// Every route rendered by these edge functions derives its response from the
// path alone - no handler reads request query parameters, and canonical URLs are
// built from the pathname - so no query parameter can change the bytes we send.
// Declaring that lets the browser's HTTP cache and the Speculation Rules
// prefetch/prerender cache reuse the entry for the clean URL when a link arrives
// decorated with utm_*, gclid, fbclid or anything else.
// `key-order` additionally ignores the order parameters appear in.
export const NO_VARY_SEARCH = "params, key-order";

// Open Graph images
// The card itself is rendered as SVG by netlify/edge-functions/og.ts, which
// needs no tooling. Social platforms require a raster, so the tag points at
// Netlify Image CDN to convert it - and whether Image CDN accepts SVG input is
// not documented. Off until that is confirmed on a deploy preview; with it off,
// link previews are exactly as they are today (no image), so enabling it can
// only be an improvement or a no-op.
export const OG_IMAGES_ENABLED = Deno.env.get("NFHN_OG_IMAGES") === "1";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** Image CDN URL that rasterises a story's SVG card. */
export const ogImageUrl = (id: number): string =>
  `/.netlify/images?url=${
    encodeURIComponent(`/og/item/${id}.svg`)
  }&w=${OG_IMAGE_WIDTH}&h=${OG_IMAGE_HEIGHT}&fm=png`;

// Subresource Integrity hashes for the scripts in static/.
//
// These are served by both the main site (render/components.ts) and reader mode,
// so they live here rather than being written out twice. A test hashes the real
// files and fails if any of these drifts - which it silently did once, leaving
// justify.js blocked by SRI and justification quietly switched off site-wide.
export const SRI = {
  texLineBreak: "sha384-Mz2e2ZKHUt95NE5A4Q3jnM4vMi3TW/aI+z0XpUTTtvDOGtOicI7DlGTmCj3yVG0x",
  hyphens: "sha384-O18JzLDtmRj8lMDKjQ/VZOo09Ye41get5V+PDYP1atYLjrMbCO390FdScF4XAZts",
  justify: "sha384-LFQL8gAFwGgZaV8/gZ5sp9uHHdRBqLKdfPJcsapbMTC44HH/KAanKV8fTOlcvLD3",
} as const;

/** Maps each SRI entry to the file it must match. */
export const SRI_FILES: Record<keyof typeof SRI, string> = {
  texLineBreak: "tex-linebreak.js",
  hyphens: "hyphens_en-us.js",
  justify: "justify.js",
};

// Reporting API (https://www.w3.org/TR/reporting-1/)
// The endpoint group named by `Reporting-Endpoints` and by the CSP `report-to`
// directive. Both must agree, so they read from the same constant.
export const REPORTING_GROUP = "default";
export const REPORTING_ENDPOINT = "/_report";

// Integrity-Policy (https://w3c.github.io/webappsec-subresource-integrity/)
// The three justify scripts already carry SRI hashes. This turns that from a
// per-tag habit into a policy: any script without integrity metadata is blocked.
// Report-only first, because the failure mode of getting it wrong is "no
// JavaScript at all" - violations go to the same collector as CSP reports, so a
// missing hash shows up as data rather than as a broken page.
export const INTEGRITY_POLICY_REPORT_ONLY =
  `blocked-destinations=(script), endpoints=(${REPORTING_GROUP})`;

// Trusted Types
// Enforced. This was report-only for as long as static/app.js assigned innerHTML
// in five places - the saved-stories list and the picture-in-picture reader - and
// the report-only policy did its job: "Trusted Type expected, but got String" in
// the console was those exact sinks firing. All five now build DOM nodes instead,
// so there is nothing left to report and nothing left to break.
//
// `trusted-types 'none'` bans creating a policy at all, which is the strongest
// form and the one to keep while no sink needs one. Anything that reintroduces a
// sink fails loudly at the point of the assignment rather than quietly widening
// the XSS surface.
//
// These are spliced into CSP_DIRECTIVES rather than sent as their own header, so
// they inherit that policy's `report-to` and a violation still reaches the
// collector in reports.ts.
export const TRUSTED_TYPES_DIRECTIVES = [
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
] as const;

/**
 * CSP for reader pages.
 *
 * `script-src` previously had no `'self'`, which blocked every same-origin
 * script on the page - the three justification scripts included, so justified
 * text never worked here at all. An explicit `script-src` overrides
 * `default-src` entirely, so inheriting `'self'` from it was never going to
 * happen. It also allowed a third-party CDN that nothing has loaded from in a
 * long time; that allowance is gone.
 *
 * `'unsafe-inline'` remains only for the inline theme script, which has to run
 * before first paint.
 */
export const READER_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src * data:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

// Content Security Policy directives
// Note: unsafe-inline for styles is needed for dynamic counter-set on <ol>
// Script unsafe-inline is replaced with a hash for the critical theme init script
export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "style-src-attr 'none'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  `script-src 'self' ${THEME_SCRIPT_HASH}`,
  "script-src-attr 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "upgrade-insecure-requests",
  ...TRUSTED_TYPES_DIRECTIVES,
  // Violations are posted to the collector in netlify/edge-functions/reports.ts.
  // Without this the strict policy above is unverifiable in the field: the test
  // that pins THEME_SCRIPT_HASH proves the hash matches the markup we render, not
  // that the policy survives contact with extensions and rewriting proxies.
  `report-to ${REPORTING_GROUP}`,
] as const;
