# Netlify Platform Proposals for NFHN

Proposals for platform features NFHN does not use yet. Companion to
[`../api-proposals/`](../api-proposals/README.md), which covers browser APIs.

The split is deliberate but leaky: the two most valuable items here
([compression dictionaries](./01-compression-dictionary-transport.md) and
[generated images](./05-generated-images.md)) are browser features that were previously blocked on
platform capabilities, which is why they live on this side.

## Quick reference

| Proposal | Impact | Effort | Blocked on |
|---|---|---|---|
| [01 Compression Dictionary Transport](./01-compression-dictionary-transport.md) | 🔥 High | High | a spike: does the CDN pass `dcz` through? |
| [02 Cache tags + Purge API](./02-cache-tags-and-purge-api.md) | 🔥 High | Medium | — |
| [03 Netlify Blobs](./03-netlify-blobs.md) | 🔥 High | Medium | — |
| [04 Rate limiting](./04-rate-limiting.md) | Medium (High for `/reader`) | Low | — |
| [05 Generated images](./05-generated-images.md) | Medium | Medium | Image CDN SVG support unconfirmed |
| [06 Reporting collector](./06-reporting-endpoint.md) | Medium | Low | needs 03 |
| [07 `waitUntil` + `Sec-Purpose`](./07-waituntil-and-sec-purpose.md) | Medium | Low | — |

## What NFHN uses today

Edge Functions, the programmable cache (`caches.open` in `lib/cache.ts`), redirects in
`netlify.toml`, and a build command. That is a small fraction of the platform, and the gap is where
these proposals come from.

Not used: Blobs, cache tags and the Purge API, `Netlify-Vary`, `Netlify-CDN-Cache-Control` and the
durable cache, scheduled functions, rate limiting, Image CDN, `context.waitUntil`, `context.geo`.

## Suggested order

**1. [`waitUntil`](./07-waituntil-and-sec-purpose.md)** — a live bug: background cache revalidation
can be killed when the isolate is torn down. Small, self-contained, and a prerequisite for anything
else that writes asynchronously.

**2. [Rate limiting](./04-rate-limiting.md)** — one static config block per function, and `/reader/*`
is currently an unmetered fetch proxy running on Netlify's IPs.

**3. [Blobs](./03-netlify-blobs.md)** — the foundation for 01, 05 and 06, and on its own it turns an
HN API outage from a 503 into a stale-but-labelled page.

**4. [Cache tags + purge](./02-cache-tags-and-purge-api.md)** — replaces the TTL guesses in
`config.ts` with invalidation driven by HN's own `/v0/updates.json`. Biggest infrastructure win here.

**5. [Compression dictionaries](./01-compression-dictionary-transport.md)** — start with the spike,
not the code. If Netlify passes `dcz` through, this is the most interesting thing on the list; if it
does not, the review's original "blocked on platform support" verdict stands and nothing is wasted.

**6 and 7.** [Generated images](./05-generated-images.md) and the
[reporting collector](./06-reporting-endpoint.md) close two documented gaps from
[`../spec-reviews/`](../spec-reviews/README.md) — the missing `og:image` and the missing report
endpoint — but neither is on the critical path for anything else.

## Ground rules these follow

The [spec reviews](../spec-reviews/README.md) set a standard worth keeping: *do not ship the half you
can verify if the other half is a guess.* The compression-dictionary review declined to emit
`Use-As-Dictionary` because nominating a dictionary the server cannot use costs the visitor a
download for nothing. Every proposal here names what has to be verified before it becomes code, and
three of them are explicitly blocked pending that check.
