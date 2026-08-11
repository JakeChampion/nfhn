# View Transition types and finishing the speculation story

**Status:** Implemented · **Browser support:** Chromium 125+ (types), Baseline for the rest ·
**Impact:** Medium · **Effort:** Low

Two small refinements to features NFHN already ships.

## 1. Directional page transitions with view-transition types

Cross-document View Transitions are already in place, but every navigation animates identically —
`/top/1` → `/top/2` looks the same as `/top/1` → `/item/123` → back. Direction is information the
reader can use, and the platform can express it.

```css
@view-transition {
  navigation: auto;
  types: none;
}

html:active-view-transition-type(forward) {
  &::view-transition-old(root) { animation: slide-out-left 200ms ease; }
  &::view-transition-new(root) { animation: slide-in-right 200ms ease; }
}

html:active-view-transition-type(backward) {
  &::view-transition-old(root) { animation: slide-out-right 200ms ease; }
  &::view-transition-new(root) { animation: slide-in-left 200ms ease; }
}

html:active-view-transition-type(drill-in) {
  /* feed → item: the story row expands into the page */
}
```

Types are assigned in the `pageswap` and `pagereveal` events, where the outgoing and incoming URLs are
both known:

```js
addEventListener("pageswap", (event) => {
  if (!event.viewTransition) return;
  event.viewTransition.types.add(classify(event.activation.from.url, event.activation.entry.url));
});

addEventListener("pagereveal", (event) => {
  if (!event.viewTransition) return;
  event.viewTransition.types.add(classify(navigation.activation.from?.url, location.href));
});
```

`classify()` is straightforward given the route shapes in `lib/routes.ts`: same feed with a higher
page number is `forward`, lower is `backward`, feed → `/item/:id` is `drill-in`, the reverse is
`drill-out`.

The pairing worth building properly is feed → item. Give the story title a
`view-transition-name` derived from the item id on both the feed row and the item page heading, and
the title physically travels from the list into the article heading. That is the one animation that
communicates something rather than just decorating:

```html
<!-- components.ts, both places -->
style="view-transition-name: story-${item.id}"
```

Names must be unique per document, which they are — an item appears once per feed page.

Keep the whole thing inside `@media (prefers-reduced-motion: no-preference)`.

## 2. `expects_no_vary_search` in the speculation rules

This one completes work that is already done. `lib/security.ts` sends:

```http
No-Vary-Search: params, key-order
```

and `lib/cache.ts` keys the edge cache to match. But the speculation rules in `pages.ts` do not
declare it, and there is a gap that only shows up in the case the header was added for.

When a user clicks a link decorated with `?utm_source=…`, the browser checks its prefetch cache for
that exact URL. If the prefetch for the clean URL **has already completed**, its `No-Vary-Search`
response header is known and the entry matches. If the prefetch is still **in flight**, the browser
has no response header yet, so it does not know the entries are equivalent — and it starts a second,
redundant fetch.

`expects_no_vary_search` tells it in advance:

```json
{
  "prefetch": [
    {
      "where": { "and": [ { "href_matches": "/*" }, … ] },
      "eagerness": "conservative",
      "expects_no_vary_search": "params, key-order"
    }
  ]
}
```

The value must match what the server actually sends. Since both come from `NO_VARY_SEARCH` in
`config.ts` today, the speculation rules block should interpolate that constant rather than
hardcoding the string — that way the existing test guarding the header also guards this.

Add it to the `prerender` rule too; the same reasoning applies, and a wasted prerender costs
considerably more than a wasted prefetch.

## 3. Deliver the rules as a header, because CSP was blocking the script

**Found after shipping sections 1 and 2, which is the point of writing this down.**

The rules above were implemented as an inline `<script type="speculationrules">` in every page. They
never ran once.

A speculation rules script is an inline script as far as CSP is concerned — that is why
`'inline-speculation-rules'` exists as a dedicated `script-src` source expression. This site's
policy is:

```
script-src 'self' 'sha256-6hO62gdSSJDQ6/I94TG7pbIBUb/WZCv/YmMI/Is6yZU='
```

No `'unsafe-inline'`, no nonce, and the one hash covers the theme initialiser. Chrome refused to
parse the rules block, and nothing about the page looked wrong. This is the same failure shape as
the SRI drift: a feature switched silently off, with no visible symptom, for as long as nobody
thought to check.

There are two fixes and they are not equivalent:

- Add `'inline-speculation-rules'` to `script-src`. One line, but it re-opens `script-src` to a
  class of inline content on every page for the rest of the site's life.
- Send the ruleset as a file and point at it with the response header:

  ```http
  Speculation-Rules: "/_speculation/rules.json"
  ```

  The fetch is an ordinary same-origin request already covered by `'self'`, so the strict policy
  stays strict. The ruleset is also fetched and parsed once per browser rather than re-parsed on
  every navigation, and the bytes leave the HTML entirely.

The header route wins, and it costs no reach: the `Speculation-Rules` header and the document rules
these use (`where`, `eagerness`, `expects_no_vary_search`) all shipped in Chrome 121, so any browser
that could have acted on the inline block can fetch the file.

The file must be served as `application/speculationrules+json`. Served as `application/json` it is
ignored — silently, again — which is why the route sets the type explicitly rather than relying on
the extension, and why a test asserts it.

## Sources

- [View transition types | Chrome for Developers](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document#view-transition-types)
- [`Speculation-Rules` header | MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Speculation-Rules)
- [`script-src` and `'inline-speculation-rules'` | MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)
- [`expects_no_vary_search` in speculation rules](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API#expects_no_vary_search)
