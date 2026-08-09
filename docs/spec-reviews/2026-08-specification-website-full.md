# Spec review: the full specification.website corpus

Reviewed 2026-08-09 against all 168 specifications published by
[specification.website](https://specification.website), across its ten categories. The four HTTP
field specs reviewed separately are in
[2026-08-specification-website.md](./2026-08-specification-website.md).

The corpus grades each spec `required`, `recommended`, `optional` or `avoid`. NFHN already satisfied
most of what applies to it — it is a server-rendered, cookieless, dependency-free site, which is the
shape most of these specs are pushing towards. This review records what changed, what was already
right, and what is deliberately not being done.

## Summary

| | Count |
| --- | --- |
| Changed in this pass | 14 |
| Already compliant | 61 |
| Not applicable to NFHN | 78 |
| Open gaps (need an asset or a decision) | 15 |

---

## Changes made

### Accessibility

**The skip link did not skip anything.** `skipLink()` targets `#main-content`, but `headerBar()` —
the settings button and the entire feed navigation — was rendered *inside* `<main>`. A keyboard user
activating "Skip to main content" landed immediately before the navigation they were trying to skip,
on every page. The [skip links](https://specification.website/spec/accessibility/skip-links/) spec
exists precisely to let people jump *past* repeated navigation.

`headerBar()` now renders as a sibling before `<main>` in all four templates, and its wrapper is a
`<header>` rather than a `<div>`, which makes it a real banner landmark (a `<header>` nested inside
`<main>` is not one). Page width lives on `body` and `.header-bar` is styled by class, so this is
layout-neutral. Guarded by a test asserting the source order: skip link, then nav, then `<main>`.

**Forced colours mode.** No `@media (forced-colors: active)` block existed. In forced-colours mode
the browser replaces the palette, so anything bounded only by a background colour flattens into the
canvas — badges, popovers, icon buttons, and most visibly the scroll progress bar, which is nothing
*but* a coloured bar and disappeared entirely. Repairs added using system colour keywords
(`Highlight`, `CanvasText`, `ButtonText`, `LinkText`) so they track the user's chosen palette rather
than hard-coded values. A `prefers-contrast: more` block firms up the same faint boundaries for the
different audience that asked for contrast without a forced palette.

### Foundations

**`<meta name="color-scheme">` was missing.** The CSS `color-scheme` property was set on `:root`,
but the meta tag takes effect before any stylesheet parses — it is what prevents the white flash a
dark-mode user sees during load. Added as `light dark`.

**`theme-color` was one static brand orange (`#ff7a18`).** That colour appears nowhere near the page
edges, so the address bar clashed with both themes. It is now a `media`-paired light/dark pair
matching `--background` (`#f5f5f5` / `#0d1117`).

The `media`-based tags track the *operating system*, though, and NFHN ships an in-page theme toggle —
so a visitor on a light OS who picks dark got a dark page with a light address bar. Following the
spec's guidance for exactly this case, the pre-paint inline script now prepends a media-less
`theme-color` tag carrying the *resolved* theme (browsers use the first tag in document order whose
media matches, so it wins), and `app.js` keeps it in sync on toggle and on OS change.

Changing that inline script changes its CSP hash. Rather than leave the two to drift, a test now
hashes the script as actually rendered and asserts it equals `THEME_SCRIPT_HASH` — editing one
without the other fails the suite instead of silently breaking the page under CSP.

The manifest's `theme_color` was the same orange; it is now `#f5f5f5`, matching its own
`background_color` and the meta pair, so the PWA splash does not jump.

### SEO and crawling

**`robots.txt` advertised a sitemap that did not exist.** `Sitemap: https://nfhn.netlify.app/sitemap.xml`
returned 404. Per the [XML sitemaps](https://specification.website/spec/seo/xml-sitemaps/) spec, a
crawler that follows that line to an error loses trust in the file it did parse.

Added `/sitemap.xml` as an edge function, listing only the five feed entry points and deriving the
origin from the request so deploy previews are correct. Story, profile and reader URLs are
deliberately excluded: item ids are unbounded and their pages are as ephemeral as Hacker News itself,
and a sitemap whose entries decay into 404s is worse than a short one. No `<lastmod>` — these pages
change every few minutes, and a timestamp that is always "just now" is noise a crawler cannot
schedule against. A test walks the `Sitemap:` line in `robots.txt` and asserts it is served.

**Two routes were indexable that should not be.** Per
[meta robots](https://specification.website/spec/seo/meta-robots/), both now send
`X-Robots-Tag: noindex, follow`:

- `/reader/*` republishes someone else's article. Indexing it puts a duplicate of the publisher's
  content in the index under our domain.
- `/saved` is an empty shell whose contents are rendered from the visitor's own browser storage.

`follow` in both cases, so link equity still flows.

### Performance

**`scrollbar-gutter: stable`** on `:root`. Navigating between a feed page that overflows and one that
does not shifted the centred layout sideways.

**`defer` on the three text-justification scripts.** They sat at the end of `<body>` with no
attribute, making them parser-blocking at that point. They depend on each other in order (library,
hyphenation data, then the code using both), which is exactly what `defer` preserves. Verified
`justify.js` is defer-safe: it branches on `document.readyState`, and deferred scripts still run
before `DOMContentLoaded`.

### Security and resilience

**`/.well-known/security.txt`** added (RFC 9116). `Contact:` points at the repository's GitHub
security advisory form rather than an email address — a monitored destination that cannot rot into
an unread mailbox, which the spec names as worse than having no file at all. `Expires:` is one year
out; it needs a calendar reminder.

**`Redirect-By: NFHN`** on redirects issued by the edge functions. Netlify's own `netlify.toml` rules
redirect some of the same paths, so when a chain misbehaves this says which hop was ours.

### Agent readiness

**`/llms.txt`** added — curated, not a sitemap dump. It states plainly that the content is Hacker
News', points agents at the five feeds and the two URL patterns, and explicitly tells them `/reader/`
and `/saved` are not worth crawling and to cite the original publisher instead.

---

## Already compliant — verified, not changed

**Foundations.** Doctype, `<meta charset>` first, `<html lang="en">`, viewport without
`user-scalable=no`, unique `<title>` per route, `<meta name="description">`, `rel=canonical` on every
page, Open Graph and Twitter Card tags, `text-wrap: balance`/`pretty`, container queries, anchor
positioning, Popover API for the settings and shortcuts modals.

**Accessibility.** Semantic landmarks, real `<button>`/`<a>`/`<details>` throughout rather than
click-handler divs (the "first rule of ARIA" done properly), every icon-only control carries an
`aria-label`, `:focus-visible` indicators, keyboard navigation with a documented shortcut sheet and
an `aria-live` region, `prefers-reduced-motion` honoured across view transitions and scroll
animations, touch targets at 44–48px, `aria-current="page"` on the active feed, `<dl>` for user
stats rather than a layout table.

**Performance.** `Cache-Control` with `stale-while-revalidate`, conditional requests (ETag +
`Last-Modified` + 304), Speculation Rules, `Server-Timing`, preconnect hints, `fetchpriority`,
critical CSS as a single render-blocking stylesheet plus a `Link: rel=preload` header, system fonts
so there is no web-font loading problem to have, HTTP/2 and /3 from Netlify.

**Security.** HTTPS with HSTS (`max-age` 2 years, `includeSubDomains`, `preload`), a CSP with
`frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'` and a hashed inline script rather
than `unsafe-inline`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`
denying camera/microphone/geolocation/FLoC, `upgrade-insecure-requests`, SRI with
`crossorigin="anonymous"` on the third-party scripts.

**Privacy.** Nothing to consent to: no cookies, no analytics, no third-party scripts — every script
NFHN loads is same-origin. Data minimisation is structural, since the server stores nothing and saved
stories never leave the browser. Global Privacy Control has nothing to honour because there is
nothing to sell or share.

**Resilience.** Custom error pages returning correct status codes (no soft 404s), a service worker
with an offline fallback, a web app manifest with icons, shortcuts and `display: standalone`,
server-side rendering so content survives JavaScript failing.

**SEO.** Clean path-based URL structure, internal linking, heading hierarchy, JSON-LD
(`DiscussionForumPosting` and `WebSite`), server-side rendering.

**`avoid` list.** NFHN does none of the six things the corpus tells you not to do: no accessibility
overlay, no empty links or buttons, no IP-based geo-redirects, no HTTP/1.1 sharding or spriting, no
`X-XSS-Protection`, no soft 404s.

---

## Not applicable

78 specs describe features NFHN does not have, and adopting them would mean inventing the feature
first. Grouped, with the reason:

- **No authentication or accounts** — accessible authentication, redundant entry,
  `/.well-known/change-password`, `/.well-known/webauthn`, the three OAuth/OpenID well-known
  documents, Storage Access API.
- **No forms** — form labels, form errors, mobile form inputs, CSS state selectors for validation.
- **No media or images** — captions and transcripts, image alt text (the only images are decorative
  inline SVGs, correctly `aria-hidden`), image optimisation, lazy loading, image and video sitemaps.
- **No tabular data** — accessible data tables.
- **Single language, single region** — the entire i18n category except `lang` on `<html>`, which is
  set: hreflang, sitemap hreflang, language switcher, RTL support, plural rules, locale-aware
  content, localised metadata, IDN, writing modes, the `translate` attribute.
- **No drag interactions, no overlays over content** — dragging movements, `inert`, focus not
  obscured.
- **DNS and domain-level, not in this repository** — CAA records, DNSSEC, `_for-sale` records, and
  the `netlify.app` domain is not ours to configure.
- **No API surface** — `/.well-known/api-catalog`, Deprecation and Sunset headers, WebSub,
  Schemamap, A2A agent cards, NLWeb, WebMCP, MCP and tool discovery, Web Bot Auth, DNS-AID, OKF
  bundles, Agentic Resource Discovery.
- **Platform does not support it** — 103 Early Hints, Compression Dictionary Transport (see the
  companion review).
- **Not a native app, not a fediverse server** — apple-app-site-association, assetlinks.json,
  nodeinfo, webfinger.
- **Operational, not code** — monitoring and uptime, maintenance pages, IndexNow.

---

## Open gaps

These are real gaps against a `required` or `recommended` spec that this pass did not close. Each
needs either an asset that cannot be produced from source or a decision that is the owner's to make.

### Needs a design asset

The [favicons](https://specification.website/spec/foundations/favicons/) spec asks for five files;
NFHN ships one 400×400 SVG and points everything at it.

- **`/favicon.ico`** — browsers and crawlers request it from the site root regardless of the
  `<link rel="icon">` tags. Missing, so it 404s in the logs forever.
- **`/apple-touch-icon.png` (180×180)** — currently `<link rel="apple-touch-icon" href="/icon.svg">`.
  iOS does not honour SVG for home screens, so the home-screen icon is a fallback screenshot today.
- **`/icon-192.png`, `/icon-512.png`, and a maskable 512×512** — the manifest declares only the SVG
  with `"sizes": "any"`, which Android handles inconsistently. The declared `"purpose": "any
  maskable"` is also a claim the icon does not honour: it has no 80% safe zone, so a platform
  applying a circular mask will clip it.
- **`og:image`** — no Open Graph image at all, so link previews on every platform render as bare
  text. Needs a 1200×675 PNG or JPEG under 300 KB (WhatsApp's cap).

All five need rasterisation from the source SVG, which this environment has no tooling for. Not
worth faking with a hand-drawn approximation.

### Needs an owner decision

- **AI crawler policy.** [robots.txt for AI crawlers](https://specification.website/spec/agent-readiness/robots-for-ai-crawlers/)
  suggests a default that allows retrieval but opts out of training. NFHN's `robots.txt` is currently
  a blanket `Allow: /`. Deliberately left alone: what to allow crawlers to train on is an editorial
  call, made more delicate by the fact that the content is Hacker News' rather than ours. The
  mechanics are a five-line edit whenever you want it.
- **Privacy policy.** Graded `required`. NFHN collects nothing server-side, but it does put data in
  the visitor's browser (theme, saved stories, an IndexedDB sync queue). A short factual page would
  satisfy the spec; it is left unwritten because it speaks in the site owner's voice, and `llms.txt`
  now documents the same facts in the meantime.

### Worth doing, not done here

- **Colour contrast** could not be verified from source. The palette uses `oklch()` relative-colour
  derivations, so the computed values need measuring in a browser against the WCAG thresholds rather
  than eyeballing. Lighthouse CI is already wired up (`lighthouserc.json`) and is the right place.
- **Breadcrumbs** — `BreadcrumbList` JSON-LD on item pages would let search results show
  `NFHN › Top › story` instead of a bare URL.
- **Feed discovery** — there is no RSS/Atom feed to discover, so no `rel="alternate"`. A feed would
  be a genuine addition for a reader app, but it is a feature, not a conformance fix.
- **Reporting API** — `Reporting-Endpoints` plus CSP `report-to` would surface violations, but needs
  a collector endpoint to send them to.

---

## Unrelated observation

`static/` contains committed `.br`, `.gz` and `.zst` copies of every asset. Nothing references or
serves them: Netlify serves the publish directory literally and negotiates compression itself, so
`/app.js.br` is reachable only as its own URL. They were already dead weight; this pass edited
`app.js`, `styles.css` and `manifest.json` without regenerating them, so they are now stale dead
weight. Deleting all 20 is probably right, but that is a call for the repository owner rather than a
spec-conformance change.
