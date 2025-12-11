# Contributing to NFHN

Thank you for your interest in contributing to NFHN! This document provides guidelines and instructions for contributing.

## 🚀 Quick Start

### Prerequisites

- [Deno](https://deno.land/manual/getting_started/installation) (v2.x) - Used for development, testing, and tooling
- [Node.js](https://nodejs.org/) (v18+) - For npm scripts
- [Netlify CLI](https://docs.netlify.com/cli/get-started/) (optional) - For local development server

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/JakeChampion/nfhn.git
   cd nfhn
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run the development server**
   ```bash
   npm run dev
   # Or directly: netlify dev
   ```

4. **Open in browser**
   Navigate to `http://localhost:8888`

## 📁 Project Structure

```
nfhn/
├── netlify/
│   └── edge-functions/     # Netlify Edge Functions (main app code)
│       ├── lib/            # Shared libraries
│       │   ├── cache.ts    # Programmable cache utilities
│       │   ├── config.ts   # Configuration constants
│       │   ├── errors.ts   # Error page rendering
│       │   ├── feeds.ts    # Feed definitions
│       │   ├── handlers.ts # Request handlers
│       │   ├── hn.ts       # HN API client
│       │   ├── html.ts     # Streaming HTML templates
│       │   ├── logger.ts   # Structured logging
│       │   ├── render/     # Page templates & components
│       │   └── security.ts # Security headers
│       ├── top.ts          # /top/:page endpoint
│       ├── newest.ts       # /newest/:page endpoint
│       ├── ask.ts          # /ask/:page endpoint
│       ├── show.ts         # /show/:page endpoint
│       ├── jobs.ts         # /jobs/:page endpoint
│       ├── item.ts         # /item/:id endpoint
│       ├── user.ts         # /user/:username endpoint
│       ├── saved.ts        # /saved endpoint
│       └── sitemap.ts      # /sitemap.xml endpoint
├── static/                 # Static assets served by Netlify CDN
│   ├── styles.css          # Source CSS
│   ├── icon.svg            # Favicon
│   ├── manifest.json       # PWA manifest
│   ├── robots.txt          # Robots.txt
│   └── sw.js               # Service worker
├── tests/                  # Test files
├── scripts/                # Build scripts
└── .github/workflows/      # CI/CD workflows
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

Tests are located in the `tests/` directory and use Deno's built-in test runner:

- `handler_test.ts` - Integration tests for all routes
- `unit_test.ts` - Unit tests for utility functions

Example test:
```typescript
Deno.test("my feature works", async () => {
  const result = await myFunction();
  assertEquals(result, expected);
});
```

## 🔧 Development Workflow

### Code Style

We use Deno's built-in formatter and linter:

```bash
# Format code
npm run fmt

# Lint code
npm run lint
```

### Type Checking

The project uses strict TypeScript settings. Check types with:

```bash
deno check netlify/edge-functions/**/*.ts tests/**/*.ts
```

## 🎨 Making Changes

### Adding a New Page/Route

1. Create a new edge function in `netlify/edge-functions/`
2. Export a default handler and config:
   ```typescript
   import type { Config, Context } from "@netlify/edge-functions";
   
   export default (request: Request, context: Context) => {
     // Your handler logic
   };
   
   export const config: Config = {
     method: ["GET"],
     path: "/your-path/:param",
     cache: "manual",
   };
   ```

### Modifying Templates

Templates are in `netlify/edge-functions/lib/render/`:
- `components.ts` - Reusable UI components
- `pages.ts` - Full page templates

The HTML templating uses a custom streaming template literal system (`html.ts`).

### Adding Styles

1. Edit `static/styles.css`
3. Test locally with `npm run dev`

## 📋 Pull Request Guidelines

1. **Branch naming**: Use descriptive names like `feature/search` or `fix/cache-bug`

2. **Commit messages**: Follow conventional commits:
   - `feat:` - New features
   - `fix:` - Bug fixes
   - `docs:` - Documentation changes
   - `style:` - Code style changes
   - `refactor:` - Code refactoring
   - `test:` - Test changes
   - `chore:` - Build/tooling changes

3. **Before submitting**:
   - [ ] Run `npm run lint` - No linting errors
   - [ ] Run `npm test` - All tests pass
   - [ ] Run `deno check netlify/edge-functions/**/*.ts` - No type errors

4. **PR description**: Explain what changes were made and why

## 🐛 Reporting Issues

When reporting bugs, please include:
- Browser and version
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

## 📜 Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow

## 📄 License

By contributing, you agree that your contributions will be licensed under the project's ISC License.

---

Questions? Open an issue or reach out to the maintainers!
