// errors.ts - Error page rendering

import { escape, HTMLResponse } from "./html.ts";
import { applySecurityHeaders } from "./security.ts";

const errorPageStyles = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
    background-color: whitesmoke;
    margin: 40px auto;
    max-width: 600px;
    line-height: 1.6;
    font-size: 18px;
    padding: 0 1em;
    color: #333;
    text-align: center;
  }
  .actions {
    margin-top: 1em;
  }
  .meta-note {
    font-size: 0.9em;
    opacity: 0.7;
  }
  h1 { margin-bottom: 0.2em; }
  p { margin-top: 0; }
  a {
    color: inherit;
    text-decoration: none;
    border-bottom: 1px solid rgba(0,0,0,0.2);
  }
  a:hover { border-bottom-color: rgba(0,0,0,0.5); }
`;

export const renderErrorPage = (
  status: number,
  title: string,
  description: string,
  requestId?: string,
): Response => {
  const now = new Date();
  const id = requestId ?? crypto.randomUUID();

  const headers = applySecurityHeaders(new Headers());
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");

  return new HTMLResponse(
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escape(title)} | NFHN</title>
    <style>${errorPageStyles}</style>
  </head>
  <body>
    <main aria-live="polite">
      <h1>${escape(title)}</h1>
      <p>${escape(description)}</p>
      <p class="actions"><a href="/">Return to home</a> &middot; <a class="retry" href="">Retry</a></p>
      <p class="meta-note">Request ID: ${escape(id)}<br/>${escape(now.toUTCString())}</p>
    </main>
  </body>
</html>`,
    { status, headers },
  );
};

export const renderOfflinePage = (requestId?: string): Response => {
  const now = new Date();
  const id = requestId ?? crypto.randomUUID();

  const headers = applySecurityHeaders(new Headers());
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");

  return new HTMLResponse(
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Offline | NFHN</title>
    <style>${errorPageStyles}</style>
  </head>
  <body>
    <main aria-live="polite">
      <h1>Offline</h1>
      <p>We can't reach Hacker News right now. Please check your connection and try again.</p>
      <p class="actions"><a class="retry" href="">Retry</a> · <a href="/">Go home</a></p>
      <p class="meta-note">Request ID: ${escape(id)}<br/>${escape(now.toUTCString())}</p>
    </main>
  </body>
</html>`,
    { status: 503, headers },
  );
};
