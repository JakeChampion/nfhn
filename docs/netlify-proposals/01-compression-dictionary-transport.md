# Compression Dictionary Transport — unblocking it at the edge

**Status:** Implemented and enabled · **Impact:** 🔥 High · **Effort:** High · **Support:** Chromium 130+ (Firefox in
progress, Safari no signal)

## Why this is worth revisiting

[`docs/spec-reviews/2026-08-specification-website.md`](../spec-reviews/2026-08-specification-website.md)
closed RFC 9842 as **blocked on platform support**, on two grounds:

1. "Deno's edge runtime exposes no such API, and `CompressionStream` does not take a dictionary.
   There is no way to produce a conformant response body."
2. The `Vary: Accept-Encoding, Available-Dictionary` requirement could not be satisfied without
   wrecking the CDN cache.

Both are solvable now, and the review's own reasoning is why this matters more here than on most
sites: **NFHN's pages are nearly identical to each other.** `/top/1` and `/top/2` differ only in
thirty story rows inside a byte-identical shell — same `<head>`, same speculation rules block, same
nav, same footer, same inline theme script. That is the ideal shape for delta compression, and it is
exactly the case plain Brotli cannot exploit because it only ever sees one response at a time.

## Solving problem 1: a dictionary-capable compressor at the edge

