# Netlify Blobs: the persistence layer NFHN doesn't have yet

**Status:** Proposed · **Impact:** 🔥 High · **Effort:** Medium

NFHN is entirely stateless today. Everything it knows lives either in a per-node HTTP cache
(`lib/cache.ts`) that evaporates, or in the visitor's own browser (IndexedDB, `localStorage`, the
service worker's caches). That is an elegant constraint, and it is also why four separate features
are currently either impossible or worse than they need to be.

`@netlify/blobs` works from edge functions and gives a strongly-consistent key/value store with no
provisioning. Four uses, ranked.

## 1. Survive an HN API outage (the best one)

`lib/hn.ts` has a circuit breaker — `CIRCUIT_BREAKER_THRESHOLD = 5` failures, then it opens for 30
seconds. Today an open circuit means the site serves an error page, because there is nothing behind
it. The breaker protects HN from NFHN; it does nothing for NFHN's visitors.

Write every successfully-fetched item and feed through to a blob store, and the open circuit becomes
a *degraded read* instead of an outage:

```ts
const cold = getStore("hn-mirror");

export async function getItem(id: number): Promise<HNAPIItem> {
  if (breaker.isOpen()) {
    const stale = await cold.get(`item:${id}`, { type: "json" });
    if (stale) return { ...stale, _stale: true };   // render an "as of <time>" note
    throw new UpstreamUnavailable();
  }
  const fresh = await fetchFromHN(id);
  cold.setJSON(`item:${id}`, fresh);                 // fire-and-forget under waitUntil
  return fresh;
}
```

HN's API goes down. NFHN staying up and honestly labelled "showing the version from 4 minutes ago" is
a genuinely better product than a 503, and it costs about fifteen lines.

## 2. Cache reader-mode extractions

`reader.ts` (609 lines) fetches an arbitrary third-party URL, runs Readability over it, and throws
the result away. The same HN link gets extracted once per edge node, per cache expiry, for every
reader who opens it — and each miss is a full round trip to someone else's server plus a DOM parse.

Extracted articles are immutable in practice. Key them by the hash of the target URL and keep them:

```ts
const key = `reader:${await sha256Hex(targetUrl)}`;
const hit = await getStore("reader").get(key, { type: "json" });
if (hit) return renderReader(hit);
```

This is also the polite thing to do — right now a popular HN link gets hammered by NFHN once per edge
node. And it makes reader mode work for a site that has since gone down, which for HN links is a
recurring event.

## 3. Cross-device saved stories

`static/sw.js` already carries a full offline sync queue (`SYNC_QUEUE_NAME`, `queueCacheAction`,
`processQueuedActions`, a `sync` event listener) — infrastructure for a server that does not exist.
It queues actions and replays them into a local cache.

A blob store plus an opaque device key (generated client-side, stored in IndexedDB, never an account)
turns that queue into real cross-device sync:

```ts
// PUT /api/saved  — body: the saved-stories set, keyed by an opaque client-generated id
await getStore("saved").setJSON(`device:${deviceKey}`, payload);
```

No accounts, no email, no PII — the key is a random 128-bit value the browser mints and can show as a
"pair another device" code. Worth pairing with [rate limiting](./04-rate-limiting.md), since this is
the first endpoint that accepts writes.

## 4. Storage for the dictionary work

[Proposal 01](./01-compression-dictionary-transport.md) needs somewhere to keep the previous deploy's
`app.js`/`styles.css` bytes and to memoise computed deltas. That is a blob store; there is no other
sensible place for it in this architecture.

## Cost and caveats

- **Writes on the hot path must not block the response.** Wrap them in `context.waitUntil` (see
  [proposal 07](./07-waituntil-and-sec-purpose.md)).
- **Blobs are not a CDN cache.** A blob read is a network hop from the edge node. Keep
  `withProgrammableCache` in front of it; blobs are the L3, not the L1.
- **Retention.** The HN mirror and reader cache grow without bound. Both want a size cap or a sweep,
  which is another job for the scheduled function in [proposal 02](./02-cache-tags-and-purge-api.md).
- **Privacy.** Storing reader extractions means NFHN now holds copies of third-party article text.
  That is a change in posture worth writing down in `llms.txt` and any future privacy page, which the
  full spec review already flagged as an open gap.

## Sources

- [Netlify Blobs + edge functions rate-limiter walkthrough](https://dev.to/reeshee/building-rate-limiter-based-on-ip-address-with-netlify-blobs-and-edge-functions-2bd6)
