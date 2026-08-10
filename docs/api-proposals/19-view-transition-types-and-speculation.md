# View Transition types and finishing the speculation story

**Status:** Proposed · **Browser support:** Chromium 125+ (types), Baseline for the rest ·
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

## Sources

- [View transition types | Chrome for Developers](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document#view-transition-types)
- [`expects_no_vary_search` in speculation rules](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API#expects_no_vary_search)
