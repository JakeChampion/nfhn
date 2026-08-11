# Reader mode and justification: using what the libraries already give us

**Status:** Implemented · **Impact:** 🔥 High (three live bugs) · **Effort:** Low

Started as "can these two vendored libraries be used better". The answer was yes, and finding out
turned up three things that were silently broken in production.

## Three live bugs

### 1. Justification was switched off site-wide

`static/justify.js` was edited without updating its Subresource Integrity hash, so
`render/components.ts` declared `sha384-FI/M0Xsdr…` for a file that hashed to `sha384-2zrC510i…`.
Browsers refuse to execute a script whose hash does not match, so justification simply stopped —
with no console error a visitor would see and no test that noticed.

An SRI mismatch has no symptom beyond the feature quietly not working, which is exactly why it needs
a guard. The hashes now live in one `SRI` constant in `config.ts`, and a test hashes the real files
and fails if any of them drifts.

### 2. Reader mode's CSP blocked reader mode's own scripts

```
script-src 'unsafe-inline' https://unpkg.com
```

No `'self'`. An explicit `script-src` overrides `default-src` entirely, so it never inherited
`'self'` — meaning every same-origin script on a reader page was blocked. Justification has never
worked in reader mode, which is the one place on the site with genuinely long-form text. The inline
theme script survived only because of `'unsafe-inline'`.

`unpkg.com` was a leftover from when the scripts loaded off a CDN; nothing has requested it in a long
time, and it is gone. The policy now lives in `READER_CSP` in `config.ts` so it can be asserted
directly rather than by grepping source.

### 3. Every reader page claimed to be English

`Readability.parse()` returns `lang` and `dir`. The template hardcoded `<html lang="en">` with no
`dir` at all. A Japanese, Arabic or Hebrew article was therefore announced to screen readers in the
wrong language, and RTL text laid out left to right.

Both are now used, with `dir="auto"` as the fallback rather than `ltr`: when Readability could not
determine direction, letting the browser infer it from the first strong character is right far more
often than assuming.

## Metadata that was computed and thrown away

`parse()` also returns `byline`, `siteName`, `publishedTime` and `excerpt`. The reader used `title`,
`content` and `textContent` and discarded the rest — so pages showed no author, no publication and no
date, despite the extraction having already worked all three out.

They now appear in the header (`author · publication · date`, with a real `<time datetime>`), and
`excerpt` becomes the page's `<meta name="description">`. The cost is zero: this is data the parse
already produced.

`length` gets a use too. Under 250 characters of recovered text means Readability found navigation
and boilerplate rather than an article, so the page says so — a 422 with an explanation, instead of
rendering an empty article shell and caching it.

## One implementation instead of two

Reader mode carried its own inline copy of the justification logic, targeting `#article p` while
`static/justify.js` targeted `details > div p, article > p`. Two copies meant the chunking work in
[proposal 20](./20-hardening-inp-and-modern-syntax.md) landed on the main site and not in reader
mode — where the longest text on the site lives.

Reader mode now loads the shared `/justify.js`, with the same SRI hashes, and the selector covers
both contexts.

## Justification correctness under `content-visibility`

This one is a direct consequence of [proposal 12](./12-content-visibility.md). Comment subtrees are
skipped until they approach the viewport, and a skipped subtree **has no layout** — so measuring its
paragraphs for line breaking produced meaningless results, and the work was wasted either way.

`justify.js` now:

- skips paragraphs with no layout box (`getClientRects().length === 0`), which covers both skipped
  subtrees and `display: none`;
- listens for `contentvisibilityautostatechange` on comment containers and justifies each subtree at
  the moment it gains layout;
- marks finished paragraphs with `data-justified` so nothing is measured twice;
- re-justifies everything on resize and on bfcache restore, where the measure may have changed.

## Removed

- **A 50ms polling loop** waiting for the two libraries to appear, with a 5-second timeout. The three
  scripts are `defer`red and execute in document order, so by the time `justify.js` runs the other two
  have already run. The poll could never observe anything but success on its first tick.
- **A `turbo:load` listener.** This site does not use Turbo; navigation is cross-document with View
  Transitions. It never fired.

## Not done

**`isProbablyReaderable`.** Upstream Readability exports a cheap pre-check for "is this even an
article", and this vendored copy does not include it. The `length` gate above captures most of the
value for one comparison; porting the real thing is worthwhile if reader mode ever starts extracting
speculatively rather than on demand.

**Updating the vendored Readability.** The copy here is recent — it has `_unwrapNoscriptImages`,
`_fixLazyImages`, `_getJSONLD`, `_simplifyNestedElements` and `_cleanClasses`, so the usual
lazy-image and metadata gaps are already covered. Re-vendoring is a maintenance task, not a fix.
