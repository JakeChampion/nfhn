# Hardening, INP, and platform syntax that replaces hand-rolled code

**Status:** Implemented · **Browser support:** mixed, all progressive · **Impact:** Medium–High ·
**Effort:** Low

A batch of smaller items, grouped because they share a shape: each one replaces something the
codebase currently does by hand, or reports on something it currently assumes.

## 1. `Integrity-Policy` — make SRI a policy, not a habit

`justifyScript()` puts `integrity` on all three third-party scripts. That is a habit, and habits lapse:
the fourth script added in a hurry will not have one, and nothing will complain.

```http
Integrity-Policy-Report-Only: blocked-destinations=(script), endpoints=(default)
```

Report-only, deliberately. The enforcing failure mode is "no JavaScript at all", so the first job is
to find out whether anything already violates it — and the reports go to the collector at `/_report`
that already exists, so this is one header and no new infrastructure. Firefox 145+ acts on it,
everything else ignores it.

## 2. Trusted Types — now enforced

`require-trusted-types-for 'script'` is the strongest available defence against DOM XSS, and it is
the natural next step for a CSP that already runs `script-src 'self'` plus a pinned hash.

It could not be enforced at first. `static/app.js` assigned `innerHTML` in five places — the
saved-stories list (`renderSavedStories`) and the picture-in-picture reader. Those values went through
`escapeHtml()` so they were not a live XSS, but they are exactly the sinks Trusted Types blocks, and
turning it on would have broken both features immediately.

So it shipped as `Content-Security-Policy-Report-Only` first, and that did its job: "Trusted Type
expected, but got String" in the console was those exact sinks firing, on the pages that use them.

**All five are gone.** Both features build DOM nodes now, which is why the directives moved into the
enforced `CSP_DIRECTIVES`:

- The saved list builds `<li>` trees with `createElement`, `textContent` and `replaceChildren`, and
  SVG icons with `createElementNS` — an `<svg>` built with `createElement` lands in the XHTML
  namespace and renders as nothing. `escapeHtml()` went with them: a node needs no escaping.
- The PiP reader builds its shell in the PiP document, and its close button now uses a listener rather
  than an `onclick` attribute — that attribute was blocked by the page's own CSP all along (the PiP
  document inherits the opener's policy container), so the button did nothing when clicked.
- The worst one was `pipContent.innerHTML = articleContent.innerHTML`. `articleContent` comes out of a
  `DOMParser` document, which is inert; serialising it back into a live same-origin document brought
  all of it to life. `innerHTML` does not execute `<script>`, but `<img onerror>` fires perfectly
  well, and this is third-party article HTML. It now imports the parsed nodes and strips what runs:
  script-ish elements, `on*` handlers, and `javascript:` URLs.

`trusted-types 'none'` stays, which bans creating a policy at all — the strongest form, and correct
while nothing needs one. A test walks every file in `static/` for sinks, so reintroducing one fails
in CI rather than in a reader's browser.

## 3. `scheduler.yield()` — the site's biggest INP problem

`static/justify.js` ran TeX line-breaking over every paragraph on the page in a single call:

```js
lib.justifyContent(paragraphs, hyphenate);   // one task, all 1,000 comments
```

Nothing — scrolling, tapping, the `j`/`k` shortcuts — can happen while that runs. It is now chunked
40 paragraphs at a time with a yield between chunks.

`scheduler.yield()` rather than `setTimeout(0)` matters here: it resumes at the *front* of the task
queue, so the remaining chunks are not starved behind whatever else the page queued. Falls back to
`setTimeout` where it does not exist.

**Still worth doing:** justifying paragraphs that `content-visibility: auto` is currently skipping is
wasted work. `contentvisibilityautostatechange` fires exactly when a subtree becomes rendered, which
is the right trigger.

## 4. Long Animation Frames → the reporting collector

`long-animation-frame` entries name *which script* caused a slow frame. "Something blocked for 300ms"
is not actionable; "justify.js blocked for 300ms" is. Entries over 200ms are beaconed to `/_report`
alongside the CSP and bfcache reports. This is also how we will find out whether item 3 actually
worked in the field rather than in theory.

## 5. Prerender gating — a flaw in what shipped last round

Speculation Rules prerender pages that may never be activated, and the built-in-AI availability probe
and the bfcache beacon both ran during prerender. That inflates whatever gets measured and spends the
visitor's battery on a page they may never look at.

Both now run through a `whenActivated()` helper: immediately if `document.prerendering` is false,
otherwise on `prerenderingchange`.

## 6. `AbortSignal.timeout()` and `AbortSignal.any()`

`lib/hn.ts` carried a hand-rolled timeout: an `AbortController`, a `setTimeout`, and a listener whose
only job was clearing the timer so it did not leak. The platform owns all of that now:

```ts
function requestSignal(timeoutMs: number, caller?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return caller ? AbortSignal.any([timeout, caller]) : timeout;
}
```

`AbortSignal.any()` is the part that adds capability rather than just deleting code: a request can now
be cancelled by its own deadline *or* by a caller, whichever fires first.

## 7. Temporal — on the client, not the server

`Intl.RelativeTimeFormat` was fed by a table of fixed unit sizes, where a month is 2,592,000 seconds
and a year is 365 days. Both are wrong, and visibly so for anything older than a few weeks. Temporal
does real calendar arithmetic, so `from.until(to, { largestUnit: "year" })` gives months that are
actual months.

It is applied client-side only, guarded by a `typeof Temporal` check. The server-side
`formatTimeAgo()` keeps the approximation deliberately: it is now only the no-JS fallback string that
the client replaces on load, and switching it would make the unit tests depend on which month they
run in. Chrome 144+, Firefox 139+, Deno native; [Safari is still behind a
flag](https://bryntum.com/blog/javascript-temporal-is-it-finally-here/), which the guard handles.

## 8. `<link rel="expect" blocking="render">`

These pages are streamed. Without this the browser can paint a header above an empty body and then
reflow when the content arrives — and worse, a cross-document view transition can capture that
half-built frame as the "old" snapshot. `rel="expect"` holds first paint until `#main-content` exists.
If the element never arrives, rendering unblocks when parsing ends, so a truncated stream cannot hang
the page.

## 9. CSS: three small ones

- **`@scope`** — comment threads nest arbitrarily deep, so every descendant selector aimed at a
  comment also matches every comment inside it. `@scope (…) to (details)` sets the lower boundary that
  donut-scoping hacks only approximate.
- **`@media (scripting: none)`** — almost everything here is progressive enhancement, but controls
  that only work once `app.js` runs were shown regardless. They are now hidden from the audience that
  can never use them.
- **`::target-text`** — comment permalinks scroll to a comment; a text fragment (`#:~:text=`) can
  point at the exact sentence being quoted, and this styles that match with the site's accent instead
  of browser-default yellow.

## Considered and not done

**Customizable `<select>`** for the theme control (`appearance: base-select` + `<selectedcontent>`).
The existing radio group is styled, accessible, and works in every browser; the replacement is
Chromium-only for styling purposes and would change the control for everyone to gain nothing outside
Chromium. Given that the last regression here was a spec-correct CSS feature that broke a real
browser, swapping a working control on a feature that cannot be verified in this environment is not a
trade worth making. Worth revisiting when it is Baseline.

**`scroll-state()` container queries.** Nothing in `styles.css` uses `position: sticky`, so there is
no stuck state to query.

## Sources

- [Integrity-Policy on MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Integrity-Policy)
- [`scheduler.yield()` on MDN](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield)
- [Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames)
- [Temporal on MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal)
