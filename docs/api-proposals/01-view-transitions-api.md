# View Transitions API

## Overview

The View Transitions API provides a mechanism for creating animated transitions between different views of a web application. It can work for both same-document (SPA-style) transitions and cross-document (MPA) transitions.

**Browser Support:** Baseline 2024 (Chrome 111+, Safari 18+, Firefox 129+)

## Current State in NFHN

NFHN already has some foundation work:
- Navigation API tracking in `app.js` for detecting forward/backward navigation
- Sets `data-navDirection` attribute for CSS targeting
- Uses prerender/prefetch on hover for faster navigation

However, **actual view transitions are not yet implemented**.

## Proposed Implementation

### 1. Cross-Document View Transitions (MPA)

Since NFHN is an MPA (each page is server-rendered), we'll use cross-document view transitions.

#### Enable in CSS (`styles.css`)

```css
/* Enable cross-document view transitions */
@view-transition {
  navigation: auto;
}

/* Define which elements should transition */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 0.25s;
}

/* Story list items - morph animation */
.story-item {
  view-transition-name: var(--story-id);
}

/* Main content area */
main {
  view-transition-name: main-content;
}

/* Header stays fixed during transition */
header {
  view-transition-name: header;
}

::view-transition-old(header),
::view-transition-new(header) {
  animation: none;
  mix-blend-mode: normal;
}

/* Navigation direction-aware animations */
[data-nav-direction="forward"]::view-transition-old(main-content) {
  animation: slide-out-left 0.25s ease-out;
}

[data-nav-direction="forward"]::view-transition-new(main-content) {
  animation: slide-in-right 0.25s ease-out;
}

[data-nav-direction="backward"]::view-transition-old(main-content) {
  animation: slide-out-right 0.25s ease-out;
}

[data-nav-direction="backward"]::view-transition-new(main-content) {
  animation: slide-in-left 0.25s ease-out;
}

@keyframes slide-out-left {
  to { transform: translateX(-20%); opacity: 0; }
}

@keyframes slide-in-right {
  from { transform: translateX(20%); opacity: 0; }
}

@keyframes slide-out-right {
  to { transform: translateX(20%); opacity: 0; }
}

@keyframes slide-in-left {
  from { transform: translateX(-20%); opacity: 0; }
}
```

#### Update HTML Template (`render/pages.ts`)

Add meta tag to enable cross-document view transitions:

```html
<meta name="view-transition" content="same-origin">
```

#### Story Item Transitions

When clicking from story list to item detail, morph the story title:

```typescript
// In render/components.ts - story item
export const storyItem = (story: Story, index: number) => html`
  <li class="story-item" style="view-transition-name: story-${story.id}">
    <a href="/item/${story.id}">
      <h2 class="story-title" style="view-transition-name: story-title-${story.id}">
        ${story.title}
      </h2>
    </a>
    ...
  </li>
`;

// In render/pages.ts - item detail page
export const itemPage = (item: Item) => html`
  <article style="view-transition-name: story-${item.id}">
    <h1 style="view-transition-name: story-title-${item.id}">
      ${item.title}
    </h1>
    ...
  </article>
`;
```

### 2. Theme Switching Animation

Use same-document view transitions for smooth theme changes:

```javascript
// In app.js - enhance theme toggle
radio.addEventListener("change", async (e) => {
  const theme = e.target.value;
  
  // Check for View Transitions support
  if (!document.startViewTransition) {
    root.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    return;
  }
  
  // Animate the theme change
  const transition = document.startViewTransition(() => {
    root.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  });
  
  await transition.finished;
});
```

```css
/* Circular reveal animation for theme toggle */
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}

/* Theme toggle specific animation */
::view-transition-new(root) {
  animation: theme-reveal 0.5s ease-out;
}

@keyframes theme-reveal {
  from {
    clip-path: circle(0% at var(--toggle-x, 50%) var(--toggle-y, 0%));
  }
  to {
    clip-path: circle(150% at var(--toggle-x, 50%) var(--toggle-y, 0%));
  }
}
```

### 3. Reader Mode Transition

Smooth transition when entering/exiting reader mode:

```javascript
// When opening reader mode link
async function openReaderMode(url) {
  if (!document.startViewTransition) {
    window.location.href = `/reader/${url}`;
    return;
  }
  
  const transition = document.startViewTransition(async () => {
    // Pre-fetch reader content
    const response = await fetch(`/reader/${url}`);
    const html = await response.text();
    
    // Swap content
    document.body.innerHTML = html;
  });
}
```

### 4. Comment Expand/Collapse Animation

```javascript
// Animate comment thread expansion
async function toggleComment(details) {
  if (!document.startViewTransition) {
    details.open = !details.open;
    return;
  }
  
  await document.startViewTransition(() => {
    details.open = !details.open;
  }).finished;
}
```

## Files to Modify

1. **`static/styles.css`** - Add view transition CSS rules and animations
2. **`netlify/edge-functions/lib/render/pages.ts`** - Add view-transition meta tag
3. **`netlify/edge-functions/lib/render/components.ts`** - Add view-transition-name to story items
4. **`static/app.js`** - Enhance theme toggle and add JS-driven transitions

## Progressive Enhancement

The implementation uses feature detection and gracefully degrades:

```javascript
// Check for support
const supportsViewTransitions = 'startViewTransition' in document;

// For cross-document transitions, check CSS support
const supportsCrossDoc = CSS.supports('view-transition-name', 'none');
```

## Performance Considerations

- View transitions use GPU compositing, so they're performant
- Keep transition durations short (200-300ms) for perceived speed
- Avoid transitioning too many elements simultaneously
- Use `will-change` sparingly and only during transitions

## Accessibility

- Respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
}
```

## References

- [MDN: View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API)
- [Chrome Developers: View Transitions](https://developer.chrome.com/docs/web-platform/view-transitions)
- [Cross-document view transitions](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document)
