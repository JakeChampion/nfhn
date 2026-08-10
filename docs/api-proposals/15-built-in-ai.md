# Built-in AI: on-device summaries and translation

**Status:** Implemented (Summarizer; Translator not yet) · **Browser support:** Chrome 138+ desktop (Summarizer); Translator and Language
Detector desktop-only · **Impact:** 🔥 High · **Effort:** Medium

## The pitch

Chrome ships Gemini Nano with the browser and exposes task-specific APIs over it. No API key, no
server, no network request, no cost per use, and — the part that matters for a site with no accounts
and no analytics — **no data leaves the device.**

For a Hacker News reader there are three obvious applications, in descending order of value.

## 1. Summarise the comment thread

The defining problem of HN is a 900-comment thread where the interesting disagreement is at position
340. NFHN already has the entire thread server-rendered in the DOM.

```js
// static/app.js
if ("Summarizer" in self) {
  const availability = await Summarizer.availability();
  if (availability !== "unavailable") {
    const summarizer = await Summarizer.create({
      type: "key-points",
      format: "markdown",
      length: "short",
      sharedContext: "A Hacker News discussion thread. Identify the main threads of disagreement.",
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => showProgress(e.loaded));
      },
    });

    const stream = summarizer.summarizeStreaming(threadText());
    for await (const chunk of stream) appendToPanel(chunk);
  }
}
```

Two details worth getting right:

- **Stream it.** `summarizeStreaming()` returns chunks; on-device inference is not instant and a
  progressively-filling panel reads far better than a spinner.
- **Handle the model download.** First use may trigger a multi-gigabyte download. `availability()`
  returns `"downloadable"` in that case — that must be a user-initiated action with a progress
  indicator, never something that fires on page load.

Render the result into a `popover` (already in use) triggered by a
[command button](./14-invoker-commands.md).

## 2. Summarise the linked article

`/reader/*` already extracts clean article text with Readability. Summarising it before the reader
commits to a 4,000-word piece is the same API with `type: "tldr"`, and the input is already isolated
from navigation chrome — which is exactly what makes reader-mode text a better summarisation input
than a raw page.

## 3. Translate foreign-language articles and comments

`Translator` plus `LanguageDetector`:

```js
const detected = await LanguageDetector.create().then((d) => d.detect(text));
if (detected[0].detectedLanguage !== "en" && detected[0].confidence > 0.8) {
  offerTranslation(detected[0].detectedLanguage);
}
```

HN regularly links to German, Japanese and Chinese sources. Offering an in-place translation of
reader-mode content, computed locally, is a feature most large news sites do not have.

The full spec review lists NFHN as "single language, single region" and marks the entire i18n category
not-applicable. That is correct about *NFHN's own* UI. It is not correct about the content NFHN
displays, which is whatever HN linked to today.

## Why this fits the project's constraints rather than fighting them

The site has no server-side state, no accounts, no analytics, and a CSP with `connect-src 'self'`.
A conventional "summarise this" feature would break all four: an API key somewhere, a backend route,
per-user cost, and a third-party origin in the CSP. The built-in APIs require none of that —
`connect-src 'self'` stays untouched because there is no fetch.

It is also, bluntly, the most interesting thing on this list. A Hacker News reader that summarises
Hacker News threads locally, with no server, on a site that is one edge function, is a good demo.

## Honest limits

- **Chrome desktop only.** Not Firefox, not Safari, not Chrome on Android. This is strictly an
  enhancement for a subset of visitors, and the UI must not hint at the feature where it is
  unavailable — gate on `availability()`, not on `"Summarizer" in self` alone.
- **Hardware requirements.** Roughly 22 GB free disk and 4 GB VRAM for the foundation-model APIs;
  `availability()` returns `"unavailable"` when unmet.
- **Output is not authoritative.** A summary of a contentious thread is an interpretation. Label it
  as machine-generated, keep the full thread one click away, and never replace the content with it.
- **Input limits.** A 900-comment thread will exceed the input quota. Chunk it — summarise per
  top-level subtree, then summarise the summaries — or truncate by score. Check
  `summarizer.inputQuota` and `measureInputUsage()` rather than guessing.

## Sources

- [Summarizer API | Chrome for Developers](https://developer.chrome.com/docs/ai/summarizer-api)
- [Built-in AI APIs | Chrome for Developers](https://developer.chrome.com/docs/ai/built-in-apis)
- [Experimental polyfills for the built-in AI task APIs](https://developer.chrome.com/docs/ai/task-api-polyfill)
