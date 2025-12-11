// routes.ts - Shared route definitions for edge functions and tests

import type { FeedSlug } from "./hn.ts";

/**
 * Route parameter types for different routes.
 */
export interface FeedParams {
  page: string;
}

export interface ItemParams {
  id: string;
}

export interface UserParams {
  username: string;
}

/**
 * Route patterns for URL matching.
 * These patterns are used both by Netlify edge functions and tests.
 */
export const ROUTE_PATTERNS = {
  /** Feed pages: /top/:page, /newest/:page, etc. */
  feed: /^\/(?<feed>top|newest|ask|show|jobs)\/(?<page>\d+)$/,
  /** Item pages: /item/:id */
  item: /^\/item\/(?<id>\d+)$/,
  /** User pages: /user/:username */
  user: /^\/user\/(?<username>[a-zA-Z0-9_-]+)$/,
  /** Reader mode: /reader/:url */
  reader: /^\/reader\/(.+)$/,
  /** Saved items page */
  saved: /^\/saved$/,
} as const;

/**
 * Redirect patterns for legacy URLs.
 */
export const REDIRECT_PATTERNS: Array<{
  pattern: RegExp;
  redirect: string | ((match: RegExpMatchArray) => string);
  status: 301 | 302;
}> = [
  { pattern: /^\/$/, redirect: "/top/1", status: 301 },
  { pattern: /^\/top$/, redirect: "/top/1", status: 301 },
  { pattern: /^\/newest$/, redirect: "/newest/1", status: 301 },
  { pattern: /^\/ask$/, redirect: "/ask/1", status: 301 },
  { pattern: /^\/show$/, redirect: "/show/1", status: 301 },
  { pattern: /^\/jobs$/, redirect: "/jobs/1", status: 301 },
];

/**
 * Match a path against feed route pattern.
 */
export function matchFeedRoute(path: string): { feed: FeedSlug; page: number } | null {
  const match = path.match(ROUTE_PATTERNS.feed);
  if (!match?.groups?.feed || !match.groups.page) return null;

  const feed = match.groups.feed as FeedSlug;
  const page = parseInt(match.groups.page, 10);

  if (!Number.isFinite(page) || page < 1) return null;

  return { feed, page };
}

/**
 * Match a path against item route pattern.
 */
export function matchItemRoute(path: string): { id: number } | null {
  const match = path.match(ROUTE_PATTERNS.item);
  if (!match?.groups?.id) return null;

  const id = parseInt(match.groups.id, 10);
  if (!Number.isFinite(id) || id < 1) return null;

  return { id };
}

/**
 * Match a path against user route pattern.
 */
export function matchUserRoute(path: string): { username: string } | null {
  const match = path.match(ROUTE_PATTERNS.user);
  if (!match?.groups) return null;

  const username = match.groups.username;
  if (!username) return null;

  return { username };
}

/**
 * Check if a path matches any redirect pattern and return the redirect.
 */
export function matchRedirect(path: string): { location: string; status: 301 | 302 } | null {
  for (const { pattern, redirect, status } of REDIRECT_PATTERNS) {
    const match = path.match(pattern);
    if (match) {
      const location = typeof redirect === "function" ? redirect(match) : redirect;
      return { location, status };
    }
  }
  return null;
}

/**
 * Build a URL for a feed page.
 */
export function feedUrl(feed: FeedSlug, page: number): string {
  return `/${feed}/${page}`;
}

/**
 * Build a URL for an item page.
 */
export function itemUrl(id: number): string {
  return `/item/${id}`;
}

/**
 * Build a URL for a user page.
 */
export function userUrl(username: string): string {
  return `/user/${encodeURIComponent(username)}`;
}

/**
 * Validate a username format.
 * HN usernames: alphanumeric plus hyphen and underscore, 1-15 chars.
 */
export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_-]{1,15}$/.test(username);
}

/**
 * Validate a page number.
 */
export function isValidPageNumber(page: number, maxPage: number): boolean {
  return Number.isFinite(page) && page >= 1 && page <= maxPage;
}

/**
 * Validate an item ID.
 */
export function isValidItemId(id: number, maxId: number): boolean {
  return Number.isFinite(id) && id >= 1 && id <= maxId;
}
