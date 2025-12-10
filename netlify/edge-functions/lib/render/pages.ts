// render/pages.ts - Full page templates

import { type HTML, html, unsafeHTML } from "../html.ts";
import { type FeedSlug, type Item } from "../hn.ts";
import {
  commentsSection,
  getTypeMeta,
  headerBar,
  renderStory,
  sharedStyles,
  skipLink,
  themeScript,
  turboScript,
} from "./components.ts";

// --- Inline script to set theme before page renders (prevents flash) ---

const themeInitScript = (): HTML =>
  html`<script>document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'auto');</script>`;

// --- Home page (feed listing) ---

export const home = (
  content: Item[],
  pageNumber: number,
  feed: FeedSlug = "top",
  canonicalUrl?: string,
): HTML =>
  html`
<!DOCTYPE html>
<html lang="en" data-theme="auto">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${themeInitScript()}
    ${canonicalUrl ? html`<link rel="canonical" href="${canonicalUrl}">` : ""}
    <meta name="description" content="Hacker News ${feed} page ${pageNumber}: latest ${feed} stories.">
    <meta property="og:type" content="website">
    <meta property="og:title" content="NFHN: ${feed.charAt(0).toUpperCase() + feed.slice(1)} Stories - Page ${pageNumber}">
    <meta property="og:description" content="Hacker News ${feed} page ${pageNumber}: latest ${feed} stories.">
    ${canonicalUrl ? html`<meta property="og:url" content="${canonicalUrl}">` : ""}
    <meta property="og:site_name" content="NFHN">
    <meta name="twitter:card" content="summary">
    <link rel="icon" type="image/svg+xml" href="/icon.svg">
    ${sharedStyles(pageNumber)}
    <title>NFHN: Page ${pageNumber}</title>
  </head>
  <body>
    ${skipLink()}
    <main id="main-content" aria-label="Main content">
      ${headerBar(feed)}
      <ol>
        ${content.map((data: Item) => renderStory(data))}
      </ol>
      <a href="/${feed}/${pageNumber + 1}" class="more-link">More</a>
    </main>
    ${turboScript()}
    ${themeScript()}
  </body>
</html>
`;

// --- Shell page for article ---

const shellPage = (
  title: string,
  body: HTML,
  canonicalUrl?: string,
  description?: string,
): HTML =>
  (async function* (): AsyncGenerator<string> {
    yield* html`
<!DOCTYPE html>
<html lang="en" data-theme="auto">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${themeInitScript()}
    ${canonicalUrl ? html`<link rel="canonical" href="${canonicalUrl}" />` : ""}
    ${description ? html`<meta name="description" content="${description}" />` : ""}
    <meta property="og:type" content="article">
    <meta property="og:title" content="${title}">
    ${description ? html`<meta property="og:description" content="${description}" />` : ""}
    ${canonicalUrl ? html`<meta property="og:url" content="${canonicalUrl}" />` : ""}
    <meta property="og:site_name" content="NFHN">
    <meta name="twitter:card" content="summary">
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    ${sharedStyles(1)}
    <title>${title}</title>
  </head>
  <body>
    ${skipLink()}
    `;

    yield* body;

    yield* html`
      ${themeScript()}
      </body>
      </html>
    `;
  })();

// --- Article page (single item with comments) ---

export const article = (item: Item, canonicalUrl?: string): HTML => {
  const activeFeed: FeedSlug = item.type === "ask"
    ? "ask"
    : item.type === "show"
    ? "show"
    : item.type === "job"
    ? "jobs"
    : "top";
  const meta = getTypeMeta(item.type);

  return shellPage(
    `NFHN: ${item.title}`,
    html`
      <main id="main-content" aria-label="Main content">
        ${headerBar(activeFeed)}
        <article>
          <a href="${meta.href(item)}">
            <span class="badge ${meta.badgeClass}">${meta.label}</span>
            <h1 class="story-heading">${item.title}</h1>
            ${item.domain
              ? html`
                <small>${item.domain}</small>
              `
              : ""}
          </a>
          ${// Job with no comments: hide points/comments line, just show "posted X ago"
          item.type === "job" && item.comments_count === 0
            ? html`
              <p class="meta-line">posted ${item.time_ago}</p>
            `
            : html`
              <p class="meta-line">
                ${item.points ?? 0} points by ${item.user ?? "[deleted]"} ${item.time_ago}
              </p>
            `}
          <hr />
          ${unsafeHTML(item.content || "")} ${commentsSection(item.comments)}
        </article>
      </main>
      ${turboScript()}
    `,
    canonicalUrl,
    `Hacker News discussion: ${item.title}`,
  );
};
