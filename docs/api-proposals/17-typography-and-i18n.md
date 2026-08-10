# Typography and text segmentation: `text-box-trim`, `Intl.Segmenter`, `Intl.RelativeTimeFormat`

**Status:** Proposed · **Browser support:** mixed, see per-item · **Impact:** Medium · **Effort:** Low

NFHN takes typography unusually seriously for a news reader — it ships a TeX line-breaking
implementation (`static/tex-linebreak.js`, `static/justify.js`) and an English hyphenation dictionary
(`static/hyphens_en-us.js`, 27 KB) to justify body text properly. Three platform features fit that
ambition and are not yet used.

## 1. `text-box-trim` / `text-box-edge` — optical vertical rhythm

**Support:** Safari 18.2+, Chromium 133+ (Firefox in progress)

Every text element carries invisible leading above the cap height and below the baseline. It is why a
heading in a padded box never looks vertically centred, and why the gap between a `<summary>` and the
comment body below it never quite matches the designed value. The universal workaround is
hand-tuned negative margins that break whenever the font or size changes.

```css
h1, h2, .story-title, .comment-meta {
  text-box: trim-both cap alphabetic;
}
```

Spacing then measures from the cap height to the baseline — the edges a reader actually perceives —
so declared padding is the padding you see. For a site whose comment list is dense, deeply nested and
composed almost entirely of small text blocks, this compounds: every nesting level currently
accumulates a little optical drift.

Wrap in `@supports (text-box: trim-both cap alphabetic)` and remove the corresponding magic-number
margins inside the guard.

## 2. `Intl.Segmenter` — correct text boundaries

**Support:** Baseline (all engines)

Two places in this codebase split text and both do it the naive way.

**Truncation.** Any `slice()` on a title can split a grapheme cluster — an emoji with a skin-tone
modifier, a family sequence, a Hangul syllable, a combining accent — producing mojibake. HN titles
contain all of these regularly.

```js
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
const truncate = (text, max) => {
  const graphemes = [...segmenter.segment(text)];
  return graphemes.length <= max
    ? text
    : graphemes.slice(0, max).map((s) => s.segment).join("") + "…";
};
```

**Line breaking.** `tex-linebreak.js` needs a list of words and legal break points. Word segmentation
by whitespace is correct for English and wrong for Japanese, Chinese and Thai — which appear in HN
titles and, far more often, in the third-party article text that `/reader/*` justifies.
`granularity: "word"` gets this right per-locale, and it is the input the TeX algorithm actually
wants.

This is also a prerequisite for the OG image generation in
[netlify-proposal 05](../netlify-proposals/05-generated-images.md), where titles have to be fitted
into a fixed-width card.

## 3. `Intl.RelativeTimeFormat` — localised, live-updating timestamps

**Support:** Baseline

`lib/hn.ts` has a hand-rolled `formatTimeAgo()` producing strings like `3 hours ago`, computed at
render time on the server. Two consequences: the string is frozen at the moment of rendering (a page
cached for five minutes says "1 minute ago" when it is six), and it is hardcoded English.

The fix is to render the machine-readable timestamp and let the client format it:

```html
<time datetime="${new Date(item.time * 1000).toISOString()}">${formatTimeAgo(item.time)}</time>
```

```js
const rtf = new Intl.RelativeTimeFormat(navigator.language, { numeric: "auto" });
for (const el of document.querySelectorAll("time[datetime]")) {
  el.textContent = relative(rtf, new Date(el.dateTime));
}
```

Three wins at once: the server string becomes a no-JS fallback rather than the only answer; the
displayed time is correct regardless of how long the page sat in a cache; and `<time datetime>` is
proper machine-readable markup, which the JSON-LD in `render/components.ts` should be consistent with
anyway.

`Intl.DurationFormat` (Baseline 2025) is the related API if a "read time: 6 min" estimate ever lands
in reader mode.

## Ordering

`Intl.RelativeTimeFormat` first — it fixes a real correctness bug (cached pages showing stale relative
times) and is a small, testable change. `Intl.Segmenter` second, as groundwork. `text-box-trim` last;
it is the nicest to look at and the easiest to defer.

## Sources

- [`text-box` on MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/text-box)
- [`Intl.Segmenter` on MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter)
- [`Intl.RelativeTimeFormat` on MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat)
