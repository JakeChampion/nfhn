# ADR-004: Caching Strategy

## Status
Accepted

## Context

HN content updates frequently but not instantly. We need to balance:
- Freshness: Users want recent content
- Performance: Cache hits are fast
- API load: Don't overwhelm upstream HN APIs
- User experience: Stale content is better than errors

## Decision

Implement a multi-tier caching strategy:

### 1. Browser Cache (Cache-Control headers)
```
Cache-Control: public, max-age=30, stale-while-revalidate=300
```
- Short `max-age` ensures reasonable freshness
- `stale-while-revalidate` allows serving stale while fetching fresh

### 2. Edge Cache (Netlify's CDN)
- Configured via `cache: "manual"` in function config
- Programmable cache API for fine-grained control

### 3. Stale-While-Revalidate Pattern
```typescript
// Fresh: serve immediately
if (cachedAge <= TTL) return cached;

// Stale but acceptable: serve and revalidate in background
if (cachedAge <= TTL + SWR) {
  revalidateInBackground();
  return cached;
}

// Too stale: fetch fresh
return fetchFresh();
```

### 4. Adaptive TTLs
Different content types have different cache durations:
- Feeds: 30s TTL, 5min SWR (change frequently)
- Items: 60s TTL, 10min SWR (comments update)
- Users: 5min TTL, 1hr SWR (rarely change)
- Hot items: Shorter TTLs for active discussions

## Consequences

### Positive
- **Fast responses**: Most requests served from cache
- **Resilience**: Stale content served during API outages
- **Reduced API load**: Fewer upstream requests
- **Graceful degradation**: Circuit breaker prevents cascading failures

### Negative
- **Stale content**: Users may see slightly outdated data
- **Cache invalidation**: No way to force-refresh
- **Complexity**: Multiple cache layers to reason about
- **Memory**: Edge cache has size limits

### Configuration

```typescript
// config.ts
export const FEED_TTL_SECONDS = 30;
export const FEED_STALE_SECONDS = 300;
export const ITEM_TTL_SECONDS = 60;
export const ITEM_STALE_SECONDS = 600;
export const USER_TTL_SECONDS = 300;
export const USER_STALE_SECONDS = 3600;
```

### Conditional Requests

We support `ETag` and `Last-Modified` headers:
- Generate ETags from content hashes
- Return `304 Not Modified` when appropriate
- Reduces bandwidth for unchanged content

## References
- [Cache implementation](../netlify/edge-functions/lib/cache.ts)
- [HTTP Caching - MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
- [Stale-while-revalidate](https://web.dev/stale-while-revalidate/)
