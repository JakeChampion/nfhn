// render/pages.ts - Full page templates

import { type HTML, html as tpl, unsafeHTML } from "../html.ts";
import { type FeedSlug, type Item, type User } from "../hn.ts";
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
  tpl`<script>document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'auto');</script>`;

// --- Home page (feed listing) ---

export const home = (
  content: Item[],
  pageNumber: number,
  feed: FeedSlug = "top",
  canonicalUrl?: string,
): HTML =>
  tpl`
<!DOCTYPE html>
<html lang="en" data-theme="auto">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${themeInitScript()}
    ${canonicalUrl ? tpl`<link rel="canonical" href="${canonicalUrl}">` : ""}
    <meta name="description" content="Hacker News ${feed} page ${pageNumber}: latest ${feed} stories.">
    <meta property="og:type" content="website">
    <meta property="og:title" content="NFHN: ${
    feed.charAt(0).toUpperCase() + feed.slice(1)
  } Stories - Page ${pageNumber}">
    <meta property="og:description" content="Hacker News ${feed} page ${pageNumber}: latest ${feed} stories.">
    ${canonicalUrl ? tpl`<meta property="og:url" content="${canonicalUrl}">` : ""}
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
      <div class="pagination-info">Page ${pageNumber}</div>
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
    yield* tpl`
<!DOCTYPE html>
<html lang="en" data-theme="auto">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${themeInitScript()}
    ${canonicalUrl ? tpl`<link rel="canonical" href="${canonicalUrl}" />` : ""}
    ${description ? tpl`<meta name="description" content="${description}" />` : ""}
    <meta property="og:type" content="article">
    <meta property="og:title" content="${title}">
    ${description ? tpl`<meta property="og:description" content="${description}" />` : ""}
    ${canonicalUrl ? tpl`<meta property="og:url" content="${canonicalUrl}" />` : ""}
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

    yield* tpl`
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
  const opUser = item.user ?? undefined;

  return shellPage(
    `NFHN: ${item.title}`,
    tpl`
      <main id="main-content" aria-label="Main content">
        ${headerBar(activeFeed)}
        <article>
          <a href="${meta.href(item)}">
            <span class="badge ${meta.badgeClass}">${meta.label}</span>
            <h1 class="story-heading">${item.title}</h1>
            ${
      item.domain
        ? tpl`
                <small>${item.domain}</small>
              `
        : ""
    }
          </a>
          ${
      // Job with no comments: hide points/comments line, just show "posted X ago"
      item.type === "job" && item.comments_count === 0
        ? tpl`
              <p class="meta-line">posted ${item.time_ago}</p>
            `
        : tpl`
              <p class="meta-line">
                ${item.points ?? 0} points by ${item.user ?? "[deleted]"} ${item.time_ago}
              </p>
            `}
          <hr />
          ${unsafeHTML(item.content || "")} ${commentsSection(item.comments, opUser)}
        </article>
      </main>
      ${turboScript()}
    `,
    canonicalUrl,
    `Hacker News discussion: ${item.title}`,
  );
};

// --- User profile page ---

export const userProfile = (user: User, canonicalUrl?: string): HTML =>
  shellPage(
    `NFHN: ${user.id}`,
    tpl`
      <main id="main-content" aria-label="Main content">
        ${headerBar("top")}
        <article class="user-profile">
          <h1>${user.id}</h1>
          <dl class="user-stats">
            <dt>Karma</dt>
            <dd>${user.karma.toLocaleString()}</dd>
            <dt>Created</dt>
            <dd>${user.created_ago}</dd>
          </dl>
          ${user.about ? tpl`
            <div class="user-about">
              <h2>About</h2>
              ${unsafeHTML(user.about)}
            </div>
          ` : ""}
          <p class="user-links">
            <a href="https://news.ycombinator.com/user?id=${user.id}" rel="noopener">View on HN</a>
          </p>
        </article>
      </main>
      ${turboScript()}
    `,
    canonicalUrl,
    `User profile for ${user.id} on Hacker News`,
  );
