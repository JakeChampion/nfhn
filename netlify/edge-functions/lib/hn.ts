// hn.ts
import { log } from "./logger.ts";
import { CIRCUIT_BREAKER_RESET_MS, CIRCUIT_BREAKER_THRESHOLD } from "./config.ts";

const HN_API_BASE = "https://api.hnpwa.com/v0";
const DEFAULT_TIMEOUT_MS = 4500;
const MAX_RETRIES = 2;

// --- Circuit breaker state ---

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
};

function checkCircuitBreaker(): boolean {
  if (!circuitBreaker.isOpen) return true;

  const now = Date.now();
  if (now - circuitBreaker.lastFailure > CIRCUIT_BREAKER_RESET_MS) {
    // Reset circuit breaker after timeout
    circuitBreaker.isOpen = false;
    circuitBreaker.failures = 0;
    log.info("Circuit breaker reset", { resetAfterMs: CIRCUIT_BREAKER_RESET_MS });
    return true;
  }

  return false;
}

function recordFailure(): void {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();

  if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreaker.isOpen = true;
    log.warn("Circuit breaker opened", {
      failures: circuitBreaker.failures,
      threshold: CIRCUIT_BREAKER_THRESHOLD,
    });
  }
}

function recordSuccess(): void {
  if (circuitBreaker.failures > 0) {
    circuitBreaker.failures = 0;
    circuitBreaker.isOpen = false;
  }
}

// Export for testing
export function resetCircuitBreaker(): void {
  circuitBreaker.failures = 0;
  circuitBreaker.lastFailure = 0;
  circuitBreaker.isOpen = false;
}

export function getCircuitBreakerState(): { failures: number; isOpen: boolean } {
  return { failures: circuitBreaker.failures, isOpen: circuitBreaker.isOpen };
}

export type FeedSlug = "top" | "newest" | "ask" | "show" | "jobs";
const FEED_ENDPOINTS: Record<FeedSlug, "news" | "newest" | "ask" | "show" | "jobs"> = {
  top: "news",
  newest: "newest",
  ask: "ask",
  show: "show",
  jobs: "jobs",
};

export type ItemType = "ask" | "show" | "tell" | "job" | "link" | "comment";

export interface HNAPIItem {
  id: number;
  title?: string;
  points?: number;
  user?: string;
  time?: number;
  time_ago?: string;
  comments_count?: number;
  type: ItemType; // "link" | "ask" | "show" | "job" | "comment"
  url?: string;
  domain?: string;
  content?: string;
  comments?: HNAPIItem[];
  deleted?: boolean;
  dead?: boolean;
}

export interface Item {
  id: number;
  title: string;
  points: number | null;
  user: string | null;
  time: number;
  time_ago: string;
  content: string;
  deleted?: boolean;
  dead?: boolean;
  type: ItemType;
  url?: string;
  domain?: string;
  comments: HNAPIItem[]; // nested HNPWA comments tree
  level: number;
  comments_count: number;
}

export type StoryItem = Item & { url?: string };

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function normalizeItemUrl(rawUrl: string | undefined, id: number): string | undefined {
  if (!rawUrl) return undefined;

  const trimmed = rawUrl.trim();
  if (!trimmed) return undefined;

  // Treat relative HN discussion links (e.g. "item?id=123") as internal pages
  if (!/^https?:\/\//i.test(trimmed)) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    const isHNItemLink = url.hostname === "news.ycombinator.com" &&
      url.pathname === "/item" &&
      url.searchParams.get("id") === String(id);

    if (isHNItemLink) return undefined;
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;

    return url.href;
  } catch {
    return undefined;
  }
}

function now(): number {
  return Date.now();
}

function timeoutSignal(timeoutMs: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const clear = (): void => clearTimeout(timeout);
  controller.signal.addEventListener("abort", clear);
  return { signal: controller.signal, clear };
}

async function fetchJsonWithRetry<T>(
  url: string,
  label: string,
  retries = MAX_RETRIES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T | null> {
  // Check circuit breaker before making request
  if (!checkCircuitBreaker()) {
    log.warn("Circuit breaker open, skipping request", { url, label });
    return null;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const { signal, clear } = timeoutSignal(timeoutMs);
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        log.error("HN API error", { label, status: res.status, url });
        if (res.status >= 400 && res.status < 500) break;
        recordFailure();
        continue;
      }
      recordSuccess();
      return (await res.json()) as T;
    } catch (e) {
      const isLast = attempt === retries;
      const error = e instanceof Error ? e : new Error(String(e));
      log.error("HN fetch error", {
        label,
        url,
        attempt: attempt + 1,
        maxAttempts: retries + 1,
      }, error);
      recordFailure();
      if (isLast) break;
    } finally {
      clear();
    }
  }
  return null;
}

