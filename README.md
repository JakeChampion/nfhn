# 🐱‍💻

You can view the deployed version at <https://nfhn.netlify.app/>

## What is this?

This is a website which displays HackerNews content and is running completely in a Netlify Edge Function.

There’s no framework here: `netlify/edge-functions/lib/handler.ts` handles routing/endpoints directly
and renders HTML via a tiny streaming templating helper (`html.ts` + `render.ts`).

## Quickstart

- Install [Deno](https://deno.land/manual/getting_started/installation) (used for dev, tests, and tooling).
- Clone and install npm deps (only needed for scripts): `npm install`
- Run the test suite: `npm test`
- Lint/format: `npm run lint` and `npm run fmt`

## Testing

The project includes integration-style tests that cover all routes. Tests are written with Deno's
built-in test runner and use mocked fetch/cache APIs (no external services required).

### Running Tests Locally

```bash
# Run all tests via npm script
npm test

# Or run directly with Deno
deno test --allow-net --allow-env tests/

# Watch mode
npm run test:watch
```

### Continuous Integration

GitHub Actions (`.github/workflows/test.yml`) sets up Node+Deno, installs npm dependencies, and runs
`npm run lint && npm test` on every push/PR.
