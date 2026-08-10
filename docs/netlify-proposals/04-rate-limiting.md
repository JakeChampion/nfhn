# Built-in rate limiting, especially on `/reader/*`

**Status:** Proposed · **Impact:** Medium (High for `/reader`) · **Effort:** Low

## The comment in `config.ts` is now out of date

```ts
// Rate limiting documentation (not enforced at edge, but for reference)
export const RATE_LIMIT_REQUESTS_PER_MINUTE = 60;
export const RATE_LIMIT_BURST = 10;
```

Netlify has native rate limiting available on all plans, declared in the edge function's own `config`
export. Limits are applied **before** the request reaches function code, so rejected requests cost no
compute — which is strictly better than anything implementable inside the handler.

```ts
export const config: Config = {
  method: ["GET"],
  path: "/top/:page",
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ["ip"],
  },
};
```

The constraint to know up front: **the config object must be a static literal.** Netlify parses it
without executing the module, so `windowLimit: RATE_LIMIT_REQUESTS_PER_MINUTE` will not work. Those
constants have to be inlined at each call site, and `config.ts` should keep them only as the
documented source of truth with a comment saying why they are duplicated.

## `/reader/*` is the one that actually matters

`reader.ts` accepts a URL in its path and fetches it server-side:

```ts
const res = await fetch(url, {
  headers: { "User-Agent": "hn Reader (…)", Accept: "text/html,application/xhtml+xml" },
});
```

That is a fetch proxy running on Netlify's infrastructure, reachable by anyone, with NFHN's egress IP
and NFHN's `User-Agent` on it. Unmetered, it is an attractive nuisance in three distinct ways:

1. **Amplification.** One cheap request to NFHN causes one expensive fetch plus a full Readability
   parse. The compute asymmetry favours the attacker.
2. **Reputational laundering.** Traffic aimed at a third-party site arrives from Netlify's IPs
   claiming to be NFHN's reader.
3. **Bill.** Function invocations and egress bandwidth are metered.

A much tighter limit belongs here than on the feeds:

```ts
// netlify/edge-functions/reader.ts
export const config: Config = {
  path: "/reader/*",
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ["ip"],
  },
};
```

Rate limiting is a mitigation, not a fix — the deeper question is whether `/reader/*` should fetch
arbitrary URLs at all, or only URLs that appear in an HN item NFHN has already rendered. Validating
the target against a known HN story (an `item:` lookup, cheap once
[Blobs](./03-netlify-blobs.md) are in place) would close the amplification vector properly. Rate
limiting is the one-line version to ship first.

## Where else

| Route | Suggested limit | Why |
|---|---|---|
| `/reader/*` | 10/min per IP | outbound fetch + parse, see above |
| `/api/saved` (if [proposal 03](./03-netlify-blobs.md) lands) | 30/min per IP | first write endpoint |
| `/sitemap.xml` | 10/min per IP | cheap but pure origin work, no user in the loop |
| feeds and items | 120/min per IP | generous; catches only scrapers, and a prerendering browser can legitimately burst |

Set the feed limits loosely on purpose. Speculation Rules with `prerender: moderate` means a single
engaged reader can legitimately fire a dozen requests in a few seconds without touching a link — a
tight per-IP limit would break the site's own prefetching for users behind a shared NAT.

## Note on `aggregateBy`

IP aggregation is the default and the right starting point. Be aware it penalises shared egress
(universities, mobile carriers, corporate VPNs) — another reason the feed limits should be generous
and only `/reader/*` should be strict.

## Sources

- [Rate limiting | Netlify Docs](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/)
- [Safeguard your sites from abuse with Netlify's Rate Limiting controls](https://developers.netlify.com/guides/safeguard-your-sites-from-abuse-with-netlify-rate-limiting/)
