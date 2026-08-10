# Compression Dictionary Transport — unblocking it at the edge

**Status:** Proposed · **Impact:** 🔥 High · **Effort:** High · **Support:** Chromium 130+ (Firefox in
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

## What has to be verified before writing real code

This is a spike, not a merge-ready plan. Three unknowns, in order of how likely they are to kill it:

1. **Does Netlify's CDN pass `Content-Encoding: dcz` through untouched?** If the CDN re-compresses or
   strips an encoding it does not recognise, everything above is moot. Test with one hand-built
   response before anything else.
2. **Does `Netlify-Vary: header=…` apply to edge-function responses**, or only to redirect/header
   rules? Confirm against a deploy preview.
3. **WASM instantiation cost per isolate.** Measure cold-start impact; if it is bad, the memoised-blob
   path can serve the common case without ever instantiating the module.

The review's instinct — "deliberately not shipping the half we could" — still holds. Do not emit
`Use-As-Dictionary` until step 1 passes, because a nominated dictionary we cannot use costs the
visitor a download and buys nothing.

## Sources

- [RFC 9842: Compression Dictionary Transport](https://www.rfc-editor.org/rfc/rfc9842.html)
- [Chrome for Developers: compression dictionaries in Search](https://developer.chrome.com/blog/search-compression-dictionaries)
- [HTTP Toolkit: dictionary compression performance](https://httptoolkit.com/blog/dictionary-compression-performance-zstd-brotli/)
- [`@bokuweb/zstd-wasm`](https://www.npmjs.com/package/@bokuweb/zstd-wasm)
