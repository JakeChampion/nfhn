# ADR-003: Edge-First Deployment

## Status
Accepted

## Context

NFHN needs to serve users globally with minimal latency. Traditional deployment options include:
- Single-region server (high latency for distant users)
- Multi-region servers (complex, expensive)
- CDN with origin server (good for static, less for dynamic)
- Edge computing (code runs near users)

## Decision

Deploy NFHN entirely on Netlify Edge Functions, which run at the edge in 300+ locations worldwide using Deno runtime.

Architecture:
```
User → Nearest Edge Location → Edge Function → HN API
                            ↓
                      Response (HTML)
```

## Consequences

### Positive
- **Low latency**: Code runs within ~50ms of most users
- **No cold starts**: Edge functions are always warm
- **Global scale**: Automatic scaling, no infrastructure management
- **Cost effective**: Pay per invocation, not per server
- **Deno runtime**: Modern TypeScript, Web APIs, better security

### Negative
- **Limited runtime**: No Node.js APIs, limited npm compatibility
- **Execution limits**: 50ms CPU time, 128MB memory on free tier
- **No persistent state**: Must use external storage/cache
- **Vendor lock-in**: Netlify-specific deployment model
- **Debugging**: Harder to debug edge issues

### Mitigations
- Use Deno-compatible libraries only
- Implement efficient caching with Netlify's edge cache
- Circuit breaker pattern for upstream API failures
- Structured logging for debugging
- Keep functions focused and fast

## Technical Details

Each route has its own edge function file:
- `top.ts`, `newest.ts`, etc. for feeds
- `item.ts` for story/comment pages
- `user.ts` for user profiles

Functions share code via `lib/` modules:
- `handlers.ts` - Request handling logic
- `hn.ts` - HN API client
- `cache.ts` - Edge caching utilities
- `render/` - HTML templates

## References
- [Netlify Edge Functions docs](https://docs.netlify.com/edge-functions/overview/)
- [Deno Deploy](https://deno.com/deploy)
