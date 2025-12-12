# CSS :has() Selector

## Implementation Status

✅ **IMPLEMENTED** - This feature has been implemented in the codebase.

### What was implemented:

1. **Bookmark button state** - Uses `aria-pressed` attribute with `:has()` for parent styling
2. **Story item saved state** - `li:has(.bookmark-btn[aria-pressed="true"])` highlights saved stories
3. **Keyboard navigation detection** - `body:has(:focus-visible) .kbd-hint` shows keyboard hints
4. **Popover open states** - Dims main content when popovers are open
5. **Form validation** - Styles forms based on `:valid`/`:invalid` states
6. **Comment threading** - Highlights parent comments when children are focused
7. **External link indicators** - Adds visual cue for external links
8. **Quantity-based styling** - Adjusts layout based on item count
9. **Sibling-based styling** - Smart borders between items

### Files modified:
- `static/styles.css` - Added comprehensive `:has()` rules
- `static/app.js` - Updated to use `aria-pressed` instead of `.is-saved` class
- `netlify/edge-functions/lib/render/components.ts` - Added `aria-pressed="false"` to bookmark buttons

---

## Overview

The `:has()` relational pseudo-class selects elements based on their descendants, siblings, or subsequent elements. Often called the "parent selector," it enables powerful styling patterns that were previously impossible with CSS alone.

**Browser Support:** Baseline 2023 (Chrome 105+, Safari 15.4+, Firefox 121+)

## Current State in NFHN

NFHN currently uses:
- Traditional descendant selectors
- JavaScript for parent-based styling
- State classes added via JavaScript (e.g., `kbd-focus`)

## Proposed Implementation

### 1. Story Items with External Links

Style story items differently based on link type:

```css
/* Style story items that link to external sites */
.story-item:has(a[href^="http"]:not([href*="news.ycombinator.com"])) {
  /* External link indicator */
  .story-title::after {
    content: " ↗";
    font-size: 0.75em;
    color: var(--text-muted);
  }
}

/* Story items linking to HN (Ask HN, Show HN, etc.) */
.story-item:has(a[href*="news.ycombinator.com"]),
.story-item:has(.story-title:not([href])) {
  /* Self-post styling */
  border-left: 3px solid var(--accent);
}

/* Stories with thumbnails get different layout */
.story-item:has(.story-thumbnail) {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 1rem;
}
```

### 2. Comments with Replies

Style comments based on whether they have replies:

```css
/* Comments with replies */
.comment:has(.comment-replies:not(:empty)) {
  /* Has children indicator */
  border-left-width: 4px;
}

/* Comments without replies */
.comment:not(:has(.comment-replies)) {
  /* Leaf comment styling */
  border-left-style: dashed;
}

/* Parent comment when any child is focused */
.comment:has(.comment:focus-within) {
  background: var(--comment-bg);
}

/* Highlight comment thread when hovering any part */
.comment:has(:hover) {
  background: var(--badge-bg);
}
```

### 3. Forms with Validation State

Style forms based on input validity:

```css
/* Form with invalid inputs */
form:has(:invalid) {
  .submit-btn {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

/* Form with all valid inputs */
form:has(:valid):not(:has(:invalid)) {
  .submit-btn {
    background: var(--success);
    color: white;
  }
}

/* Fieldset containing focused input */
fieldset:has(:focus) {
  border-color: var(--accent);
}

/* Label for invalid input */
label:has(+ input:invalid) {
  color: var(--error);
}

/* Show validation message when input is invalid */
.validation-message {
  display: none;
}

input:invalid + .validation-message,
label:has(input:invalid) .validation-message {
  display: block;
  color: var(--error);
}
```

### 4. Navigation State

Highlight active navigation sections:

```css
/* Nav item when its page is active */
.nav-item:has(a[aria-current="page"]) {
  background: var(--badge-bg);
  border-bottom: 2px solid var(--accent);
}

/* Header when any nav item is hovered */
header:has(.nav-item:hover) {
  /* Subtle highlight on header */
  background: var(--background-elevated);
}

/* Mobile nav open state */
nav:has(#mobile-menu:checked) {
  /* Expand mobile menu */
  .nav-links {
    display: flex;
    flex-direction: column;
  }
}
```

