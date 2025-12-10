// config.ts - Centralized configuration constants

export const HTML_CACHE_NAME = "nfhn-html";

// Feed caching
export const FEED_TTL_SECONDS = 30;
export const FEED_STALE_SECONDS = 300;

// Item caching
export const ITEM_TTL_SECONDS = 60;
export const ITEM_STALE_SECONDS = 600;

// Content Security Policy directives
export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "style-src 'self'",
  "style-src-attr 'none'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types nfhn",
] as const;
