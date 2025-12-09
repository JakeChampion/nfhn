// hn.ts
const HN_API_BASE = "https://api.hnpwa.com/v0";

// Netlify programmable cache settings (still used by HTML, not here)
const HN_CACHE_NAME = "nfhn-hn-api";
const TOP_IDS_TTL_SECONDS = 30; // 30s
const ITEM_TTL_SECONDS = 60; // 60s

// Shape returned by api.hnpwa.com
export interface HNAPIItem {
  id: number;

  // HNPWA fields
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

  // Legacy / firebase-like fields kept for compatibility
  by?: string;
  text?: string;
  score?: number;
  descendants?: number;
  kids?: number[];
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
  comments: Item[] | HNAPIItem[]; // we store the HNPWA comment tree here
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

// Map HNPWA (or legacy-ish) item to your internal Item
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
    // Prefer HNPWA's precomputed label if present
    time_ago: raw.time_ago || formatTimeAgo(time),
    content,
    deleted: raw.deleted,
    dead: raw.dead,
    type: raw.type,
    url: raw.url,
    domain,
    // We fill this later for the top-level story, but for the mapping
    // itself we default to an empty array.
    comments: [],
    level,
    comments_count: commentsCount,
  };
}

// Simple direct fetch for a single item (with nested comments)
export async function fetchItem(id: number): Promise<HNAPIItem | null> {
  try {
    const res = await fetch(`${HN_API_BASE}/item/${id}.json`);
    if (!res.ok) {
      console.error("HN item API error:", res.status, id);
      return null;
    }

    const data = (await res.json()) as HNAPIItem;
    return data;
  } catch (e) {
    console.error("HN item fetch error:", id, e);
    return null;
  }
}

// Fetch a page of top stories from HNPWA
export async function fetchTopStoriesPage(
  pageNumber: number,
  pageSize = 30,
): Promise<Item[]> {
  try {
    const res = await fetch(`${HN_API_BASE}/news/${pageNumber}.json`);

    if (!res.ok) {
      console.error("HN news API error:", res.status, pageNumber);
      return [];
    }

    const stories = (await res.json()) as HNAPIItem[];

    if (!Array.isArray(stories) || !stories.length) {
      return [];
    }

    const slice = stories.slice(0, pageSize);

    return slice
      .filter(
        (s): s is HNAPIItem =>
          !!s && !s.deleted && !s.dead, // keep all non-deleted, non-dead items regardless of type
      )
      .map((s) => mapStoryToItem(s, 0));
  } catch (e) {
    console.error("HN news fetch error:", pageNumber, e);
    return [];
  }
}