### 5. Story Feed Sections

Style the feed based on content type:

```css
/* Feed containing job posts */
main:has([data-type="job"]) {
  .story-score {
    display: none; /* Jobs don't have scores */
  }
}

/* Feed containing Ask HN posts */
main:has([data-type="ask"]) {
  /* Different accent for Ask HN */
  --feed-accent: oklch(0.7 0.15 280);
}

/* Empty state */
.stories-list:not(:has(.story-item)) {
  &::after {
    content: "No stories found";
    display: block;
    text-align: center;
    padding: 2rem;
    color: var(--text-muted);
  }
}
```

### 6. Saved Stories State

Style based on saved state without JavaScript:

```css
/* Story item when save button is checked/active */
.story-item:has(.save-btn[aria-pressed="true"]) {
  /* Visual indicator for saved items */
  background: linear-gradient(
    to right,
    var(--accent) 0%,
    var(--accent) 3px,
    transparent 3px
  );
}

/* Saved page with no items */
#saved-stories:not(:has(.story-item)) {
  &::before {
    content: "No saved stories yet. Save stories by clicking the bookmark icon.";
    display: block;
    text-align: center;
    padding: 3rem;
    color: var(--text-muted);
  }
}

/* Hide empty state when items exist */
#saved-stories:has(.story-item) .empty-state {
  display: none;
}
```

### 7. Reader Mode Enhancements

Style reader based on content characteristics:

```css
/* Article with images */
.reader-content:has(img) {
  /* Add padding for figure captions */
  figure {
    margin: 2rem 0;
  }
}

/* Article without images (text-only) */
.reader-content:not(:has(img)) {
  /* Increase line height for long-form text */
  line-height: 1.9;
}

/* Article with code blocks */
.reader-content:has(pre) {
  /* Monospace font for technical content */
  --reader-font: ui-monospace, monospace;
}

/* Long article (many paragraphs) */
.reader-content:has(p:nth-child(10)) {
  /* Show table of contents */
  .toc {
    display: block;
  }
}
```

### 8. Interactive State Without JavaScript

Remove need for JS state classes:

```css
/* Keyboard navigation mode */
body:has(:focus-visible) {
  /* Show keyboard hints */
  .kbd-hint {
    opacity: 1;
  }
}

/* Modal open state */
body:has([popover]:popover-open) {
  /* Prevent scroll when modal is open */
  overflow: hidden;
}

/* Settings panel open */
body:has(#settings-menu:popover-open) {
  /* Dim background */
  main {
    opacity: 0.5;
    pointer-events: none;
  }
}

/* Any popover open */
body:has([popover]:popover-open) {
  /* Show backdrop */
  &::before {
    content: "";
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 99;
  }
}
```

### 9. Responsive Layout Decisions

Adjust layout based on content:

```css
/* Story list with many items - use compact layout */
.stories-list:has(.story-item:nth-child(20)) {
  .story-item {
    padding: 0.75rem;
  }
  
  .story-meta {
    font-size: 0.8rem;
  }
}

/* Single story item (item detail page) */
main:has(.story-item:only-child) {
  .story-item {
    /* Expanded layout for single item */
    padding: 2rem;
    border: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
}

/* Comment section with many comments */
.comments-section:has(.comment:nth-child(50)) {
  /* Enable virtualization hint */
  contain: content;
  
  /* Collapse deep threads by default */
  .comment .comment .comment .comment {
    display: none;
  }
}
```

### 10. Error and Loading States

Handle states declaratively:

```css
/* Page with loading indicator */
main:has(.loading-spinner) {
  min-height: 50vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Page with error message */
main:has(.error-message) {
  background: var(--error-light);
  
  .story-list {
    display: none;
  }
}

/* Offline indicator */
body:has(.offline-indicator:not([hidden])) {
  /* Show offline banner */
  header {
    border-top: 3px solid var(--warning);
  }
}
```

### 11. Sibling-Based Styling

Style based on adjacent elements:

