// hn.ts
const HN_API_BASE = "https://api.hnpwa.com/v0";

// Netlify programmable cache settings
const HN_CACHE_NAME = "nfhn-hn-api";
const TOP_IDS_TTL_SECONDS = 30; // 30s
const ITEM_TTL_SECONDS = 60; // 60s

// HNPWA + legacy HN item shape (superset to keep things flexible)
export interface HNAPIItem {
  id: number;

  // Legacy HN fields (firebase API)
  by?: string;
  time?: number;
  type: string;
  title?: string;
  url?: string;
  text?: string;
  score?: number;
  descendants?: number;
  kids?: number[];
  deleted?: boolean;
  dead?: boolean;
  domain?: string;

  // HNPWA fields
  user?: string;
  points?: number;
  time_ago?: string;
  content?: string;
  comments?: HNAPIItem[];
  level?: number;
  comments_count?: number;
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
  comments: Item[];
  level: number;
  comments_count: number;
}

async function getCache() {
  return caches.open(HN_CACHE_NAME);
}

async function fetchJSONWithNetlifyCache<T>(
  path: string,
  ttlSeconds: number,
): Promise<T | null> {
  const url = `${HN_API_BASE}${path}`;
  const cache = await getCache();
  const request = new Request(url);

  // 1. Cache first
  const cached = await cache.match(request);
  if (cached) {
    try {
      const text = await cached.text();
      return JSON.parse(text) as T;
    } catch (e) {
      console.error("Cached JSON parse error:", path, e);
    }
  }

  // 2. Network
  const res = await fetch(request);
  if (!res.ok) {
    console.error("HN API error:", res.status, path);
    return null;
  }

  const bodyText = await res.text();

  // 3. Put into Netlify cache
  try {
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", `public, max-age=${ttlSeconds}`);
    const cacheResponse = new Response(bodyText, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });

    cache.put(request, cacheResponse).catch((error) => {
      console.error("Failed to put into Netlify cache:", path, error);
    });
  } catch (e) {
    console.error("Error preparing response for cache:", path, e);
  }

  // 4. Parse JSON for this request
  try {
    return JSON.parse(bodyText) as T;
  } catch (e) {
    console.error("HN API JSON parse error:", path, e);
    return null;
  }
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

// Map either HNPWA items or legacy HN items into your internal Item
export function mapStoryToItem(raw: HNAPIItem, level = 0): Item {
  const time = raw.time ?? 0;

  const points =
    typeof raw.points === "number"
      ? raw.points
      : typeof raw.score === "number"
        ? raw.score
        : null;

  const user = raw.user ?? raw.by ?? null;

  const content = raw.content ?? raw.text ?? "";

  const commentsCount =
    typeof raw.comments_count === "number"
      ? raw.comments_count
      : typeof raw.descendants === "number"
        ? raw.descendants
        : 0;

  const domain = raw.domain ?? extractDomain(raw.url);

  return {
    id: raw.id,
    title: raw.title ?? "",
    points,
    user,
    time,
    // Prefer HNPWA's precomputed label if present, otherwise compute
    time_ago: raw.time_ago || formatTimeAgo(time),
    content,
    deleted: raw.deleted,
    dead: raw.dead,
    type: raw.type,
    url: raw.url,
    domain,
    comments: [], // comments are streamed / fetched separately
    level,
    comments_count: commentsCount,
  };
}

// Single item (with comments) from HNPWA
export async function fetchItem(id: number): Promise<HNAPIItem | null> {
  return fetchJSONWithNetlifyCache<HNAPIItem>(
    `/item/${id}.json`,
    ITEM_TTL_SECONDS,
  );
}

// Top stories page from HNPWA
export async function fetchTopStoriesPage(
  pageNumber: number,
  pageSize = 30,
): Promise<Item[]> {
  // HNPWA is already paginated: /news/1.json, /news/2.json, ...
  const stories = await fetchJSONWithNetlifyCache<HNAPIItem[]>(
    `/news/${pageNumber}.json`,
    TOP_IDS_TTL_SECONDS,
  );

  if (!stories || !stories.length) {
    return [];
  }

  const slice = stories.slice(0, pageSize);

  return slice
    .filter(
      (s): s is HNAPIItem =>
        !!s && !s.deleted && !s.dead && s.type === "story",
    )
    .map((s) => mapStoryToItem(s, 0));
}