# Invoker Commands (`command` / `commandfor`)

**Status:** Proposed · **Browser support:** Baseline 2025 (Chromium 135+, Firefox 137+, Safari 18.4+) ·
**Impact:** Medium · **Effort:** Low

## The idea

Invoker Commands let a `<button>` declare what it does to another element, in markup, with no
JavaScript:

```html
<button commandfor="theme-menu" command="toggle-popover">Theme</button>
<div id="theme-menu" popover>…</div>
```

The browser wires up the click handling, the accessibility semantics (`aria-expanded`, `aria-details`
and focus behaviour follow automatically), and keyboard activation. Built-in commands cover popovers
(`show-popover`, `hide-popover`, `toggle-popover`), dialogs (`show-modal`, `close`,
`request-close`) and `<details>` (`toggle`, `open`, `close`).

## Why NFHN in particular

The site already uses the Popover API, and it runs under a CSP with `script-src-attr 'none'` and a
single hash-pinned inline script. Every click handler currently living in `static/app.js` to open a
popover is code that exists only because markup could not express it. `commandfor` deletes that
category of code.

Concretely, candidates in this codebase:

- The theme toggle (`themeToggle` in `render/components.ts`).
- Any popover-based tooltip using the anchor positioning already shipped in proposal 04.
- **Comment thread expand/collapse-all.** This is the good one. `command="toggle"` targets a
  `<details>`, so a "collapse replies" control can live next to `.comment-permalink` in the rendered
  markup with zero JS:

  ```html
  <button commandfor="${comment.id}" command="toggle" class="comment-collapse">−</button>
  ```

  With [proposal 13](./13-details-content-animation.md) the collapse is animated, and the whole
  feature — trigger, animation, accessibility — contains no script at all.

## Custom commands

Commands prefixed with `--` dispatch a `CommandEvent` instead of doing something built-in, which
keeps the declarative wiring even for app-specific behaviour:

```html
<button commandfor="story-42" command="--save">Save</button>
```

```js
document.addEventListener("command", (event) => {
  if (event.command === "--save") saveStory(event.source.closest("[data-id]"));
});
```

One delegated listener replaces per-element handlers, and `event.source` gives the invoking button
without a `closest()` dance from an event target. For NFHN's save/share buttons this is a tidier
shape than what `app.js` does today.

## Progressive enhancement

`commandfor` on a browser that does not support it is an inert attribute — the button does nothing.
That is a real regression, not a graceful degradation, so either:

- rely on it only where support is Baseline and the feature is non-essential, or
- keep the existing JS as a fallback behind a feature test:

  ```js
  if (!("commandForElement" in HTMLButtonElement.prototype)) {
    // existing listeners
  }
  ```

The second is what the repo's established pattern (`'featureName' in window`) calls for, and it lets
the JS be deleted outright once support is universal.

## Sources

- [Invoker Commands on MDN](https://developer.mozilla.org/en-US/docs/Web/API/Invoker_Commands_API)
- [`command` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button#command)
