# `content-visibility: auto` for comment threads

**Status:** Implemented · **Browser support:** Baseline (Chromium 85+, Firefox 125+, Safari 18+) ·
**Impact:** 🔥 High · **Effort:** Low

## The problem

`commentsSection` in `render/components.ts` renders the entire comment tree server-side, recursively,
with no depth or count limit. A busy HN thread is 1,000+ comments and several thousand DOM nodes,
every one of which the browser lays out, styles and paints before the page is interactive — even
though the reader can see about eight of them.

This is the single biggest remaining rendering cost on the site, and it grows with exactly the
threads people most want to read.

## The fix

```css
/* Each top-level comment subtree is skipped until it approaches the viewport */
[aria-label="Comments"] > details,
[aria-label="Comments"] > ul > li {
  content-visibility: auto;
  contain-intrinsic-size: auto 8rem;
}
```

`content-visibility: auto` tells the browser to skip layout, style and paint for a subtree that is
off-screen, and to do the work lazily as it scrolls into view. `contain-intrinsic-size` supplies a
placeholder size so the scrollbar does not lurch — `auto 8rem` means "use 8rem until you have
actually rendered this once, then remember the real size", which is the variant that keeps scrollbar
behaviour stable on the way back up.

Two properties, no JavaScript, no change to the server-rendered markup.

## Why the `auto` keyword matters here

Comment heights vary enormously — a one-line "this" next to a forty-line code block. The plain
`contain-intrinsic-size: 8rem` form would make the scrollbar jump every time an off-screen estimate
turned out wrong. `auto <length>` caches the last-rendered size per element, so each subtree is
mis-estimated at most once. For a deeply variable list like an HN thread this is the difference
between "smooth" and "unusable".

## Interaction with existing features

**`<details open>`.** Comments are `<details open>` elements. `content-visibility: auto` composes
fine — a closed `<details>` skips its content anyway, and an open off-screen one now also skips.

**Find-in-page.** `content-visibility: auto` content *is* searchable: the browser forces rendering of
skipped subtrees for Ctrl+F, and scrolls to the match. This is the behaviour that makes the property
safe on text content, and it is why `hidden=until-found` is not needed here.

**Fragment navigation.** `.comment-permalink` links to `#<id>`. Anchor navigation into a skipped
subtree works for the same reason find-in-page does.

**Scroll-driven animations.** The site already uses these for the reading-progress bar. Skipped
subtrees have no layout until rendered, so anything computing total document height should be
verified once this lands — with `auto` sizing the estimate improves as the reader scrolls, which can
make a progress bar drift. Worth a look in the browser rather than in review.

## Where NOT to apply it: the story list

This proposal originally said story rows were a free win. They are not, and shipping it there was a
bug — every row on every feed page rendered as "1".

`content-visibility: auto` implies **style containment**, and style containment scopes
`counter-increment` and `counter-set` to the contained element's own subtree. The story numbers come
from `ol > li:before { counter-increment: section }`, so containing each `<li>` gives each one its own
fresh `section` counter. This is spec'd behaviour, not a browser bug, so it breaks in every engine.

The same reasoning is why the comment rules above are safe: comments are `ul > li`, and the counter
selector is `ol > li`, so no counter crosses a containment boundary. Anything that *is* numbered
must stay uncontained — or the number has to be computed somewhere other than inside the contained
element.

Guarded by "content-visibility is never applied to counter-numbered story rows" in
`tests/unit_test.ts`, which fails if a `content-visibility` rule ever targets an `ol` descendant
again.

## Where else it would be safe

- The extracted article body in `/reader/*`. Long-form articles are the second-biggest DOM on the
  site, and nothing there is numbered.

## Measuring it

`lighthouserc.json` is already wired up. The metric to watch is Total Blocking Time and
"Avoid an excessive DOM size" on a deliberately huge thread — pick an HN item with 1,500+ comments
and record before/after rather than trusting the theory.
