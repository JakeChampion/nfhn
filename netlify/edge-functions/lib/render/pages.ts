// render/pages.ts - Full page templates

import { type HTML, html, unsafeHTML } from "../html.ts";
import { type FeedSlug, type Item } from "../hn.ts";
import {
  commentsSection,
  getTypeMeta,
  renderNav,
  renderStory,
  sharedStyles,
  turboScript,
} from "./components.ts";

// --- Home page (feed listing) ---

export const home = (
  content: Item[],
  pageNumber: number,
  feed: FeedSlug = "top",
  canonicalUrl?: string,
): HTML =>
  html`
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
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
    <main aria-label="Main content">
      ${renderNav(feed)}
      <ol>
        ${content.map((data: Item) => renderStory(data))}
      </ol>
      <a href="/${feed}/${pageNumber + 1}" class="more-link">More</a>
    </main>
    ${turboScript()}
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
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
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
    `;

    yield* body;

    yield* html`
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
      <main aria-label="Main content">
        ${renderNav(activeFeed)}
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
