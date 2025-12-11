# ADR-002: Streaming HTML Templates

## Status
Accepted

## Context

Traditional server-side rendering generates the complete HTML before sending any bytes to the client. This delays Time to First Byte (TTFB) and First Contentful Paint (FCP).

We needed a way to:
- Start sending HTML immediately
- Stream content as it becomes available
- Maintain type safety and XSS protection
- Keep the API simple and ergonomic

## Decision

We implemented a custom streaming HTML template system using:
- Tagged template literals (`html\`...\``)
- Async generators for streaming
- Automatic HTML escaping for interpolated values
- `raw()` helper for trusted HTML content

```typescript
const page = html`
  <!DOCTYPE html>
  <html>
    <head><title>${title}</title></head>
    <body>
      ${header()}
      ${asyncContent}  <!-- Streams as resolved -->
      ${footer()}
    </body>
  </html>
`;
```

## Consequences

### Positive
- **Improved TTFB**: Browser receives `<head>` immediately
- **Progressive rendering**: Content appears as it streams
- **Resource hints work**: `<link rel="preload">` in head loads early
- **Type-safe**: TypeScript catches template errors
- **XSS-safe**: All interpolated strings are escaped by default
- **Composable**: Templates can nest other templates

### Negative
- **Complexity**: Async generators are harder to debug
- **Error handling**: Errors mid-stream are tricky to handle gracefully
- **Caching**: Can't easily cache partial responses
- **Testing**: Need to collect full stream for assertions

### Implementation Details

The system supports:
- Primitives (strings, numbers, booleans)
- Promises (await and stream result)
- Iterables (stream each item)
- Async iterables (stream as resolved)
- Functions (call and stream result)
- Nested HTML templates

The `HTMLResponse` class wraps templates into proper `Response` objects with streaming bodies.

## References
- [HTML template implementation](../netlify/edge-functions/lib/html.ts)
- [HTMLResponse class](../netlify/edge-functions/lib/html.ts#HTMLResponse)
