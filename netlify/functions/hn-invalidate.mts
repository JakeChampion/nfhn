// hn-invalidate.mts - Purge cached pages when HN says their data changed.
//
// This is the other half of the cache-tag work. The edge functions label every
// response with the items, feeds and users it was rendered from
// (lib/security.ts); this polls HN for what actually changed and purges exactly
// those tags.
//
// Why it matters: the TTLs in lib/config.ts are guesses, and every one of them
// is wrong most of the time. A 30-second TTL on /top/1 re-renders it 2,880 times
// a day whether or not the ranking moved, and *still* shows a stale ranking for
// up to 30 seconds when it does. Purging on change instead means the CDN TTL can
// be raised without raising staleness, and NFHN's load on HN becomes constant
// rather than proportional to traffic.
//
// See docs/netlify-proposals/02-cache-tags-and-purge-api.md

import { purgeCache } from "@netlify/functions";
import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const HN_API = "https://hacker-news.firebaseio.com/v0";
const STATE_STORE = "invalidation-state";
const RANKING_KEY = "feed-rankings";

/** Feeds NFHN renders, mapped to the Firebase endpoint that ranks them. */
const FEEDS: Record<string, string> = {
  top: "topstories",
  newest: "newstories",
  ask: "askstories",
  show: "showstories",
  jobs: "jobstories",
};

/** Only the first few pages are reachable in the UI; ranking below that is noise. */
const RANKED_DEPTH = 90;

/** Netlify caps how many tags one purge call can carry; batch to stay under it. */
const PURGE_BATCH = 100;

interface Updates {
  items?: number[];
  profiles?: string[];
}

const fetchJson = async <T>(url: string): Promise<T | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
};

/**
 * A feed's identity for change-detection purposes: the ordered ids of the
 * stories that appear on the pages NFHN actually serves.
 *
 * Comparing the whole list rather than a running hash means a story moving from
 * position 4 to 5 counts as a change (it does - the rendered page differs),
 * while churn below RANKED_DEPTH does not.
 */
const rankingSignature = (ids: number[]): string => ids.slice(0, RANKED_DEPTH).join(",");

const purgeInBatches = async (tags: string[]): Promise<number> => {
  const unique = [...new Set(tags)];
  for (let i = 0; i < unique.length; i += PURGE_BATCH) {
    await purgeCache({ tags: unique.slice(i, i + PURGE_BATCH) });
  }
  return unique.length;
};

export default async () => {
  const tags: string[] = [];

  // 1. Items and profiles HN reports as changed since our last poll.
  const updates = await fetchJson<Updates>(`${HN_API}/updates.json`);
  if (updates) {
    for (const id of updates.items ?? []) tags.push(`item:${id}`);
    for (const user of updates.profiles ?? []) tags.push(`user:${user}`);
  }

  // 2. Feed rankings, which change without any individual item changing.
  //    Previous signatures live in Blobs because this function is stateless
  //    between invocations.
  let store: ReturnType<typeof getStore> | null = null;
  let previous: Record<string, string> = {};
  try {
    store = getStore(STATE_STORE);
    previous = (await store.get(RANKING_KEY, { type: "json" }) as Record<string, string>) ?? {};
  } catch {
    // No Blobs available: fall through and purge feeds on every run rather than
    // never. Wasteful, but correct, and it self-corrects once Blobs is back.
    previous = {};
  }

  const current: Record<string, string> = {};
  for (const [slug, endpoint] of Object.entries(FEEDS)) {
    const ids = await fetchJson<number[]>(`${HN_API}/${endpoint}.json`);
    if (!Array.isArray(ids)) continue;

    const signature = rankingSignature(ids);
    current[slug] = signature;
    if (previous[slug] !== signature) tags.push(`feed:${slug}`);
  }

  if (store && Object.keys(current).length) {
    await store.setJSON(RANKING_KEY, { ...previous, ...current });
  }

  if (!tags.length) {
    return new Response("nothing to purge", { status: 200 });
  }

  const purged = await purgeInBatches(tags);
  console.log(JSON.stringify({ message: "purged cache tags", count: purged }));

  return new Response(`purged ${purged} tags`, { status: 200 });
};

export const config: Config = {
  // HN's updates.json reports changes since the last read, so polling more often
  // than the data moves costs nothing but an API call.
  schedule: "* * * * *",
};