export function formatTimeAgo(unixSeconds: number | undefined): string {
  if (!unixSeconds) return "";
  const then = unixSeconds * 1000;
  const current = now();
  const diff = Math.max(0, current - then);

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const years = Math.floor(days / 365);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

// Map HNPWA item → internal Item (sans comments)
export function mapStoryToItem(raw: HNAPIItem, level = 0): Item | null {
  if (!raw || typeof raw.id !== "number" || !raw.type) return null;

  const url = normalizeItemUrl(raw.url, raw.id);
  const time = raw.time ?? 0;
  const points = typeof raw.points === "number" ? raw.points : null;
  const user = raw.user ?? null;
  const content = raw.content ?? "";
  const commentsCount = typeof raw.comments_count === "number" ? raw.comments_count : 0;
  const domain = raw.domain ?? extractDomain(url);

  return {
    id: raw.id,
    title: raw.title ?? "",
    points,
    user,
    time,
    time_ago: raw.time_ago || formatTimeAgo(time),
    content,
    deleted: raw.deleted,
    dead: raw.dead,
    type: raw.type,
    url,
    domain,
    comments: [],
    level,
    comments_count: commentsCount,
  };
}

// Single item (with nested comments)
export async function fetchItem(id: number): Promise<HNAPIItem | null> {
  return await fetchJsonWithRetry<HNAPIItem>(
    `${HN_API_BASE}/item/${id}.json`,
    "item",
  );
}

async function fetchStoriesPageForFeed(
  feed: FeedSlug,
  pageNumber: number,
  pageSize = 30,
): Promise<StoryItem[] | null> {
  const stories = await fetchJsonWithRetry<HNAPIItem[]>(
    `${HN_API_BASE}/${FEED_ENDPOINTS[feed]}/${pageNumber}.json`,
    feed,
  );
  if (stories === null || !Array.isArray(stories)) return null;
  if (!stories.length) return [];

  const slice = stories.slice(0, pageSize);
  return slice
    .filter((s) => !!s && !s.deleted && !s.dead)
    .map((s) => mapStoryToItem(s, 0))
    .filter((s): s is StoryItem => !!s);
}

export function fetchStoriesPage(
  feed: FeedSlug,
  pageNumber: number,
  pageSize = 30,
): Promise<StoryItem[] | null> {
  return fetchStoriesPageForFeed(feed, pageNumber, pageSize);
}

// --- User API ---

// Firebase API for user details (includes submitted array)
const HN_FIREBASE_API = "https://hacker-news.firebaseio.com/v0";

export interface HNAPIUser {
  id: string;
  created: number;
  karma: number;
  about?: string;
  submitted?: number[];
}

export interface User {
  id: string;
  created: number;
  created_ago: string;
  karma: number;
  about: string;
  submitted: number[];
}

export async function fetchUser(username: string): Promise<HNAPIUser | null> {
  // Use Firebase API to get user data with submissions
  return await fetchJsonWithRetry<HNAPIUser>(
    `${HN_FIREBASE_API}/user/${encodeURIComponent(username)}.json`,
    "user",
  );
}

export function mapApiUser(raw: HNAPIUser | null): User | null {
  if (!raw || !raw.id) return null;

  return {
    id: raw.id,
    created: raw.created,
    created_ago: formatTimeAgo(raw.created),
    karma: raw.karma ?? 0,
    about: raw.about ?? "",
    submitted: raw.submitted ?? [],
  };
}

// Fetch a single item from Firebase API (for submissions)
interface FirebaseItem {
  id: number;
  type: "story" | "comment" | "job" | "poll" | "pollopt";
  by?: string;
  time?: number;
  title?: string;
  url?: string;
  text?: string;
  score?: number;
  descendants?: number;
  dead?: boolean;
  deleted?: boolean;
}

export async function fetchFirebaseItem(id: number): Promise<FirebaseItem | null> {
  return await fetchJsonWithRetry<FirebaseItem>(
    `${HN_FIREBASE_API}/item/${id}.json`,
    "firebase-item",
  );
}

// Fetch user submissions (stories only) with pagination
export interface SubmissionItem {
  id: number;
  title: string;
  url?: string;
  domain?: string;
  points: number;
  user: string;
  time: number;
  time_ago: string;
  comments_count: number;
}

export async function fetchUserSubmissions(
  submittedIds: number[],
  limit = 10,
): Promise<SubmissionItem[]> {
  const results: SubmissionItem[] = [];

  // Fetch items in parallel (up to limit * 2 to account for filtering)
  const idsToFetch = submittedIds.slice(0, limit * 3);
  const items = await Promise.all(
    idsToFetch.map((id) => fetchFirebaseItem(id)),
  );

  for (const item of items) {
    if (results.length >= limit) break;
    if (!item) continue;
    if (item.type !== "story" && item.type !== "job") continue;
    if (item.dead || item.deleted) continue;
    if (!item.title) continue;

    const domain = extractDomain(item.url);

    results.push({
      id: item.id,
      title: item.title,
      url: item.url,
      domain,
      points: item.score ?? 0,
      user: item.by ?? "",
      time: item.time ?? 0,
      time_ago: formatTimeAgo(item.time),
      comments_count: item.descendants ?? 0,
    });
  }

  return results;
}
