// config.ts - Centralized configuration constants

export const HTML_CACHE_NAME = "nfhn-html";

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

// Reporting API (https://www.w3.org/TR/reporting-1/)
// The endpoint group named by `Reporting-Endpoints` and by the CSP `report-to`
// directive. Both must agree, so they read from the same constant.
export const REPORTING_GROUP = "default";
export const REPORTING_ENDPOINT = "/_report";

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
  // Violations are posted to the collector in netlify/edge-functions/reports.ts.
  // Without this the strict policy above is unverifiable in the field: the test
  // that pins THEME_SCRIPT_HASH proves the hash matches the markup we render, not
  // that the policy survives contact with extensions and rewriting proxies.
  `report-to ${REPORTING_GROUP}`,
] as const;