The runtime has no *native* dictionary compressor, but it runs WebAssembly.
[`@bokuweb/zstd-wasm`](https://www.npmjs.com/package/@bokuweb/zstd-wasm) exposes
`compressUsingDict()` and ships a Deno distribution that bundles the `.wasm` as base64 in a TS
module — no filesystem, no FFI, which is what Deno Deploy requires.

The `dcz` wire format (RFC 9842 §4.2) is a 40-byte header followed by an ordinary raw-dictionary
zstd frame:

```
Magic_Number:  0x5e 0x2a 0x4d 0x18 0x20 0x00 0x00 0x00   (8 fixed bytes)
Dict_Hash:     SHA-256 of the dictionary bytes            (32 bytes)
Body:          zstd frame compressed against that dictionary as a "raw" dictionary
```

So the whole encoder is:

```ts
// lib/dictionary.ts
import { compressUsingDict, createCCtx, init } from "https://deno.land/x/zstd_wasm/deno/zstd.ts";

const DCZ_MAGIC = new Uint8Array([0x5e, 0x2a, 0x4d, 0x18, 0x20, 0x00, 0x00, 0x00]);

export async function encodeDcz(body: Uint8Array, dict: Uint8Array): Promise<Uint8Array> {
  await init();
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", dict));
  const frame = compressUsingDict(createCCtx(), body, dict, 10);

  const out = new Uint8Array(8 + 32 + frame.length);
  out.set(DCZ_MAGIC, 0);
  out.set(hash, 8);
  out.set(frame, 40);
  return out;
}
```

The client half is already handled by the browser: it sends
`Available-Dictionary: :<base64 sha-256>:` and we check that it matches the dictionary we hold
before emitting `Content-Encoding: dcz`. If it does not match, we fall through to whatever Netlify
would have negotiated anyway. That fallback path is what makes this safe to ship incrementally.

## Solving problem 2: the cache key

`Netlify-Vary` gives fine-grained control over the CDN cache key, including keying on a specific
request header. So the edge sends:

```http
Netlify-Vary: header=Available-Dictionary
Vary: Accept-Encoding, Available-Dictionary
```

`Netlify-Vary` keys Netlify's own cache correctly; `Vary` keys every cache downstream of it. The
review's objection was that a blanket `Vary` on a high-cardinality header would shred the hit rate —
but the cardinality here is *one hash per deployed dictionary*, not one per user. Requests split into
"has our current dictionary" and "does not", which is two cache entries, not thousands.

## Two dictionaries worth shipping

### A. The HTML shell dictionary (the big win)

Serve a purpose-built dictionary at a versioned URL — a rendered `/top/1` is a decent first cut, but
a hand-assembled file containing the shell plus the most common markup fragments compresses better:

```http
# GET /_dict/shell-<build-hash>.txt
Use-As-Dictionary: match="/(top|newest|ask|show|jobs)/*", match-dest=("document"), id="shell-v1", type=raw
Cache-Control: public, max-age=31536000, immutable
```

Every subsequent feed navigation then costs roughly *the story rows only*. On a corpus this
repetitive the delta is typically an order of magnitude smaller than the standalone Brotli response —
[HTTP Toolkit's measurements](https://httptoolkit.com/blog/dictionary-compression-performance-zstd-brotli/)
are the reference point.

Note the `match` pattern deliberately excludes `/reader*`, on the same reasoning the No-Vary-Search
work used: reader pages are arbitrary third-party content and share no structure with the shell.

### B. The static-asset dictionary

`app.js` (34 KB) and `styles.css` (63 KB) change by a few lines per deploy but are re-downloaded
whole. Emit `Use-As-Dictionary` on each, keep **the previous deploy's bytes in Netlify Blobs** keyed
by `DEPLOY_ID`, and delta-compress the new one against whatever the client already has:

```ts
const store = getStore("asset-dictionaries");
const previous = await store.get(`app.js@${clientDictHash}`, { type: "arrayBuffer" });
if (previous) return dczResponse(current, new Uint8Array(previous));
```

`scripts/build.ts` already runs per deploy and already knows `DEPLOY_ID` — it is the natural place to
write the current bytes into the store.

## Cost control

Dictionary compression at request time is real CPU. Do not pay it per request:

- Only compress on a **cache miss**. `withProgrammableCache` already distinguishes these.
- **Memoise the delta** in Netlify Blobs under `(path, dictionary-hash, content-hash)`. The second
  visitor to `/top/2` with the same dictionary gets a blob read, not a zstd run.
- Cap it: skip dictionary encoding above some body size, and skip it entirely when
  `Sec-Purpose: prefetch` says nobody is waiting on the bytes.

## What shipped

The blocking unknown — does Netlify's CDN pass `Content-Encoding: dcz` through untouched? — is
answered: it does, confirmed in production on another site. That was the last thing holding this
back, so it is on by default, with `NFHN_DICTIONARY_TRANSPORT=0` as a kill switch that needs no code
deploy to use.

| Module | Role |
| --- | --- |
| `lib/dictionary.ts` | Wire format, `Available-Dictionary` parsing, negotiation, `encodeWithDictionary` |
| `lib/zstd.ts` | WASM zstd, instantiated lazily and once per isolate |
| `lib/shell-dictionary.ts` | The dictionary itself, built from the real templates |
| `netlify/edge-functions/dictionary.ts` | Serves `/_dict/shell` with `Use-As-Dictionary` |

**The dictionary is a rendered page, not a hand-maintained fragment list.** It is produced by running
the real `home()` template over thirty fixed synthetic stories, so it cannot drift from what the
renderer actually emits. It has to be byte-identical in every isolate in every region — the browser
hashes the bytes it was served and we must reproduce them exactly — which is why the inputs are fixed
and no clock is involved.

**Measured on a realistic `/top/2`** (30 stories, full shell), against the deployed dictionary:

| Encoding | Size | vs uncompressed |
| --- | --- | --- |
| none | 69,395 B | — |
| gzip | 5,779 B | 91.7% smaller |
| zstd, no dictionary | 5,110 B | 92.6% smaller |
| **zstd + dictionary (`dcz`)** | **1,815 B** | **97.4% smaller** |

That is **2.8× smaller than zstd alone**, and the 1,815 B includes the 40-byte `dcz` header. The win
is exactly where the review predicted: the shell is free, and only the story rows cost anything.

## What it took to make any of that real

Every number above was measured in the test suite. In production the feature did not work at all
until four bugs later, and the shape of them is worth more than the numbers.

**1. The `Use-As-Dictionary` header was malformed, so no browser ever stored the dictionary.** The
match pattern was `/(top|newest|ask|show|jobs)/:page(\d+)`, which is wrong twice: `\d` is not a legal
Structured Field String escape, so Chrome could not parse the field at all; and RFC 9842 runs
URLPattern's "has regexp groups" steps on `match` and rejects the offer if they return true, which
both the alternation and the `\d+` do. It is now `/:section/:page` — no regexp groups, and a better
fit anyway, since item and user pages share the same shell.

**2. A drained response body became a 500.** `encodeWithDictionary` read the body, and on failure
returned the *original* response. Netlify re-wraps every response on the way out to apply header
mutations, and `new Response(response.body, …)` throws `ReadableStream is locked or disturbed` on a
consumed stream. This was unreachable while bug 1 existed; fixing bug 1 turned it into a 500 on the
homepage within minutes.

**3. The npm package cannot be imported in an edge function.** Netlify's bundler resolves
`@bokuweb/zstd-wasm` through the **node** export condition, selecting a build whose init is
`readFile(resolve(__dirname, './zstd.wasm'))`. Deno Deploy has no filesystem. This surfaced first as
a missing named export and then as a namespace containing only `default` — both symptoms one layer
above the actual wall, and both chased with a deploy each.

**4. So the browser build is vendored.** `scripts/vendor-zstd.mjs` bundles `dist/web` by file path —
bypassing the `exports` map that hides it — into one ESM module with the wasm inlined as base64. No
filesystem, no second request for the binary, no exports map.

The lesson is the reproduction, not the bugs. `@netlify/edge-bundler` is an npm package and Deno runs
locally, so **the entire pipeline can be verified before deploying**: bundle the real edge functions
with Netlify's own bundler and check the eszip, then run the real encode path under `deno run` with
no permissions at all, which is the closest local approximation of Deno Deploy. Doing that takes two
minutes and would have caught bugs 3 and 4 without a single deploy. It is now how this is checked.

Measured that way, through the repo's real `encodeWithDictionary` on a rendered `/top/2`:

```
Content-Encoding: dcz
valid dcz framing: true
plain 69,926 bytes -> 836 bytes   (98.8% smaller)
```

## Two things that were easy to get wrong

**The encode must happen outside the cache.** `withProgrammableCache` keys on the URL alone, so a
`dcz` body stored in it would later be served to a client that never had the dictionary — an
undecodable response. `withDictionaryEncoding()` therefore wraps the handler from the outside: the
cache always holds plain HTML, and the delta is computed per request against whatever dictionary that
particular client advertised.

**`Vary` goes on every page, not only the encoded ones.** A cache that stored a delta without it
would hand that delta to a client with no dictionary. `Vary` has to describe what the response
*could* depend on, not what this particular one happened to use, so `applySecurityHeaders` sets it
unconditionally while the feature is on.

Every failure path returns the response unencoded. A missed optimisation is invisible; a corrupted
body is not.

## Still worth doing

- **Memoising deltas in Blobs**, so a second visitor to `/top/2` with the same dictionary gets a blob
  read rather than a zstd run.
- **Trimming the vendored bundle.** It is 350 KB, most of it the base64 wasm, parsed lazily on the
  first dictionary-capable request in an isolate. A build with only the compression half would be a
  good deal smaller.

The static-asset dictionary (section B) and skipping the encode for `Sec-Purpose: prefetch` are both
done — see `netlify/edge-functions/asset.ts` and `lib/background.ts`.

## Sources

- [RFC 9842: Compression Dictionary Transport](https://www.rfc-editor.org/rfc/rfc9842.html)
- [Chrome for Developers: compression dictionaries in Search](https://developer.chrome.com/blog/search-compression-dictionaries)
- [HTTP Toolkit: dictionary compression performance](https://httptoolkit.com/blog/dictionary-compression-performance-zstd-brotli/)
- [`@bokuweb/zstd-wasm`](https://www.npmjs.com/package/@bokuweb/zstd-wasm)
