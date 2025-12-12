# Priority Hints (fetchpriority)

## Overview

Priority Hints allow developers to indicate the relative importance of resources to the browser, helping optimize loading order. The `fetchpriority` attribute can be set to `high`, `low`, or `auto` on `<img>`, `<link>`, `<script>`, and `<iframe>` elements, as well as in the Fetch API.

**Browser Support:** Baseline 2023 (Chrome 101+, Safari 17.2+, Firefox 132+)

## Current State in NFHN

NFHN currently:
- Uses preconnect hints for HN API and external domains
- Has prerender/prefetch on hover for navigation
- Does not optimize resource loading priority
- All resources load with browser default priorities

## Proposed Implementation

### 1. Optimize LCP (Largest Contentful Paint)

Prioritize above-the-fold content:

#### Server-Side Template Updates (`render/pages.ts`)

```typescript
// In the HTML head
export const head = (title: string) => html`
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    
    <!-- High priority: Critical CSS -->
    <link rel="stylesheet" href="/styles.css" fetchpriority="high">
    
    <!-- High priority: Preconnect to critical origins -->
    <link rel="preconnect" href="https://hacker-news.firebaseio.com" fetchpriority="high">
    
    <!-- Low priority: Non-critical preloads -->
    <link rel="prefetch" href="/app.js" fetchpriority="low">
    
    <!-- Preload LCP image if applicable -->
    <link rel="preload" as="image" href="/icon.svg" fetchpriority="high">
  </head>
`;
```

### 2. Story List Image Priorities

Prioritize visible stories, deprioritize below-fold:

```typescript
// In render/components.ts
export const storyItem = (story: Story, index: number) => {
  // First 5 stories are likely above the fold
  const isAboveFold = index < 5;
  const priority = isAboveFold ? 'high' : 'low';
  
  return html`
    <li class="story-item">
      ${story.thumbnail ? html`
        <img 
          src="${story.thumbnail}"
          alt=""
          loading="${isAboveFold ? 'eager' : 'lazy'}"
          fetchpriority="${priority}"
          width="80"
          height="80"
        >
      ` : ''}
      <div class="story-content">
        <a href="${story.url}" class="story-title">${story.title}</a>
        ...
      </div>
    </li>
  `;
};
```

### 3. Reader Mode Resource Priorities

Optimize article content loading:

```typescript
// In reader.ts
function prioritizeReaderContent(html: string, isAboveFold: boolean): string {
  // Parse and modify image priorities
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  const images = doc.querySelectorAll('img');
  images.forEach((img, index) => {
    if (index === 0) {
      // First image is likely hero/LCP
      img.setAttribute('fetchpriority', 'high');
      img.setAttribute('loading', 'eager');
    } else {
      img.setAttribute('fetchpriority', 'low');
      img.setAttribute('loading', 'lazy');
    }
  });
  
  // Deprioritize iframes (videos, embeds)
  const iframes = doc.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    iframe.setAttribute('fetchpriority', 'low');
    iframe.setAttribute('loading', 'lazy');
  });
  
  return doc.body.innerHTML;
}
```

### 4. Script Loading Priorities

Optimize JavaScript loading:

```typescript
// In render/pages.ts - bottom of body
export const scripts = () => html`
  <!-- Critical: Theme initialization (inline, no fetchpriority needed) -->
  <script>
    document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'auto');
  </script>
  
  <!-- High priority: Main app functionality -->
  <script src="/app.js" fetchpriority="high" defer></script>
  
  <!-- Low priority: Analytics, non-critical features -->
  <script src="/analytics.js" fetchpriority="low" defer></script>
  
  <!-- Low priority: Text justification (enhancement only) -->
  <script src="/justify.js" fetchpriority="low" defer></script>
`;
```

### 5. Fetch API Priority Hints

Prioritize API calls appropriately:

```typescript
// In lib/hn.ts
export async function fetchStoriesPage(
  feed: FeedSlug,
  page: number,
  options: { priority?: 'high' | 'low' | 'auto' } = {}
): Promise<Story[]> {
  const { priority = 'auto' } = options;
  
  // Fetch story IDs
  const idsResponse = await fetch(
    `${HN_API_BASE}/${feed}stories.json`,
    { priority }
  );
  const ids = await idsResponse.json();
  
  // Fetch individual stories
  // First page stories are high priority, pagination is low
  const storyPriority = page === 1 ? 'high' : 'low';
  
  const stories = await Promise.all(
    ids.slice(startIndex, endIndex).map(id =>
      fetch(`${HN_API_BASE}/item/${id}.json`, { priority: storyPriority })
        .then(r => r.json())
    )
  );
  
  return stories;
}
```

### 6. Reader Mode Content Fetching

```typescript
// In reader.ts
async function fetchArticleContent(url: string): Promise<string> {
  // High priority for the main article
  const response = await fetch(url, {
    priority: 'high',
    headers: {
      'User-Agent': 'NFHN Reader Bot'
    }
  });
  
  return response.text();
}

// Low priority for related content
async function fetchRelatedArticles(urls: string[]): Promise<string[]> {
  return Promise.all(
    urls.map(url => 
      fetch(url, { priority: 'low' }).then(r => r.text())
    )
  );
}
```

### 7. Preload Critical Resources

```typescript
// In render/pages.ts
export const preloadHints = (feed: FeedSlug) => html`
  <!-- Preload next page of stories (low priority) -->
  <link 
    rel="prefetch" 
    href="/${feed}?p=2" 
    as="document"
    fetchpriority="low"
  >
  
  <!-- Preload common navigation targets -->
  <link 
    rel="prefetch" 
    href="/newest" 
    as="document"
    fetchpriority="low"
  >
