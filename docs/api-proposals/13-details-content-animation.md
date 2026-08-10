# Animating comment collapse with `::details-content`, `interpolate-size` and `calc-size()`

**Status:** Proposed · **Browser support:** Chromium 129+/131+, Safari 18.4+ (Firefox in progress) ·
**Impact:** Medium · **Effort:** Low

## What this replaces

Collapsing a comment thread is the core interaction of any HN reader, and it is currently binary:
`<details open>` snaps shut. Animating "height: 0 to auto" has been the canonical impossible CSS
problem for twenty years, and the usual workarounds are all bad — a JS height measurement, a
`max-height` guess that either clips long threads or makes short ones ease slowly, or a grid
`1fr`/`0fr` trick that fights the nested layout.

Three new features make it a pure-CSS six-liner.

## The implementation

```css
/* Opt into animating to and from intrinsic sizes, document-wide */
:root {
  interpolate-size: allow-keywords;
}

[aria-label="Comments"] details::details-content {
  block-size: 0;
  overflow: clip;
  transition: block-size 250ms ease, content-visibility 250ms allow-discrete;
}

[aria-label="Comments"] details[open]::details-content {
  block-size: auto;
}
```

Three pieces doing the work:

- **`::details-content`** exposes the part of a `<details>` that was previously unstylable — the
  implicit wrapper around everything after the `<summary>`. Without it there is nothing to animate.
- **`interpolate-size: allow-keywords`** permits transitions to and from intrinsic keywords like
  `auto`. This is the actual answer to the twenty-year-old problem.
- **`transition-behavior: allow-discrete`** on `content-visibility` keeps the content present for the
  duration of the closing animation instead of vanishing on frame one.

The `calc-size()` function is the escape hatch for cases where the keyword alone is not enough — e.g.
capping a very long thread's expanded height while still animating from intrinsic size:

```css
[aria-label="Comments"] details[open]::details-content {
  block-size: calc-size(auto, min(size, 60vh));
}
```

## Why this fits NFHN specifically

The CSP is strict: `script-src 'self' <hash>` with `script-src-attr 'none'`, and the only inline
script is the theme initialiser whose hash is asserted by a test. Every interaction implemented in
CSS is one that never has to negotiate with that policy — no handler, no hash to maintain, and no
new entry in the `THEME_SCRIPT_HASH` guard.

It also composes with [proposal 12](./12-content-visibility.md): `content-visibility: auto` on the
subtree, `::details-content` animation on open/close. Verify the two together, since both touch
`content-visibility` on overlapping elements — the animation sets it on `::details-content` and the
optimisation sets it on the host `<details>`, which should be independent but is worth confirming in
the browser.

## Progressive enhancement

Everything degrades to today's behaviour. A browser without `interpolate-size` ignores the
declaration and the transition to `auto` is not animatable, so it snaps — exactly what happens now. A
browser without `::details-content` ignores the whole rule block. No feature detection needed, though
wrapping in `@supports (interpolate-size: allow-keywords)` documents the intent.

## One accessibility note

Wrap the transition in a `prefers-reduced-motion` guard. A page where a thousand comment subtrees can
animate is precisely the case that setting exists for:

```css
@media (prefers-reduced-motion: reduce) {
  [aria-label="Comments"] details::details-content { transition: none; }
}
```

## Sources

- [`::details-content` on MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/::details-content)
- [`interpolate-size` on MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/interpolate-size)
- [`calc-size()` on MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/calc-size)
