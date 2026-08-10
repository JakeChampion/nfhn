# Generated images: closing the favicon and `og:image` gap without a design tool

**Status:** Partially implemented (maskable icon + SVG card shipped, og:image tag behind NFHN_OG_IMAGES) · **Impact:** Medium · **Effort:** Medium

## The gap

The full spec review lists this under "needs a design asset":

> All five need rasterisation from the source SVG, which this environment has no tooling for.

Missing: `/favicon.ico`, `/apple-touch-icon.png` (180×180), `/icon-192.png`, `/icon-512.png`, a
maskable 512×512, and an `og:image`. The consequence today is that every link to NFHN — on Slack,
Discord, Mastodon, iMessage, anywhere — renders as bare text, and iOS home-screen installs fall back
to a screenshot.

The premise that rasterisation needs local tooling is worth challenging: the platform can do it at
request time.

## Option A: Netlify Image CDN (try this first)

`/.netlify/images?url=…` transforms images on demand, with format negotiation to AVIF/WebP and
explicit `fm=` / `w=` / `h=` / `q=` control. If it accepts SVG input, every missing raster is a URL:

```html
<link rel="apple-touch-icon" href="/.netlify/images?url=/icon.svg&w=180&h=180&fm=png">
```

```json
{ "src": "/.netlify/images?url=/icon.svg&w=512&h=512&fm=png", "sizes": "512x512", "type": "image/png" }
```

**Verify SVG input support before building on this.** Netlify's documentation is explicit about JPEG,
PNG and GIF sources; SVG rasterisation is not confirmed. Ten minutes with `curl` against a deploy
preview settles it.

Two things Image CDN cannot solve regardless:

- **`/favicon.ico`** — browsers request it from the site root literally, and the ICO container is not
  an output format. This one needs a committed file. It is also the least important: the
  `<link rel="icon" type="image/svg+xml">` already covers every browser that reads the markup.
- **The maskable icon.** The review correctly notes that the current icon has no 80% safe zone, so
  `"purpose": "any maskable"` is a false claim. Padding is a design decision — but a *mechanical* one:
  a wrapper SVG that insets the existing artwork to 80% on a solid background is honest, checkable,
  and better than the current claim. That is worth doing regardless of which option below wins.

## Option B: per-story Open Graph images at the edge (the interesting one)

A static `og:image` gets NFHN a logo card. A *dynamic* one gets every HN story its own preview card:
the story title, score, author, and comment count, rendered as an image, generated per item.

An edge function at `/og/item/:id.png`:

1. Fetch the item (already cached — `lib/hn.ts` does this).
2. Compose an SVG from the title, score, and metadata using the existing `html.ts` escaping helpers.
3. Rasterise to PNG with `resvg-wasm`, which runs under Deno Deploy.
4. Return it with a long `Cache-Control` and a `Netlify-Cache-Tag: item:<id>` so
   [purge](./02-cache-tags-and-purge-api.md) invalidates it when the score changes.

```ts
// netlify/edge-functions/og.ts
export const config: Config = { method: ["GET"], path: "/og/item/:id.png" };
```

Then in `pages.ts`:

```html
<meta property="og:image" content="https://nfhn.netlify.app/og/item/${id}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="675">
```

Constraints worth designing around up front:

- **1200×675, under 300 KB** — WhatsApp's cap, as the review notes.
- **Text fitting is the hard part.** HN titles run from 8 to 80 characters. This is a real use for
  `Intl.Segmenter` (see [api-proposal 17](../api-proposals/17-typography-and-i18n.md)) to break and
  truncate on grapheme clusters rather than mangling emoji and combining marks.
- **Fonts.** `resvg` needs font bytes embedded; there is no system font stack in the runtime. One
  subsetted variable font in `static/` is the cost of entry.
- **Cold-start cost.** WASM rasterisation is not free. Cache hard, and consider generating on first
  request then persisting to [Blobs](./03-netlify-blobs.md) so it happens once globally.

Feed pages get a generic card; item pages get a specific one. That is the split that matters, because
item URLs are what people actually paste.

## Recommendation

Do the boring part first (verify Image CDN handles SVG; commit a `favicon.ico`; fix the maskable
claim), then treat Option B as a standalone feature. B is more work than the whole rest of this
directory combined for the visual polish, but it is the only item here that changes how NFHN looks to
people who have never visited it.

## What shipped, and how it differs from the above

- **The maskable icon is fixed.** `scripts/icons.ts` derives `icon-maskable.svg` from `icon.svg` at
  build time - inset to the 80% safe zone on an opaque backdrop - and `manifest.json` now declares
  `any` and `maskable` as two separate icons rather than claiming both of a file that honours
  neither. Generated rather than committed so the two cannot drift.
- **The card route is `/og/item/:id.svg`, not `.png`.** Composing SVG needs no tooling, so that part
  runs today; `resvg-wasm` was not needed and is not a dependency. Rasterisation is delegated to
  Netlify Image CDN via `ogImageUrl()` in `config.ts`.
- **1200×630, not 1200×675.** 1.91:1 is the ratio the major platforms actually crop to.
- **The `og:image` tag is behind `NFHN_OG_IMAGES`, default off.** The one unverified link in the
  chain is whether Image CDN accepts SVG input. With the flag off, link previews are exactly as they
  are today, so switching it on after a deploy-preview check is either an improvement or a no-op.
- **`/favicon.ico` is still missing.** Unchanged: the ICO container is not something the platform can
  produce at request time, so it needs a committed binary.
- **Feed pages still get no card.** Only item URLs got one, on the reasoning above.

## Sources

- [Netlify Image CDN | Netlify Docs](https://docs.netlify.com/build/image-cdn/overview/)
- [How to serve optimized images using Netlify Image CDN](https://developers.netlify.com/guides/how-to-serve-optimized-images-using-netlify-image-cdn/)
