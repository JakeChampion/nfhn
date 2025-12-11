import { Readability } from "./lib/readability.js";
// deno-lint-ignore no-import-prefix
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

// Escape HTML to prevent XSS
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char] ?? char);
}

// Estimate reading time (average 200 words per minute)
function estimateReadingTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

// Validate and normalize URL
function normalizeUrl(url: string): string | null {
  // Add protocol if missing
  if (!/^https?:\/\//.test(url)) {
    url = "https://" + url;
  }

  try {
    const parsed = new URL(url);
    // Only allow http/https
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

export default async (req: Request) => {
  // need to slice off /reader/
  const requestUrl = new URL(req.url);
  const rawUrl = requestUrl.pathname.slice(8);

  // No URL provided - show instructions
  if (!rawUrl) {
    return new Response(renderInstructions(), {
      status: 200,
      headers: getHeaders(),
    });
  }

  // Validate URL
  const url = normalizeUrl(rawUrl);
  if (!url) {
    return new Response(renderError("Invalid URL", "The URL provided is not valid."), {
      status: 400,
      headers: getHeaders(),
    });
  }

  try {
    const pageUrl = new URL(url);
    const fallbackURI = pageUrl.origin + pageUrl.pathname;

    const { data: pageContent, error } = await fetchDocument(url);
    if (error) throw error;

    const doc = new DOMParser().parseFromString(pageContent, "text/html");
    if (doc === null) throw Error("Unable to parse page content");

    const reader = new Readability(doc, { fallbackURI });
    const parsed = reader.parse();

    if (!parsed || !parsed.content) {
      throw Error("Could not extract readable content from this page");
    }

    const title = (parsed.title as string) || "Untitled";
    const content = parsed.content as string;
    const textContent = parsed.textContent as string || "";
    const readingTime = estimateReadingTime(textContent);

    return new Response(renderHtml(url, title, content, readingTime), {
      status: 200,
      headers: getHeaders(),
    });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(
      renderError("Unable to load article", message),
      {
        status: 500,
        headers: getHeaders(),
      }
    );
  }
};

function getHeaders(): HeadersInit {
  return {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy":
      "default-src 'self'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline'; img-src * data:; frame-ancestors 'none';",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
}

async function fetchDocument(url: string) {
  let data = "",
    error = undefined;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "NFHN Reader (https://nfhn.netlify.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      throw Error(`Failed to fetch: ${res.status} ${res.statusText}`);
    }
    data = await res.text();
  } catch (e) {
    error = e;
  }

  return { data, error };
}

function getStyles(): string {
  return `
    /* Light theme (default) */
    :root,
    :root[data-theme="light"] {
      --background: #f5f5f5;
      --background-elevated: #ffffff;
      --text-strong: #111827;
      --text-primary: #1f2937;
      --text-muted: #4b5563;
      --border-color: rgba(0, 0, 0, 0.1);
      --link-color: #2563eb;
      --link-hover: #1d4ed8;
      color-scheme: light;
    }

    /* Dark theme */
    :root[data-theme="dark"] {
      --background: #0d1117;
      --background-elevated: #161b22;
      --text-strong: #f0f6fc;
      --text-primary: #c9d1d9;
      --text-muted: #8b949e;
      --border-color: rgba(255, 255, 255, 0.1);
      --link-color: #58a6ff;
      --link-hover: #79b8ff;
      color-scheme: dark;
    }

    /* Auto theme - follows system preference */
    @media (prefers-color-scheme: dark) {
      :root[data-theme="auto"] {
        --background: #0d1117;
        --background-elevated: #161b22;
        --text-strong: #f0f6fc;
        --text-primary: #c9d1d9;
        --text-muted: #8b949e;
        --border-color: rgba(255, 255, 255, 0.1);
        --link-color: #58a6ff;
        --link-hover: #79b8ff;
        color-scheme: dark;
      }
    }

    * {
      box-sizing: border-box;
    }

    body {
      padding: 0 1rem;
      margin: 0 auto;
      max-width: 42rem;
      line-height: 1.7;
      font-size: 1.125rem;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
      color: var(--text-primary);
      background: var(--background);
    }

    a {
      color: var(--link-color);
      text-decoration: none;
    }

    a:hover {
      color: var(--link-hover);
      text-decoration: underline;
    }

    .skip-link {
      position: absolute;
      top: -40px;
      left: 0;
      background: var(--background-elevated);
      padding: 0.5rem 1rem;
      z-index: 100;
    }

    .skip-link:focus {
      top: 0;
    }

    .reader-header {
      padding: 2rem 0 1rem;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 2rem;
    }

    .reader-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
    }

    .reader-meta {
      display: flex;
      gap: 1rem;
      color: var(--text-muted);
      font-size: 0.875rem;
      margin-top: 0.75rem;
    }

    h1 {
      font-size: 1.75rem;
      line-height: 1.3;
      color: var(--text-strong);
      margin: 0;
    }

    h2, h3, h4 {
      line-height: 1.3;
      color: var(--text-strong);
      margin-top: 2rem;
      margin-bottom: 1rem;
    }

    p {
      margin: 1rem 0;
    }

    img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
    }

    figure {
      margin: 1.5rem 0;
      padding: 0;
    }

    figcaption {
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-top: 0.5rem;
    }

    blockquote {
      margin: 1.5rem 0;
      padding: 0 1rem;
      border-left: 3px solid var(--border-color);
      color: var(--text-muted);
    }

    pre, code {
      font-family: ui-monospace, "SF Mono", Menlo, Monaco, monospace;
      font-size: 0.875rem;
    }

    pre {
      background: var(--background-elevated);
      padding: 1rem;
      border-radius: 6px;
      overflow-x: auto;
      border: 1px solid var(--border-color);
    }

    code {
      background: var(--background-elevated);
      padding: 0.125rem 0.375rem;
      border-radius: 3px;
    }

    pre code {
      background: none;
      padding: 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
      overflow-x: auto;
      display: block;
    }

    th, td {
      padding: 0.5rem;
      border: 1px solid var(--border-color);
      text-align: left;
    }

    th {
      background: var(--background-elevated);
    }

    .theme-toggle {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .theme-toggle fieldset {
      display: flex;
      gap: 0.25rem;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 0.2rem;
      margin: 0;
      background: var(--background-elevated);
    }

    .theme-toggle legend {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
    }

    .theme-toggle input[type="radio"] {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
    }

    .theme-toggle label {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 4px;
      cursor: pointer;
      color: var(--text-muted);
      transition: all 0.15s ease;
    }

    .theme-toggle input[type="radio"]:checked + label {
      background: var(--background);
      color: var(--text-strong);
    }

    .theme-toggle input[type="radio"]:focus-visible + label {
      outline: 2px solid var(--link-color);
      outline-offset: 2px;
    }

    .error-page {
      text-align: center;
      padding: 4rem 1rem;
    }

    .error-page h1 {
      color: var(--text-strong);
    }

    .error-page p {
      color: var(--text-muted);
    }

    .instructions {
      padding: 4rem 1rem;
    }

    .instructions h1 {
      margin-bottom: 1rem;
    }
  `;
}

function getThemeScript(): string {
  return `
    (function() {
      const theme = localStorage.getItem('theme') || 'auto';
      document.documentElement.setAttribute('data-theme', theme);

      document.querySelectorAll('input[name="theme"]').forEach(radio => {
        if (radio.value === theme) radio.checked = true;
        radio.addEventListener('change', (e) => {
          const newTheme = e.target.value;
          document.documentElement.setAttribute('data-theme', newTheme);
          localStorage.setItem('theme', newTheme);
        });
      });
    })();
  `;
}

function getThemeToggle(): string {
  return `
    <div class="theme-toggle">
      <fieldset>
        <legend>Theme</legend>
        <input type="radio" id="theme-light" name="theme" value="light">
        <label for="theme-light" title="Light theme">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
        </label>
        <input type="radio" id="theme-dark" name="theme" value="dark">
        <label for="theme-dark" title="Dark theme">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </label>
        <input type="radio" id="theme-auto" name="theme" value="auto">
        <label for="theme-auto" title="System theme">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </label>
      </fieldset>
    </div>
  `;
}

function renderHtml(url: string, title: string, content: string, readingTime: number): string {
  const safeTitle = escapeHtml(title);
  const safeUrl = escapeHtml(url);

  return `<!DOCTYPE html>
<html lang="en" data-theme="auto">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} - NFHN Reader</title>
  <style>${getStyles()}</style>
</head>
<body>
  <a href="#article" class="skip-link">Skip to content</a>

  <header class="reader-header">
    <nav class="reader-nav">
      <a href="/">← Back to NFHN</a>
      ${getThemeToggle()}
    </nav>
    <h1>${safeTitle}</h1>
    <div class="reader-meta">
      <span>${readingTime} min read</span>
      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">Original article ↗</a>
    </div>
  </header>

  <main id="article">
    ${content}
  </main>

  <script>${getThemeScript()}</script>
</body>
</html>`;
}

function renderError(title: string, message: string): string {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);

  return `<!DOCTYPE html>
<html lang="en" data-theme="auto">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} - NFHN Reader</title>
  <style>${getStyles()}</style>
</head>
<body>
  <div class="error-page">
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    <p><a href="/">← Back to NFHN</a></p>
  </div>
  <script>${getThemeScript()}</script>
</body>
</html>`;
}

function renderInstructions(): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="auto">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NFHN Reader</title>
  <style>${getStyles()}</style>
</head>
<body>
  <div class="instructions">
    <h1>NFHN Reader</h1>
    <p>Append a URL to the address bar to read any article in a clean, distraction-free format.</p>
    <p>Example: <code>/reader/https://example.com/article</code></p>
    <p><a href="/">← Back to NFHN</a></p>
  </div>
  <script>${getThemeScript()}</script>
</body>
</html>`;
}

export const config = { path: "/reader/*" };
