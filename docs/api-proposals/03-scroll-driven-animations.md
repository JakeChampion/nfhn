# Scroll-Driven Animations

## Status: ✅ IMPLEMENTED

**Implementation Date:** Phase 2

## Overview

Scroll-Driven Animations allow CSS animations to be linked to scroll progress, enabling scroll-based effects without JavaScript. This includes scroll progress animations and view-based animations triggered when elements enter/exit the viewport.

**Browser Support:** Baseline 2024 (Chrome 115+, Safari 18+, Firefox 132+)

## Implementation Summary

Scroll-Driven Animations have been implemented with the following features:

### Features Implemented
1. **Reading Progress Indicator** - A thin progress bar at the top of every page showing scroll progress through the document using `animation-timeline: scroll(root)`
2. **Story Item Reveal** - Stories fade in and slide up as they enter the viewport using `animation-timeline: view()`
3. **Comment Reveal Animations** - Comments subtly animate in when scrolling, with nested comments having staggered delays
4. **Back to Top Button** - A floating button that appears after scrolling down, using scroll-linked opacity animation
5. **Reduced Motion Support** - All animations disabled for users who prefer reduced motion

### Location in Codebase
- CSS: `static/styles.css` (Scroll-Driven Animations section)
- Components: `netlify/edge-functions/lib/render/components.ts` (`readingProgress()`, `backToTop()`)
- Pages: `netlify/edge-functions/lib/render/pages.ts` (components added to all pages)

---

## Original Proposal

### 1. Reading Progress Indicator

Add a progress bar that shows how far the user has scrolled through an article.

#### CSS Implementation (`styles.css`)

```css
/* Progress bar at top of page */
.reading-progress {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: var(--border-color);
  z-index: 1000;
  transform-origin: left;
}

.reading-progress::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--accent-color, #ff6600);
  transform: scaleX(0);
  transform-origin: left;
  
  /* Link to scroll progress */
  animation: progress-grow linear;
  animation-timeline: scroll(root);
}

@keyframes progress-grow {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

/* Alternative: Use timeline-scope for specific container */
.reader-article {
  timeline-scope: --article-scroll;
}

.reader-content {
  overflow-y: auto;
  scroll-timeline: --article-scroll block;
}

.reader-progress::after {
  animation-timeline: --article-scroll;
}
```

#### HTML Update (`reader.ts`)

```html
<div class="reading-progress" aria-hidden="true"></div>
<article class="reader-article">
  <div class="reader-content">
    <!-- Article content -->
  </div>
</article>
```

### 2. Story Item Reveal Animations

Animate story items as they scroll into view:

```css
/* Story list reveal animation */
.story-item {
  opacity: 0;
  transform: translateY(20px);
  
  animation: reveal-item linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 100%;
}

@keyframes reveal-item {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Staggered reveal for list items */
.story-item:nth-child(1) { animation-delay: 0ms; }
.story-item:nth-child(2) { animation-delay: 50ms; }
.story-item:nth-child(3) { animation-delay: 100ms; }
/* ... etc */
```

### 3. Comment Thread Animations

Reveal comments as they scroll into view:

```css
/* Comments reveal on scroll */
.comment {
  animation: comment-reveal linear both;
  animation-timeline: view();
  animation-range: entry 10% entry 40%;
}

@keyframes comment-reveal {
  from {
    opacity: 0;
    transform: translateX(-10px);
    border-left-color: transparent;
  }
  to {
    opacity: 1;
    transform: translateX(0);
    border-left-color: var(--border-color);
  }
}

/* Nested comments animate slightly later */
.comment .comment {
  animation-range: entry 15% entry 45%;
}

.comment .comment .comment {
  animation-range: entry 20% entry 50%;
}
```

### 4. Header Shrink on Scroll

Compact header when scrolling down:

```css
/* Header that shrinks on scroll */
header {
  --header-height: 4rem;
  height: var(--header-height);
  
  animation: header-shrink linear both;
  animation-timeline: scroll(root);
  animation-range: 0px 100px;
}

@keyframes header-shrink {
  from {
    --header-height: 4rem;
    padding: 1rem;
  }
  to {
    --header-height: 2.5rem;
    padding: 0.5rem;
  }
}

/* Logo shrinks with header */
.logo {
  animation: logo-shrink linear both;
  animation-timeline: scroll(root);
  animation-range: 0px 100px;
}

@keyframes logo-shrink {
  from {
    font-size: 1.5rem;
  }
  to {
    font-size: 1.1rem;
  }
}
```

