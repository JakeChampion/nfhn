# Modern Web API Proposals for NFHN

This directory contains detailed proposals for incorporating modern web APIs and features into the NFHN Hacker News reader.

## Quick Reference

| API | Browser Support | Impact | Effort | Status |
|-----|----------------|--------|--------|--------|
| [View Transitions](./01-view-transitions-api.md) | Baseline 2024 | 🔥 High | Medium | ✅ **Implemented** |
| [Container Queries](./02-container-queries.md) | Baseline 2023 | 🔥 High | Medium | ✅ **Implemented** |
| [Scroll-Driven Animations](./03-scroll-driven-animations.md) | Baseline 2024 | Medium | Low | ✅ **Implemented** |
| [Anchor Positioning](./04-anchor-positioning.md) | Baseline 2024 | Medium | Medium | ✅ **Implemented** |
| [Relative Color Syntax](./05-relative-color-syntax.md) | Baseline 2024 | Medium | Low | ✅ **Implemented** |
| [Document PiP](./06-document-picture-in-picture.md) | Chrome only | 🔥 High | High | Proposed |
| [File System Access](./07-file-system-access-api.md) | Chromium only | Medium | Medium | Proposed |
| [Web Share API](./08-web-share-api.md) | Baseline | Medium | Low | ✅ **Implemented** |
| [Priority Hints](./09-priority-hints.md) | Baseline 2023 | Medium | Low | ✅ **Implemented** |
| [CSS :has()](./10-css-has-selector.md) | Baseline 2023 | 🔥 High | Low | ✅ **Implemented** |
| [Compression Streams](./11-compression-streams-api.md) | Baseline 2023 | Medium | Medium | Proposed |
| [content-visibility](./12-content-visibility.md) | Baseline | 🔥 High | Low | ✅ **Implemented** |
| [::details-content + interpolate-size](./13-details-content-animation.md) | Chromium + Safari | Medium | Low | ✅ **Implemented** |
| [Invoker Commands](./14-invoker-commands.md) | Baseline 2025 | Medium | Low | ✅ **Implemented** |
| [Built-in AI (Summarizer)](./15-built-in-ai.md) | Chrome desktop | 🔥 High | Medium | ✅ **Implemented** |
| [SW Static Routing](./16-service-worker-routing.md) | Chromium | Medium | Low | ✅ **Implemented** |
| [Typography + Intl](./17-typography-and-i18n.md) | mixed | Medium | Low | ✅ **Implemented** |
| [PWA integration surface](./18-pwa-integration-surface.md) | mixed | Medium | Low | ✅ **Implemented** |
| [View Transition types](./19-view-transition-types-and-speculation.md) | Chromium 125+ | Medium | Low | ✅ **Implemented** |
| [Hardening, INP & modern syntax](./20-hardening-inp-and-modern-syntax.md) | mixed | 🔥 High | Low | ✅ **Implemented** |

Platform-side proposals — Netlify Blobs, cache tags, rate limiting, compression dictionaries — live in
[`../netlify-proposals/`](../netlify-proposals/README.md).

## Implementation Priority

### Phase 1: Quick Wins (CSS-only, well-supported) ✅ COMPLETE
1. **CSS :has()** ✅ - Replace JavaScript state management with pure CSS
2. **Container Queries** ✅ - Make components responsive to their container
3. **Priority Hints** ✅ - Optimize loading with `fetchpriority`
4. **Relative Color Syntax** ✅ - Simplify theme system with oklch() relative colors

### Phase 2: Enhanced UX (Requires JS, well-supported) ✅ COMPLETE
5. **View Transitions** ✅ - Smooth page navigation animations (pre-existing)
6. **Scroll-Driven Animations** ✅ - Reading progress, parallax effects
7. **Web Share API** ✅ - Native sharing functionality (pre-existing)
8. **Anchor Positioning** ✅ - Better tooltips and popovers

### Phase 3: Power Features (Limited browser support)
9. **Compression Streams** - Reduce storage usage
10. **File System Access** - Export/import saved stories
11. **Document PiP** - Floating reader mode

### Phase 4: 2026-08 (12–19) ✅ COMPLETE

Implemented in this order, chosen by value-per-hour rather than by number:

1. **[content-visibility](./12-content-visibility.md)** - two CSS properties, and the biggest
   remaining rendering cost on the site (1,000-comment threads) largely goes away
2. **[Intl.RelativeTimeFormat](./17-typography-and-i18n.md)** - fixes a real bug: cached pages
   currently show relative timestamps frozen at render time
3. **[SW static routing + navigation preload](./16-service-worker-routing.md)** - removes service
   worker cold-start from the critical path of every navigation
4. **[expects_no_vary_search](./19-view-transition-types-and-speculation.md)** - completes the
   No-Vary-Search work already shipped; a few lines
5. **[share_target](./18-pwa-integration-surface.md)** - makes NFHN a target in the OS share sheet,
   feeding straight into reader mode
6. **[::details-content animation](./13-details-content-animation.md)** and
   **[Invoker Commands](./14-invoker-commands.md)** - comment collapse becomes animated and
   scriptless, which suits the strict CSP
7. **[Built-in AI](./15-built-in-ai.md)** - the most interesting and the most work: on-device thread
   summarisation with no server, no key and no data leaving the device

## Already Implemented

NFHN already uses these modern APIs:
- ✅ Popover API
- ✅ Navigation API
- ✅ Speculation Rules (prerender/prefetch)
- ✅ Service Workers
- ✅ `light-dark()` CSS function
- ✅ IndexedDB
- ✅ **CSS :has() selector** - Parent selection based on descendants/state
- ✅ **Container Queries** - Components adapt to their container size
- ✅ **Priority Hints** - Optimize resource loading with fetchpriority
- ✅ **Relative Color Syntax** - Dynamic color variations with oklch()
- ✅ **View Transitions** - Smooth cross-document page transitions
- ✅ **Scroll-Driven Animations** - Progress indicators, reveal animations
- ✅ **Web Share API** - Native sharing functionality
- ✅ **CSS Anchor Positioning** - Tooltips and popover positioning

## Feature Detection Pattern

All proposals follow this pattern for progressive enhancement:

```javascript
// Feature detection
if ('featureName' in window) {
  // Enhanced experience
} else {
  // Fallback behavior
}
```

```css
/* CSS feature detection */
@supports (property: value) {
  /* Enhanced styles */
}
```

## Files Commonly Modified

Most proposals require changes to these files:

- `static/styles.css` - CSS features
- `static/app.js` - JavaScript APIs
- `static/sw.js` - Service Worker enhancements
- `netlify/edge-functions/lib/render/pages.ts` - HTML templates
- `netlify/edge-functions/lib/render/components.ts` - UI components

## Testing

Test modern APIs across browsers:

```bash
# Run tests
npm test

# Test specific browser
npx playwright test --browser=chromium
npx playwright test --browser=firefox
npx playwright test --browser=webkit
```

## Resources

- [web.dev Baseline](https://web.dev/baseline)
- [Can I Use](https://caniuse.com/)
- [MDN Web Docs](https://developer.mozilla.org/)
- [Chrome Developers](https://developer.chrome.com/docs/web-platform/)
