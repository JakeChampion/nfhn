# Cache tags + Purge API: stop guessing TTLs

**Status:** Proposed · **Impact:** 🔥 High · **Effort:** Medium

## The problem with the current caching strategy

`lib/config.ts` encodes a set of guesses:

```ts
export const FEED_TTL_SECONDS = 30;
export const ITEM_TTL_SECONDS = 60;
export const ITEM_HOT_TTL_SECONDS = 30;   // items with 100+ comments
export const ITEM_COLD_TTL_SECONDS = 300;
```

Every one of those numbers is a trade between staleness and origin load, and every one of them is
wrong most of the time. A 30-second TTL on `/top/1` means the edge re-renders it 2,880 times a day
whether or not the top stories moved — and *still* shows a stale ranking for up to 30 seconds when
they do. The adaptive hot/cold logic is a clever way to be wrong less often, but it is still
open-loop guessing.

The closed-loop version: cache forever, and purge when the data actually changes.

## HN tells you what changed

The Firebase API exposes [`/v0/updates.json`](https://github.com/HackerNews/API#changed-items-and-profiles),
which returns exactly the items and profiles that changed since the last poll:

```json
{ "items": [8423305, 8420805, 8423178], "profiles": ["thefox", "mdda"] }
```

That is a purge list, delivered for free.

## The design

**1. Tag responses as they are rendered.** In `applySecurityHeaders`, or better in the handlers so the
tags can be data-driven:

```ts
// item pages
headers.set("Netlify-Cache-Tag", `item:${id},user:${item.user}`);

// feed pages — tag with the feed *and* every story on it
headers.set("Netlify-Cache-Tag", `feed:${feed},${storyIds.map((id) => `item:${id}`).join(",")}`);
```

`Netlify-Cache-Tag` is stripped from the client response and only affects Netlify's CDN, which is
what we want — these are internal invalidation keys, not something to leak into the public contract.

**2. Cache aggressively.** With purge available, the TTLs become:

```ts
headers.set("Netlify-CDN-Cache-Control", "public, durable, s-maxage=31536000, stale-while-revalidate=60");
headers.set("Cache-Control", "public, max-age=30, stale-while-revalidate=300"); // browser stays modest
```

Split-header caching is the point here: the browser keeps a short TTL (so a user who hits back sees
fresh-ish content without a network trip), while the CDN holds the entry until we explicitly kill it.
`durable` additionally stores it in a globally-accessible secondary cache, so a cold edge node in
Sydney does not re-render a page São Paulo already built.

**3. Purge on change.** A Netlify **scheduled function** (Node, runs on cron) polls `/v0/updates.json`
and purges:

```ts
// netlify/functions/hn-invalidate.mts
import { purgeCache } from "@netlify/functions";
import type { Config } from "@netlify/functions";

export default async () => {
  const { items, profiles } = await (await fetch(
    "https://hacker-news.firebaseio.com/v0/updates.json",
  )).json();

  await purgeCache({
    tags: [
      ...items.map((id: number) => `item:${id}`),
      ...profiles.map((u: string) => `user:${u}`),
    ],
  });
};

export const config: Config = { schedule: "* * * * *" };
```

Feed tags need a slightly different trigger — the ranking changes without any individual item
changing — so poll `/v0/topstories.json` in the same function, hash the first N ids, and purge
`feed:top` only when the hash moves.

## What this buys

| | Today | With tags + purge |
|---|---|---|
| Edge renders of `/top/1` per day | ~2,880 | ~ number of actual ranking changes |
| Worst-case staleness on a changed item | 60s (+300s SWR window) | seconds after the poll |
| Cold edge node in a new region | full re-render | durable cache hit |
| HN API requests | one per TTL expiry per region | one per minute, total |

The last row matters ethically as well as operationally — `config.ts` already carries a note about
being "a good citizen" toward HN's informal rate limits. This design makes NFHN's load on HN
*constant* regardless of traffic, instead of proportional to it.

## Interaction with the existing programmable cache

`withProgrammableCache` (`lib/cache.ts`) stays useful — it is a per-node cache in front of the render,
and its `x-cached-at` / SWR logic is independent. But two things should change:

- Its background revalidation should be dropped in favour of purge-driven invalidation, or at
  minimum wrapped in `context.waitUntil` (see [proposal 07](./07-waituntil-and-sec-purpose.md) — as
  written, the revalidation promise can be killed when the isolate is torn down).
- `cacheKeyFor` already strips the query string to honour `No-Vary-Search`. Keep that; it composes
  fine with cache tags.

## To verify

- **`durable` on Edge Functions.** Netlify's docs carry a caveat that the `durable` directive is not
  supported in some Edge Functions deployment configurations. Confirm against a deploy preview before
  relying on it; the tag-purge design works without `durable`, it just loses the cross-region tier.
- **Purge latency.** Netlify describes tag purges as near-immediate and global; measure it, because
  the whole TTL-reduction argument rests on it.
- **Tag count limits per response.** A 30-story feed page emits 31 tags. Check the header size /
  tag-count ceiling before tagging every story on every feed page.

## Sources

- [Cache-tags and Purge API on Netlify](https://www.netlify.com/blog/cache-tags-and-purge-api-on-netlify/)
- [Advanced caching made easy | Netlify Developers](https://developers.netlify.com/guides/advanced-caching-made-easy/)
- [HackerNews API: changed items and profiles](https://github.com/HackerNews/API#changed-items-and-profiles)
