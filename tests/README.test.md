# Testing Guide

This directory contains integration and end-to-end tests for the Netlify Edge Functions routes.

## Prerequisites

Install Deno (required for running tests):

```bash
# macOS/Linux
curl -fsSL https://deno.land/install.sh | sh

# Windows (PowerShell)
irm https://deno.land/install.ps1 | iex

# Or using Homebrew
brew install deno
```

## Running Tests

### Run all tests
```bash
npm test
# or
deno test --allow-net --allow-env tests/
```

### Run tests in watch mode
```bash
npm run test:watch
# or
deno test --allow-net --allow-env --watch tests/
```

### Run specific test file
```bash
deno test --allow-net --allow-env tests/index.test.ts
```

## Test Coverage

The test suite covers:

### 1. **Redirect Routes**
   - `/` → `/top/1` (301 redirect)
   - `/top` → `/top/1` (301 redirect)
   - `/top/` → `/top/1` (301 redirect)

### 2. **Icon Route**
   - `/icon.svg` - Returns SVG with correct content-type

### 3. **Top Stories Route**
   - `/top/:pageNumber` - Valid page numbers (1-20)
   - Invalid page numbers (0, 21, NaN)
   - HTML response with correct content-type

### 4. **Item Route**
   - `/item/:id` - Valid numeric IDs
   - Invalid IDs (non-numeric)
   - Handles API errors (404, 502)

### 5. **User Route**
   - `/user/:name` - Valid usernames
   - Usernames with special characters
   - Handles API errors

### 6. **Error Handling**
   - `/error` - Intentional error handling
   - Non-existent routes return 404
   - Centralized error handler

### 7. **HTTP Methods**
   - Only GET requests are accepted
   - Other methods return 404

## Test Structure

Tests are written using Deno's built-in test framework and assertions. Each test:

1. Creates a request to the Elysia app
2. Validates the response status code
3. Checks response headers (content-type, location)
4. Verifies response body content

## Notes

- Tests make real network requests to external APIs (hnpwa.com)
- Some tests may fail if the external API is down or returns unexpected data
- Backend error tests (502) depend on external API behavior
- Tests run in isolation and don't require a running server
