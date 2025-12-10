// config.ts - Centralized configuration constants

export const HTML_CACHE_NAME = "nfhn-html";

// Pagination
export const MAX_PAGE_NUMBER = 100;

// Item validation - HN item IDs are sequential; set a reasonable upper bound
// Current max is ~42 million (Dec 2024), allow up to 100 million for growth
export const MAX_ITEM_ID = 100_000_000;

// Feed caching
export const FEED_TTL_SECONDS = 30;
export const FEED_STALE_SECONDS = 300;

// Item caching
export const ITEM_TTL_SECONDS = 60;
export const ITEM_STALE_SECONDS = 600;

// User profile caching
export const USER_TTL_SECONDS = 300;
export const USER_STALE_SECONDS = 3600;

// Circuit breaker settings
export const CIRCUIT_BREAKER_THRESHOLD = 5; // failures before opening
export const CIRCUIT_BREAKER_RESET_MS = 30_000; // 30 seconds

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
] as const;
