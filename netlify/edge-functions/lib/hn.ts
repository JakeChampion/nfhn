const HN_API_BASE = "https://hacker-news.firebaseio.com/v0";

const HN_CACHE_NAME = "nfhn-hn-api";
const TOP_IDS_TTL_SECONDS = 30; // 30s
const ITEM_TTL_SECONDS = 60; // 60s

export interface HNAPIItem {
  id: number;
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

  const cached = await cache.match(request);
  if (cached) {
    try {
      const text = await cached.text();
      return JSON.parse(text) as T;
    } catch (e) {
      console.error("Cached JSON parse error:", path, e);
    }
  }

  const res = await fetch(request);
  if (!res.ok) {
    console.error("HN API error:", res.status, path);
    return null;
  }

  const bodyText = await res.text();

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

function formatTimeAgo(unixSeconds: number | undefined): string {
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

function mapStoryToItem(
  raw: HNAPIItem,
  level = 0,
  comments: Item[] = [],
): Item {
  const time = raw.time ?? 0;
  return {
    id: raw.id,
    title: raw.title ?? "",
    points: typeof raw.score === "number" ? raw.score : null,
    user: raw.by ?? null,
    time,
    time_ago: formatTimeAgo(time),
    content: raw.text ?? "",
    deleted: raw.deleted,
    dead: raw.dead,
    type: raw.type,
    url: raw.url,
    domain: extractDomain(raw.url),
    comments,
    level,
    comments_count:
      typeof raw.descendants === "number" ? raw.descendants : comments.length,
  };
}

const MAX_COMMENT_DEPTH = 10;
const MAX_COMMENTS_TOTAL = 300;

async function fetchTopIds(): Promise<number[] | null> {
  return fetchJSONWithNetlifyCache<number[]>("/topstories.json", TOP_IDS_TTL_SECONDS);
}

async function fetchItem(id: number): Promise<HNAPIItem | null> {
  return fetchJSONWithNetlifyCache<HNAPIItem>(
    `/item/${id}.json`,
    ITEM_TTL_SECONDS,
  );
}

async function fetchCommentsTree(
  ids: number[] | undefined,
  level: number,
  state: { remaining: number },
): Promise<Item[]> {
  if (!ids || !ids.length || state.remaining <= 0 || level >= MAX_COMMENT_DEPTH) {
    return [];
  }

  const limitedIds = ids.slice(0, state.remaining);
  const results = await Promise.all(limitedIds.map((id) => fetchItem(id)));

  const items: Item[] = [];

  for (const raw of results) {
    if (!raw) continue;
    if (raw.deleted || raw.dead) continue;
    if (raw.type !== "comment") continue;

    if (state.remaining <= 0) break;
    state.remaining -= 1;

    const children = await fetchCommentsTree(raw.kids, level + 1, state);

    const time = raw.time ?? 0;
    const item: Item = {
      id: raw.id,
      title: "",
      points: null,
      user: raw.by ?? null,
      time,
      time_ago: formatTimeAgo(time),
      content: raw.text ?? "",
      deleted: raw.deleted,
      dead: raw.dead,
      type: raw.type,
      url: undefined,
      domain: undefined,
      comments: children,
      level,
      comments_count: children.length,
    };

    items.push(item);

    if (state.remaining <= 0) break;
  }

  return items;
}

export async function fetchStoryWithComments(id: number): Promise<Item | null> {
  const raw = await fetchItem(id);
  if (!raw) return null;
  if (raw.deleted || raw.dead) return null;

  const state = { remaining: MAX_COMMENTS_TOTAL };
  const comments = await fetchCommentsTree(raw.kids, 0, state);

  return mapStoryToItem(raw, 0, comments);
}

export async function fetchTopStoriesPage(
  pageNumber: number,
  pageSize = 30,
): Promise<Item[]> {
  const ids = await fetchTopIds();
  if (!ids || !ids.length) {
    return [];
  }

  const start = (pageNumber - 1) * pageSize;
  const end = start + pageSize;
  const slice = ids.slice(start, end);
  if (!slice.length) {
    return [];
  }

  const stories = await Promise.all(slice.map((id) => fetchItem(id)));

  return stories
    .filter(
      (s): s is HNAPIItem =>
        !!s && !s.deleted && !s.dead && s.type === "story",
    )
    .map((s) => mapStoryToItem(s, 0, []));
}