`;
```

### 8. Comment Thread Priorities

Prioritize visible comments:

```typescript
// In item.ts
export const commentItem = (comment: Comment, depth: number, index: number) => {
  // Top-level comments and first few are high priority
  const isImportant = depth === 0 && index < 5;
  
  return html`
    <details 
      class="comment" 
      open="${depth < 2 || index < 3}"
      data-priority="${isImportant ? 'high' : 'low'}"
    >
      <summary>
        <span class="comment-author">${comment.by}</span>
        <time>${comment.time}</time>
      </summary>
      <div class="comment-body">
        ${comment.text}
      </div>
      ${comment.kids?.length ? html`
        <div class="comment-replies">
          <!-- Child comments loaded with lower priority -->
          ${comment.kids.map((kid, i) => 
            commentItem(kid, depth + 1, i)
          )}
        </div>
      ` : ''}
    </details>
  `;
};
```

### 9. Image Optimization with Priority

Combine with responsive images:

```typescript
// In reader.ts - image processing
function optimizeImages(html: string): string {
  return html.replace(
    /<img([^>]*)src="([^"]*)"([^>]*)>/gi,
    (match, before, src, after, index) => {
      const isFirst = index === 0;
      const priority = isFirst ? 'high' : 'low';
      const loading = isFirst ? 'eager' : 'lazy';
      
      return `<img${before}
        src="${src}"
        fetchpriority="${priority}"
        loading="${loading}"
        decoding="${isFirst ? 'sync' : 'async'}"
        ${after}>`;
    }
  );
}
```

### 10. Resource Hints in Service Worker

```javascript
// In sw.js - prioritize cache strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Check for priority hint in request
  // Note: fetchpriority isn't directly accessible, but we can infer from URL patterns
  
  // High priority: HTML pages, critical CSS
  if (
    request.destination === 'document' ||
    url.pathname === '/styles.css'
  ) {
    event.respondWith(networkFirst(request));
    return;
  }
  
  // Low priority: Images, non-critical scripts
  if (
    request.destination === 'image' ||
    url.pathname.includes('analytics')
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }
  
  // Default
  event.respondWith(staleWhileRevalidate(request));
});
```

### 11. Dynamic Priority Updates

Adjust priorities based on user behavior:

```javascript
// In app.js
function observeVisibility() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const img = entry.target.querySelector('img[loading="lazy"]');
      if (img && entry.isIntersecting) {
        // Boost priority when about to become visible
        // Note: fetchpriority can't be changed after load starts,
        // but we can trigger loading
        img.loading = 'eager';
      }
    });
  }, {
    rootMargin: '200px' // Start loading 200px before visible
  });
  
  document.querySelectorAll('.story-item').forEach(item => {
    observer.observe(item);
  });
}
```

## Performance Metrics

Track the impact of priority hints:

```javascript
// In app.js
function trackLoadingMetrics() {
  if (!('PerformanceObserver' in window)) return;
  
  // Track LCP
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lcp = entries[entries.length - 1];
    console.log('LCP:', lcp.startTime, lcp.element);
    
    // Send to analytics
    sendMetric('lcp', lcp.startTime);
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  
  // Track resource loading
  new PerformanceObserver((list) => {
    list.getEntries().forEach(entry => {
      if (entry.initiatorType === 'img' || entry.initiatorType === 'script') {
        console.log(`${entry.name}: ${entry.duration}ms`);
      }
    });
  }).observe({ type: 'resource', buffered: true });
}
```

## Files to Modify

1. **`netlify/edge-functions/lib/render/pages.ts`** - Add priority hints to head, scripts
2. **`netlify/edge-functions/lib/render/components.ts`** - Add fetchpriority to images
3. **`netlify/edge-functions/reader.ts`** - Optimize reader content priorities
4. **`netlify/edge-functions/lib/hn.ts`** - Add priority to fetch calls
5. **`static/sw.js`** - Priority-aware caching strategies
6. **`static/app.js`** - Dynamic priority adjustments

## Expected Impact

| Metric | Before | After (Expected) |
|--------|--------|------------------|
| LCP | ~2.5s | ~1.8s |
| FCP | ~1.5s | ~1.2s |
| TTI | ~3.0s | ~2.5s |
| CLS | 0.1 | 0.05 |

## Testing

Use Lighthouse and WebPageTest to measure improvements:

```bash
# Run Lighthouse
npx lighthouse https://nfhn.netlify.app --view

# Check resource priorities in DevTools
# Network tab > Right-click headers > Priority column
```

## Browser DevTools

Monitor priority in Chrome DevTools:
1. Open Network tab
2. Right-click column headers
3. Enable "Priority" column
4. Observe resource loading order

## Best Practices

1. **Don't over-prioritize** - Only mark truly critical resources as high
2. **Measure impact** - Use RUM data to validate improvements
3. **Consider mobile** - Mobile networks benefit most from hints
4. **Test variations** - A/B test priority configurations
5. **Combine with lazy loading** - Use both for optimal results

## References

- [MDN: fetchpriority](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#fetchpriority)
- [web.dev: Priority Hints](https://web.dev/articles/priority-hints)
- [Chrome Developers: Optimizing Resource Loading](https://developer.chrome.com/docs/lighthouse/performance/uses-rel-preload/)
- [Fetch Priority Specification](https://wicg.github.io/priority-hints/)
