# Spec review: four HTTP fields from specification.website

Reviewed 2026-08-09 against four pages of [specification.website](https://specification.website):

| Spec | Site status | NFHN verdict |
| --- | --- | --- |
| [No-Vary-Search](https://specification.website/spec/performance/no-vary-search/) | recommended | **Implemented** |
| [Cookie attributes](https://specification.website/spec/security/cookie-attributes/) | required | **Compliant** — no cookies; now regression-tested |
| [Digest Fields](https://specification.website/spec/security/digest-fields/) | optional | **Not applicable** — see below |
| [Compression Dictionary Transport](https://specification.website/spec/performance/compression-dictionary-transport/) | optional | **Blocked on platform support** |

---

## No-Vary-Search — implemented

`draft-ietf-httpbis-no-vary-search` lets a response declare which query parameters do not change it,
so the browser's HTTP cache and the Speculation Rules prefetch/prerender cache can reuse one entry
across decorated URLs.

This is the highest-value of the four for NFHN, because NFHN already ships Speculation Rules
(`pages.ts`) with `prerender: moderate` and `prefetch: conservative`. Without `No-Vary-Search`, every
prerendered page is thrown away the moment a click arrives carrying `?utm_source=…` — precisely the
waste the spec calls out.

**The directive we send is the strong form:**

```http
No-Vary-Search: params, key-order
```

Bare `params` means *no* query parameter changes the response. That is unusually safe to claim here,
and it is a property of the routing design rather than a bet:

- Every route keys off the path — `/top/:page`, `/item/:id`, `/user/:username`. Feed pagination is a
  path segment, not `?page=`.
- No handler reads `searchParams` from its own request. The only `searchParams` call in the codebase
  (`hn.ts:142`) inspects an *outbound* HN API URL.
- Canonical URLs are built from the pathname (`computeCanonical`), so even the emitted `<link
  rel="canonical">` is query-independent.

So an unknown tracking parameter — `_hsenc`, `mc_eid`, whatever a future campaign tool appends —
collapses correctly without anyone maintaining an allow-list. The spec's warning against listing a
parameter that *does* vary the response is respected by construction; the guard against a future
route quietly growing a meaningful query parameter is the test below.

**Three layers now agree on that claim:**

1. **The header.** Set in `applySecurityHeaders` (`lib/security.ts`), so it covers feeds, items, user
   profiles, `/saved`, error pages and the bare-feed redirects.
2. **The edge cache.** `withProgrammableCache` previously keyed on the full request URL, so
   `/top/1?utm_source=x` missed the entry stored for `/top/1` and re-rendered it. `cacheKeyFor()`
   (`lib/cache.ts`) now strips the query string from the cache key, making the edge behave the way
   the header says it does.
3. **The service worker.** Offline page lookups pass `{ ignoreSearch: true }`, so arriving from an
   email link with UTMs while offline still finds the cached page.

**`/reader/*` is deliberately excluded** from all three. It builds its own headers and does not call
`applySecurityHeaders`, and `pageCacheOptions()` in `sw.js` exempts it. The wrapped article URL can
carry its own query string, which identifies a different article — collapsing those would be the
exact mistake the spec warns about.

> Aside, out of scope for this review: `reader.ts` reads the wrapped URL from `pathname` only, so a
> query string on the target article is currently dropped before the fetch. That is a pre-existing
> bug, not one introduced here, and the exclusion above is written so that fixing it does not create
> a cache-collapse problem.

**Verification**

```bash
curl -sI https://nfhn.netlify.app/top/1 | grep -i ^no-vary-search
# no-vary-search: params, key-order
```

In Chrome DevTools → Application → Speculative loads, prerender `/top/1`, then navigate to
`/top/1?utm_source=newsletter`; it should be logged as a hit rather than a fresh fetch.

Covered by `tests/handler_test.ts` ("pages advertise No-Vary-Search…", "tracking parameters reuse the
cached entry…", "cacheKeyFor drops the query string…") and `tests/sw_test.ts` ("pageCacheOptions…").

## Cookie attributes — compliant, now guarded

The spec is `required` status, and its requirements are conditional on having cookies: `Secure`,
`HttpOnly`, an explicit `SameSite`, `__Host-`/`__Secure-` prefixes for session cookies.

NFHN sets no cookies. All state is client-side — `localStorage` for theme and saved stories,
IndexedDB for the background-sync queue — and there is no login, no session, and no state-changing
endpoint. Every edge function is `method: ["GET"]`. There is nothing to attribute, and the spec's
CSRF caveat (`SameSite` is defence in depth, pair it with tokens or a `Sec-Fetch-Site` check) has
nothing to attach to either.

Compliance by absence is fragile, so it is now a test rather than a fact about today's code:
`tests/handler_test.ts` asserts no route emits `Set-Cookie`. The first cookie anyone adds will fail
that test and force the attribute question at review time.

## Digest Fields — not applicable

RFC 9530's `Content-Digest`/`Repr-Digest` let a client detect corruption in transit. NFHN should not
ship them, for three independent reasons — any one would be sufficient:

1. **Nothing here is a digest-consuming representation.** The spec says to spend the effort on JSON
   APIs, file downloads and machine-readable endpoints, and states plainly that browsers do not
   validate these fields, so adding them to ordinary HTML buys nothing. NFHN serves HTML pages and a
   handful of static assets. There is no JSON API and no download.
2. **It is incompatible with the streaming architecture.** Pages are streamed via async generators
   ([ADR 002](../adr/002-streaming-html.md)); the first bytes are on the wire before the last are
   rendered. A digest requires the complete body up front, so shipping one means buffering every
   page and giving up the TTFB that ADR exists to protect.
3. **We do not control the final encoding.** The spec's first listed mistake is hashing a body that
   something downstream re-encodes. Netlify compresses at the edge, after the edge function returns,
   so any digest we computed would describe bytes the client never receives and every conformant
   validation would fail. specification.website hit the same wall — it notes its own digests stop at
   Markdown because its HTML is brotli-compressed downstream.

Revisit if NFHN ever exposes a JSON or Markdown endpoint for agents; that is the case the spec is
actually aimed at.

## Compression Dictionary Transport — blocked on platform support

RFC 9842 (`Use-As-Dictionary`, `Available-Dictionary`, `dcb`/`dcz`) is a good fit in principle: NFHN
ships versioned static assets where each deploy changes a small fraction of a large file, and the
spec's own framing — pure progressive enhancement, no fallback path to maintain — is accurate.

It is not implementable on this stack today:

- Serving `dcb`/`dcz` means Brotli or Zstandard compression against a caller-supplied custom
  dictionary. Deno's edge runtime exposes no such API, and `CompressionStream` does not take a
  dictionary. There is no way to produce a conformant response body.
- The spec is explicit that this is CDN/edge-layer behaviour and that most sites enable it at the
  CDN. Netlify does not currently negotiate these content codings, so there is nothing to switch on.

**Deliberately not shipping the half we could.** Emitting `Use-As-Dictionary` on `/app.js` and
`/styles.css` is one line, and it would be wrong: it nominates a dictionary we can never use, which
the spec lists as a mistake ("over-broad `match` patterns … wasting a round of negotiation"). The
browser would store the dictionary, offer `Available-Dictionary` on every subsequent request, and get
ordinary `br` back forever.

Two prerequisites for revisiting: Netlify supports the codings (or an edge-side dictionary
compressor becomes available), and the `Vary: Accept-Encoding, Available-Dictionary` requirement can
be honoured — omitting it poisons shared caches with undecodable bodies.

> **Update, 2026-08-10.** Both prerequisites now have candidate answers, so this verdict is being
> re-examined in [`../netlify-proposals/01-compression-dictionary-transport.md`](../netlify-proposals/01-compression-dictionary-transport.md):
> a WASM zstd build (`compressUsingDict`) can produce a conformant `dcz` body inside the edge runtime,
> and `Netlify-Vary: header=Available-Dictionary` keys the CDN cache without the hit-rate collapse a
> blanket `Vary` was expected to cause. The verdict above stands until a spike confirms Netlify's CDN
> passes an unrecognised `Content-Encoding` through untouched — which is the one thing that would make
> all of it moot. The "deliberately not shipping the half we could" rule is unchanged.

> Unrelated observation from this review, not addressed here: `static/` holds committed `.br`, `.gz`
> and `.zst` copies of each asset, but nothing references or serves them. Netlify serves `static/`
> literally and compresses on its own, so `/app.js.br` is reachable only as its own URL. They look
> like dead weight in the repo; worth a separate look.

## Changes made

| File | Change |
| --- | --- |
| `lib/config.ts` | `NO_VARY_SEARCH` constant with the rationale for the bare `params` form |
| `lib/security.ts` | Emit `No-Vary-Search` on every response that gets common headers |
| `lib/cache.ts` | `cacheKeyFor()` — strip the query string from the programmable cache key |
| `static/sw.js` | `pageCacheOptions()` — `ignoreSearch` for page lookups, exempting `/reader/` |
| `tests/handler_test.ts` | Header, cache-reuse, cache-key and no-cookie tests |
| `tests/sw_test.ts` | `pageCacheOptions` logic tests |
