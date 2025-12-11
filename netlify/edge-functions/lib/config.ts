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

// Content Security Policy directives
export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "style-src-attr 'none'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "script-src-attr 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types nfhn",
  "upgrade-insecure-requests",
] as const;
