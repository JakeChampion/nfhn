# A reporting collector: the missing half of the Reporting API

**Status:** Proposed · **Impact:** Medium · **Effort:** Low

## The gap

From the full spec review's "worth doing, not done here":

> **Reporting API** — `Reporting-Endpoints` plus CSP `report-to` would surface violations, but needs
> a collector endpoint to send them to.

NFHN runs a strict CSP built from a hash of an inline script (`THEME_SCRIPT_HASH` in `config.ts`,
guarded by a test). That is a good setup with one blind spot: when the CSP blocks something in a real
browser — an extension, a proxy that rewrites markup, a browser that hashes differently — nobody
finds out. The test proves the hash matches the markup we render; it cannot prove the policy works in
the field.

The collector is an edge function. It is about forty lines.

## The collector

```ts
// netlify/edge-functions/reports.ts
import type { Config } from "@netlify/edge-functions";
import { getStore } from "@netlify/blobs";

export default async (request: Request) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/reports+json")) {
    return new Response(null, { status: 415 });
  }

  const reports = await request.json();
  if (!Array.isArray(reports)) return new Response(null, { status: 400 });

  const store = getStore("reports");
  await Promise.all(
    reports.slice(0, 20).map((report) =>
      store.setJSON(`${report.type}/${crypto.randomUUID()}`, {
        ...report,
        received: new Date().toISOString(),
      })
    ),
  );

  return new Response(null, { status: 204 });
};

export const config: Config = {
  method: ["POST"],
  path: "/_report",
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip"] },
};
```

Then in `lib/security.ts`:

```ts
headers.set("Reporting-Endpoints", 'default="/_report"');
```

and add `report-to default` to `CSP_DIRECTIVES` in `config.ts`.

Note this is an unauthenticated write endpoint that anyone can POST to, so the `rateLimit` config and
the `slice(0, 20)` cap are load-bearing, not decoration. Storage needs a sweep too — the scheduled
function from [proposal 02](./02-cache-tags-and-purge-api.md) is the place for it.

## What starts arriving, for free

Once the endpoint exists, four report types show up with no further work:

**CSP violations.** The obvious one.

**Deprecation reports.** Chrome reports use of APIs it is about to remove. For a site that
deliberately runs on the leading edge of the platform, this is an early-warning system that costs
nothing.

**Intervention reports.** The browser telling you it overrode something you asked for.

**`notRestoredReasons` — bfcache diagnostics.** This is the interesting one for NFHN specifically. The
site's whole performance story is instant navigation: Speculation Rules with `prerender: moderate`,
No-Vary-Search so decorated URLs still hit, cross-document View Transitions. Back/forward navigation
should be *free* — restored from bfcache, no request at all. But bfcache eligibility is easy to lose
by accident, and there is no way to notice from source. `PerformanceNavigationTiming` reports why:

```js
// static/app.js
const [nav] = performance.getEntriesByType("navigation");
if (nav?.notRestoredReasons) {
  navigator.sendBeacon("/_report", JSON.stringify([{
    type: "bfcache-blocked",
    body: nav.notRestoredReasons,
  }]));
}
```

Given how much of this codebase is built to make navigation instant, finding out that a service
worker registration or a lingering connection is silently disqualifying every back navigation would
be worth the whole exercise on its own.

## Reading the reports

Blobs storage means the reports are in a bucket, not a dashboard. Two cheap options: a `/reports`
route behind a shared secret that renders the last N as HTML using the existing render helpers, or a
`deno task reports` script that lists the store. Start with the script — it is the version that
cannot accidentally become a public data leak.

## Sources

- [Reporting API on MDN](https://developer.mozilla.org/en-US/docs/Web/API/Reporting_API)
- [`PerformanceNavigationTiming.notRestoredReasons`](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceNavigationTiming/notRestoredReasons)
