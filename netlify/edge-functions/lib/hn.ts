// hn.ts
const HN_API_BASE = "https://api.hnpwa.com/v0";
const DEFAULT_TIMEOUT_MS = 4500;
const MAX_RETRIES = 2;

export type FeedSlug = "top" | "ask" | "show" | "jobs";
const FEED_ENDPOINTS: Record<FeedSlug, "news" | "ask" | "show" | "jobs"> = {
  top: "news",
  ask: "ask",
  show: "show",
  jobs: "jobs",
};

export interface HNAPIItem {
  id: number;
  title?: string;
  points?: number;
  user?: string;
  time?: number;
  time_ago?: string;
  comments_count?: number;
  type: string; // "link" | "ask" | "show" | "job" | "comment"
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
  type: string;
  url?: string;
  domain?: string;
  comments: HNAPIItem[]; // nested HNPWA comments tree
  level: number;
  comments_count: number;
}

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
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
  for (let attempt = 0; attempt <= retries; attempt++) {
    const { signal, clear } = timeoutSignal(timeoutMs);
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        console.error(`HN ${label} API error:`, res.status, url);
        if (res.status >= 400 && res.status < 500) break;
        continue;
      }
      return (await res.json()) as T;
    } catch (e) {
      const isLast = attempt === retries;
      console.error(
        `HN ${label} fetch error (attempt ${attempt + 1}/${retries + 1}):`,
        url,
        e,
      );
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
export function mapStoryToItem(raw: HNAPIItem, level = 0): Item {
  const time = raw.time ?? 0;
  const points = typeof raw.points === "number" ? raw.points : null;
  const user = raw.user ?? null;
  const content = raw.content ?? "";
  const commentsCount = typeof raw.comments_count === "number" ? raw.comments_count : 0;
  const domain = raw.domain ?? extractDomain(raw.url);

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
    url: raw.url,
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
): Promise<Item[]> {
  const stories = await fetchJsonWithRetry<HNAPIItem[]>(
    `${HN_API_BASE}/${FEED_ENDPOINTS[feed]}/${pageNumber}.json`,
    feed,
  );
  if (!stories || !Array.isArray(stories) || !stories.length) {
    return [];
  }

  const slice = stories.slice(0, pageSize);
  return slice
    .filter((s) => !!s && !s.deleted && !s.dead)
    .map((s) => mapStoryToItem(s, 0));
}

export function fetchStoriesPage(
  feed: FeedSlug,
  pageNumber: number,
  pageSize = 30,
): Promise<Item[]> {
  return fetchStoriesPageForFeed(feed, pageNumber, pageSize);
}