```css
/* First story after a date divider */
.date-divider + .story-item {
  border-top: none;
}

/* Story followed by another story (not last) */
.story-item:has(+ .story-item) {
  border-bottom: 1px solid var(--border-color);
}

/* Last story (no sibling) */
.story-item:not(:has(+ .story-item)) {
  border-bottom: none;
  margin-bottom: 2rem;
}

/* Comment followed by sibling comment */
.comment:has(+ .comment) {
  margin-bottom: 0.5rem;
}
```

### 12. Dark Mode Content Adjustments

```css
/* Invert images in dark mode only if they're diagrams/screenshots */
[data-theme="dark"] .reader-content:has(img[src*="diagram"]),
[data-theme="dark"] .reader-content:has(img[src*="screenshot"]) {
  img {
    filter: invert(1) hue-rotate(180deg);
  }
}

/* Don't invert photos */
[data-theme="dark"] .reader-content:has(img[src*="photo"]) img {
  filter: none;
}
```

### 13. Quantity Queries with :has()

```css
/* Different layouts based on item count */

/* 1-5 items: large cards */
.stories-list:has(.story-item:nth-child(5)):not(:has(.story-item:nth-child(6))) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  
  .story-item {
    padding: 1.5rem;
  }
}

/* 6-20 items: standard list */
.stories-list:has(.story-item:nth-child(6)):not(:has(.story-item:nth-child(21))) {
  /* Default list styling */
}

/* 21+ items: compact list */
.stories-list:has(.story-item:nth-child(21)) {
  .story-item {
    padding: 0.5rem 1rem;
  }
  
  .story-thumbnail {
    display: none;
  }
}
```

## Performance Considerations

`:has()` can be expensive if overused. Follow these guidelines:

```css
/* ✅ Good: Scoped to specific elements */
.story-item:has(.saved-indicator) { ... }

/* ⚠️ Avoid: Too broad, checks entire document */
:has(.story-item) { ... }

/* ✅ Good: Combined with other selectors */
main.stories-page:has(.story-item:hover) { ... }

/* ⚠️ Avoid: Complex nested :has() */
:has(:has(:has(.deep))) { ... }
```

## Files to Modify

1. **`static/styles.css`** - Add all :has() based styles
2. **`netlify/edge-functions/lib/render/components.ts`** - Add data attributes for :has() targeting
3. **`static/app.js`** - Remove JavaScript that :has() can replace

## JavaScript to Remove

With `:has()`, we can remove:

```javascript
// Before: JavaScript for parent styling
document.querySelectorAll('.story-item').forEach(item => {
  if (item.querySelector('.saved-indicator')) {
    item.classList.add('is-saved');
  }
});

// After: Pure CSS
// .story-item:has(.saved-indicator) { ... }

// Before: JavaScript for keyboard mode
document.addEventListener('keydown', () => {
  document.body.classList.add('keyboard-mode');
});

// After: Pure CSS
// body:has(:focus-visible) { ... }
```

## Browser Support Fallbacks

```css
/* Fallback for browsers without :has() */
.story-item.is-saved {
  background: var(--saved-bg);
}

/* Enhanced version with :has() */
@supports selector(:has(*)) {
  .story-item:has(.save-btn[aria-pressed="true"]) {
    background: var(--saved-bg);
  }
  
  /* Remove need for .is-saved class */
  .story-item.is-saved {
    background: initial;
  }
}
```

## Benefits for NFHN

1. **Less JavaScript** - Replace state management with CSS
2. **Better Performance** - Native CSS is faster than JS DOM manipulation
3. **Declarative** - Styles are self-documenting
4. **Maintainable** - Logic lives in stylesheets where it belongs
5. **Responsive** - Updates instantly with DOM changes

## References

- [MDN: :has() selector](https://developer.mozilla.org/en-US/docs/Web/CSS/:has)
- [Chrome Developers: :has()](https://developer.chrome.com/docs/css-ui/css-has)
- [CSS :has() Guide](https://ishadeed.com/article/css-has-guide/)
- [Practical Uses for :has()](https://12daysofweb.dev/2023/css-has-selector/)