### 5. Parallax Images in Reader Mode

Subtle parallax effect on article images:

```css
/* Reader mode parallax images */
.reader-content img {
  animation: parallax linear;
  animation-timeline: view();
  animation-range: entry 0% exit 100%;
}

@keyframes parallax {
  from {
    transform: translateY(30px) scale(1.1);
  }
  to {
    transform: translateY(-30px) scale(1);
  }
}

/* Contain parallax to prevent layout shift */
.reader-content figure {
  overflow: hidden;
}
```

### 6. Back-to-Top Button

Show/hide back-to-top button based on scroll position:

```css
/* Back to top button */
.back-to-top {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  opacity: 0;
  pointer-events: none;
  transform: translateY(10px);
  
  animation: show-back-to-top linear both;
  animation-timeline: scroll(root);
  animation-range: 200px 400px;
}

@keyframes show-back-to-top {
  from {
    opacity: 0;
    pointer-events: none;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }
}
```

#### HTML Component (`render/components.ts`)

```typescript
export const backToTop = () => html`
  <a href="#top" class="back-to-top" aria-label="Back to top">
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24">
      <path d="M12 4l-8 8h5v8h6v-8h5z" fill="currentColor"/>
    </svg>
  </a>
`;
```

### 7. Scroll-Linked Color Changes

Change accent color as user scrolls through story types:

```css
/* Scroll-based theming on feeds page */
.stories-list {
  animation: color-shift linear;
  animation-timeline: scroll(root);
}

@keyframes color-shift {
  0% { --accent-color: #ff6600; }
  50% { --accent-color: #ff8533; }
  100% { --accent-color: #ffa366; }
}
```

### 8. Infinite Scroll Loading Indicator

Visual feedback during infinite scroll loading:

```css
/* Loading indicator at bottom */
.load-more-indicator {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  
  animation: loading-pulse linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 50%;
}

@keyframes loading-pulse {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

### 9. Scroll Snap with Animations

Combine scroll snap with animations for story cards:

```css
/* Horizontal story carousel with scroll snap */
.story-carousel {
  display: flex;
  gap: 1rem;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-timeline: --carousel block;
}

.story-carousel .story-card {
  scroll-snap-align: center;
  flex: 0 0 300px;
  
  animation: card-focus linear both;
  animation-timeline: view(inline);
  animation-range: contain 0% contain 100%;
}

@keyframes card-focus {
  0%, 100% {
    transform: scale(0.9);
    opacity: 0.7;
  }
  50% {
    transform: scale(1);
    opacity: 1;
  }
}
```

## JavaScript Enhancement

For browsers without scroll timeline support, provide JS fallback:

```javascript
// Fallback for reading progress
if (!CSS.supports('animation-timeline', 'scroll()')) {
  const progressBar = document.querySelector('.reading-progress::after');
  
  if (progressBar) {
    window.addEventListener('scroll', () => {
      const scrollTop = document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollTop / scrollHeight;
      
      progressBar.style.transform = `scaleX(${progress})`;
    }, { passive: true });
  }
}
```

## Files to Modify

1. **`static/styles.css`** - Add all scroll-driven animation definitions
2. **`netlify/edge-functions/lib/render/pages.ts`** - Add progress bar HTML
3. **`netlify/edge-functions/lib/render/components.ts`** - Add back-to-top button
4. **`netlify/edge-functions/reader.ts`** - Add reader progress indicator
5. **`static/app.js`** - Add JS fallback for older browsers

## Accessibility Considerations

Always respect reduced motion preferences:

```css
@media (prefers-reduced-motion: reduce) {
  /* Disable all scroll-driven animations */
  .story-item,
  .comment,
  header,
  .back-to-top,
  .reader-content img {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
  
  /* Keep functional progress indicator, just no animation */
  .reading-progress::after {
    animation: none;
    /* Fall back to JS-driven progress */
  }
}
```

## Performance Benefits

Scroll-driven animations are more performant than JavaScript-based alternatives because:

1. **Compositor Thread** - Animations run on the compositor thread
2. **No Layout Thrashing** - No JavaScript reading scroll position
3. **Automatic Optimization** - Browser handles frame timing
4. **Battery Efficient** - No continuous JS execution

## References

- [MDN: Scroll-driven Animations](https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timeline/scroll)
- [Chrome Developers: Scroll-driven Animations](https://developer.chrome.com/docs/css-ui/scroll-driven-animations)
- [Scroll Timeline Specification](https://drafts.csswg.org/scroll-animations-1/)
