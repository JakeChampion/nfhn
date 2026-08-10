# `context.waitUntil` and speculation-aware rendering

**Status:** Proposed · **Impact:** Medium · **Effort:** Low

Two small edge-runtime things, one of which is a live bug.

## 1. Background revalidation is not guaranteed to run

`lib/cache.ts`:

```ts
const revalidateInBackground = (): void => {
  producer()
    .then((response) => {
      if (!isCacheable(response)) return;
      const { cacheable } = prepareResponses(…);
      …
    });
};
```

This is fire-and-forget. Nothing holds the isolate open, so once the stale response has been written
to the client, the runtime is free to tear the isolate down mid-flight. The revalidation *usually*
completes, because the isolate usually sticks around serving other requests — which is the worst
failure mode, since it means this works fine in testing and silently drops writes under exactly the
low-traffic conditions where a warm cache matters most.

`Context.waitUntil` exists for this: it extends the isolate's lifetime past the response.

```ts
export async function withProgrammableCache(
  request: Request,
  context: Context,          // thread the context through
  cacheName: string,
  …
) {
  const revalidateInBackground = (): void => {
    context.waitUntil(
      producer().then((response) => { … }),
    );
  };
```

Threading `context` means touching the six feed/item/user edge functions that call into
`lib/handlers.ts`, all of which already receive it. The same applies to every fire-and-forget write
proposed elsewhere in this directory — the Blobs mirror writes in
[proposal 03](./03-netlify-blobs.md) have exactly this shape and need the same treatment.

While in there: `netlify/edge-functions/top.ts` still has a stray debug line,

```ts
console.log('meow x-nf-passthrough-host:', request.headers.get('x-nf-passthrough-host'));
```

which is presumably not meant to be shipping.

## 2. Serve prefetches differently from navigations

Speculation Rules are configured aggressively in `pages.ts` — `prerender: moderate` over every
internal link. That means a meaningful share of NFHN's traffic is speculative: pages fetched for a
navigation that may never happen. The browser labels it:

```
Sec-Purpose: prefetch
Sec-Purpose: prefetch;prerender
```

Nothing in the codebase reads that header. Three things could be done with it:

**Don't let speculation cost the real user anything.** Any expensive optional work — the dictionary
compression in [proposal 01](./01-compression-dictionary-transport.md), OG image generation,
Blobs mirror writes — should be skipped when nobody is waiting on the bytes:

```ts
const speculative = (request.headers.get("Sec-Purpose") ?? "").includes("prefetch");
```

**Don't let speculation pollute the numbers.** A prerendered page that is never activated is not a
page view. Any future analytics or logging (`lib/logger.ts`) should record the header so speculative
requests can be separated out — otherwise the aggressive speculation config quietly inflates every
traffic metric NFHN produces.

**Consider prewarming, not just serving.** A prerender request is a free signal that this visitor is
likely to want *related* data next. On a prerendered item page, the warm path for its comment tree is
already implied — but the reader-mode extraction for the story's external link is not, and that is
the expensive one. Kicking it off under `waitUntil` during a prerender would make "open in reader"
instant. This is the speculative one of the three ideas here, in both senses; measure the wasted work
before committing to it.

## Why these are grouped

Both are about the runtime's execution model rather than any web API: what work is allowed to outlive
a response, and what a request actually means. Item 1 is a bug fix and should go in on its own. Item
2 is a prerequisite for doing proposals 01, 03 and 05 without making the site slower for the person
who is actually reading it.
