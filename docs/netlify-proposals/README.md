# Netlify Platform Proposals for NFHN

Proposals for platform features NFHN does not use yet. Companion to
[`../api-proposals/`](../api-proposals/README.md), which covers browser APIs.

The split is deliberate but leaky: the two most valuable items here
([compression dictionaries](./01-compression-dictionary-transport.md) and
[generated images](./05-generated-images.md)) are browser features that were previously blocked on
platform capabilities, which is why they live on this side.

## Quick reference

| Proposal | Impact | Status | Remaining |
|---|---|---|---|
| [01 Compression Dictionary Transport](./01-compression-dictionary-transport.md) | 🔥 High | **Shipped and enabled** — 97.4% smaller feed pages, 2.8× better than zstd alone | static-asset dictionary; memoise deltas in Blobs |
| [02 Cache tags + Purge API](./02-cache-tags-and-purge-api.md) | 🔥 High | Shipped | raise the CDN TTL once purge latency is measured |
| [03 Netlify Blobs](./03-netlify-blobs.md) | 🔥 High | Shipped (mirror + reader cache) | cross-device saved sync; retention sweep |
| [04 Rate limiting](./04-rate-limiting.md) | Medium (High for `/reader`) | Shipped | validate `/reader` targets against known stories |
| [05 Generated images](./05-generated-images.md) | Medium | Card + maskable icon shipped, `og:image` **behind a flag** | confirm Image CDN accepts SVG; `favicon.ico` |
| [06 Reporting collector](./06-reporting-endpoint.md) | Medium | Shipped | a way to read the collected reports |
| [07 `waitUntil` + `Sec-Purpose`](./07-waituntil-and-sec-purpose.md) | Medium | Shipped | `Sec-Purpose` helpers exist but nothing consumes them yet |
| [08 DNS and transport](./08-dns-and-transport.md) | Medium | Hostname consolidated in code | CAA + DNSSEC at the registrar; HTTPS/SVCB blocked on Netlify HTTP/3 and ECH |

## What NFHN uses today

Before these proposals: Edge Functions, the programmable cache (`caches.open` in `lib/cache.ts`),
redirects in `netlify.toml`, and a build command. That was a small fraction of the platform, and the
gap is where these proposals came from.

Now also in use: Netlify Blobs, cache tags, scheduled functions, rate limiting,
`Netlify-CDN-Cache-Control`, and `context.waitUntil`.

Also in use: `Netlify-Vary`, on every page, to key the CDN cache by `Available-Dictionary`.

Still unused: `context.geo` (nothing about HN is regional) and Image CDN (see 05).

One thing is deliberately **not** switched on — the `og:image` tag, pending confirmation that Image
CDN accepts SVG input. See the "Remaining" column.

## Suggested order

This was the order the work was done in.

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
