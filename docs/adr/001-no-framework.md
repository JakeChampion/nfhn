# ADR-001: No Framework Architecture

## Status
Accepted

## Context

When building NFHN, we needed to decide whether to use a frontend framework (React, Vue, Svelte, etc.) or build with vanilla JavaScript/TypeScript.

Considerations:
- The app is primarily read-only content (HN stories and comments)
- Performance is critical - users expect near-instant page loads
- Edge functions have cold start constraints
- Bundle size directly impacts Time to Interactive (TTI)
- Server-side rendering is required for SEO and accessibility

## Decision

We chose to build NFHN without any frontend framework, using:
- Custom streaming HTML template literals (`html.ts`)
- Vanilla JavaScript for minimal client-side interactivity
- Server-rendered HTML with progressive enhancement

## Consequences

### Positive
- **Minimal bundle size**: No framework runtime to download/parse
- **Fast cold starts**: Edge functions start faster without framework overhead
- **Full control**: Template rendering is exactly what we need, nothing more
- **No hydration**: No client-server mismatch issues
- **Easy to understand**: Straightforward request → HTML response flow

### Negative
- **Manual work**: Need to build common patterns (components, escaping) ourselves
- **No ecosystem**: Can't use framework-specific libraries/components
- **Testing**: Need custom test utilities instead of framework testing tools
- **Developer familiarity**: Less familiar pattern for developers used to frameworks

### Mitigations
- Created `html.ts` with type-safe template literals and auto-escaping
- Built reusable component functions in `render/components.ts`
- Streaming support built into the template system for optimal TTFB

## References
- [Streaming HTML templates implementation](../netlify/edge-functions/lib/html.ts)
- [Component library](../netlify/edge-functions/lib/render/components.ts)
