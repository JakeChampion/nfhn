# 🐱‍💻

You can view the deployed version at <https://nfhn.netlify.app/>

## What is this?

This is a website which displays HackerNews content and is running completely in a Netlify Edge Function.

The implementation uses `Elysia` to handle routing and `@worker-tools/html` for rendering templates.

## Testing

The project includes comprehensive integration tests for all routes. Tests are written using Deno's native test framework.

### Running Tests Locally

```bash
# Install Deno if not already installed
curl -fsSL https://deno.land/install.sh | sh

# Run all tests
npm test

# Or run directly with Deno
deno test --allow-net --allow-env netlify/edge-functions/

# Run in watch mode
npm run test:watch
```

See [netlify/edge-functions/README.test.md](netlify/edge-functions/README.test.md) for detailed test documentation.

### Continuous Integration

Tests run automatically on every push and pull request via GitHub Actions. The workflow:
- Sets up Deno environment
- Runs all integration tests
- Generates coverage reports (optional)

Check the [Tests workflow](.github/workflows/test.yml) for configuration details.
