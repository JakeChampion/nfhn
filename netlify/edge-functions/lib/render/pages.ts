// render/pages.ts - Full page templates

import { type HTML, html as tpl, unsafeHTML } from "../html.ts";
import { type FeedSlug, type Item, type SubmissionItem, type User } from "../hn.ts";
import {
  articleJsonLd,
  backToTop,
  bookmarkButton,
  commentsSection,
  countComments,
  estimateReadingTime,
  getTypeMeta,
  headerBar,
  justifyScript,
  keyboardNavScript,
  pipReaderButton,
  pwaHeadTags,
  readerModeLink,
  readingProgress,
  renderStory,
  shareButton,
  sharedStyles,
  skipLink,
  themeScript,
  userLink,
  websiteJsonLd,
} from "./components.ts";

// --- Speculation Rules for prefetching/prerendering ---
// Uses the declarative Speculation Rules API (Chrome 109+)
// Replaces JavaScript-based prefetch with native browser prefetching

const speculationRules = (): HTML =>
  tpl`<script type="speculationrules">
{
  "prerender": [
    {
      "where": {
        "and": [
          { "href_matches": "/*" },
          { "not": { "href_matches": "/saved" } },
          { "not": { "href_matches": "/reader*" } },
          { "not": { "selector_matches": ".external-link" } }
        ]
      },
      "eagerness": "moderate"
    }
  ],
  "prefetch": [
    {
      "where": {
        "and": [
          { "href_matches": "/*" },
          { "not": { "href_matches": "/saved" } },
          { "not": { "href_matches": "/reader*" } }
        ]
      },
      "eagerness": "conservative"
    }
  ]
}
</script>`;

// --- Inline script to set theme before page renders (prevents flash) ---
// This script must match the hash in config.ts CSP_DIRECTIVES
// Hash: sha256-aa72PHEwNOBVTHaG/ayYpxdOJImxtHfAuO+pszB1UHA=

const themeInitScript = (): HTML =>
  tpl`<script>document.documentElement.setAttribute('data-theme',localStorage.getItem('theme')||'auto');</script>`;

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
    ${pwaHeadTags()}
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
    ${
    websiteJsonLd({
      name: "NFHN - Hacker News Reader",
      url: "https://nfhn.netlify.app",
      description: "A fast, accessible Hacker News reader built with Netlify Edge Functions.",
    })
  }
    <title>NFHN: Page ${pageNumber}</title>
  </head>
  <body>
    ${readingProgress()}
    ${skipLink()}
    <main id="main-content" aria-label="Main content">
      ${headerBar(feed)}
      <ol class="stories">
        ${content.map((data: Item) => renderStory(data))}
      </ol>
      <a href="/${feed}/${pageNumber + 1}" class="more-link">More</a>
    </main>
    ${backToTop()}
    ${keyboardNavScript()}
    ${speculationRules()}
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
    ${pwaHeadTags()}
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
    ${readingProgress()}
    ${skipLink()}
    `;

    yield* body;

    yield* tpl`
      ${backToTop()}
      ${themeScript()}
      ${justifyScript()}
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

  // Calculate loaded comment count for display
  const loadedComments = countComments(item.comments);
  const totalComments = item.comments_count ?? 0;

  // Estimate reading time for article content
  const readingTime = estimateReadingTime(item.content);

  // Build JSON-LD structured data for the article
  const structuredData = articleJsonLd({
    title: item.title,
    author: item.user,
    datePublished: item.time,
    url: item.url ?? canonicalUrl ?? `https://nfhn.netlify.app/item/${item.id}`,
    commentCount: totalComments,
    discussionUrl: `https://news.ycombinator.com/item?id=${item.id}`,
  });

  return shellPage(
    `NFHN: ${item.title}`,
    tpl`
      ${structuredData}
      <main id="main-content" aria-label="Main content">
        ${headerBar(activeFeed)}
        <article>
          <a href="${meta.href(item)}">
            ${meta.label ? tpl`<span class="badge ${meta.badgeClass}">${meta.label}</span>` : ""}
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
                ${item.points ?? 0} points by ${
          item.user ? userLink(item.user) : "[deleted]"
        } ${item.time_ago}
                · ${totalComments} comment${totalComments === 1 ? "" : "s"}${
          loadedComments !== totalComments ? tpl` (${loadedComments} loaded)` : ""
        }
                ${readingTime > 0 ? tpl`· ${readingTime} min read` : ""}
              </p>
            `}
          <div class="article-actions">
            ${item.url ? readerModeLink(item.url) : ""}
            ${item.url ? pipReaderButton(item.url, item.title) : ""}
            ${shareButton(item)}
            ${bookmarkButton(item)}
          </div>
          <hr />
          ${unsafeHTML(item.content || "")} ${commentsSection(item.comments, opUser)}
        </article>
      </main>
      ${keyboardNavScript()}
    `,
    canonicalUrl,
    `Hacker News discussion: ${item.title}`,
  );
};

// --- User profile page ---

const renderSubmissionItem = (item: SubmissionItem, index: number): HTML =>
  tpl`<li class="story-item" data-story-index="${index}">
    <span class="story-index">${index + 1}.</span>
    <span class="story-vote">▲</span>
    <span class="story-body">
      <span class="story-title">
        ${
    item.url
      ? tpl`<a href="${item.url}" class="story-link">${item.title}</a>
               <span class="story-domain">(${item.domain})</span>`
      : tpl`<a href="/item/${item.id}" class="story-link">${item.title}</a>`
  }
      </span>
      <span class="story-meta">
        ${item.points} point${item.points === 1 ? "" : "s"} · 
        ${item.time_ago} · 
        <a href="/item/${item.id}">${item.comments_count} comment${
    item.comments_count === 1 ? "" : "s"
  }</a>
      </span>
    </span>
  </li>`;

export const userProfile = (
  user: User,
  submissions: SubmissionItem[] = [],
  canonicalUrl?: string,
): HTML =>
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
          ${
      user.about
        ? tpl`
            <div class="user-about">
              <h2>About</h2>
              ${unsafeHTML(user.about)}
            </div>
          `
        : ""
    }
          ${
      submissions.length > 0
        ? tpl`
            <section class="user-submissions">
              <h2>Recent Submissions</h2>
              <ol class="stories" start="1">
                ${submissions.map((s, i) => renderSubmissionItem(s, i))}
              </ol>
            </section>
          `
        : ""
    }
          <p class="user-links">
            <a href="https://news.ycombinator.com/submitted?id=${user.id}" rel="noopener">All submissions on HN</a>
            <span class="link-sep">·</span>
            <a href="https://news.ycombinator.com/user?id=${user.id}" rel="noopener">View profile on HN</a>
          </p>
        </article>
      </main>
      ${keyboardNavScript()}
    `,
    canonicalUrl,
    `User profile for ${user.id} on Hacker News`,
  );

// --- Saved stories page (client-rendered from localStorage) ---

export const savedPage = (canonicalUrl?: string): HTML =>
  tpl`
<!DOCTYPE html>
<html lang="en" data-theme="auto">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${themeInitScript()}
    ${pwaHeadTags()}
    ${canonicalUrl ? tpl`<link rel="canonical" href="${canonicalUrl}">` : ""}
    <meta name="description" content="Your saved Hacker News stories for offline reading.">
    <meta property="og:type" content="website">
    <meta property="og:title" content="NFHN: Saved Stories">
    <meta property="og:description" content="Your saved Hacker News stories for offline reading.">
    ${canonicalUrl ? tpl`<meta property="og:url" content="${canonicalUrl}">` : ""}
    <meta property="og:site_name" content="NFHN">
    <meta name="twitter:card" content="summary">
    <link rel="icon" type="image/svg+xml" href="/icon.svg">
    ${sharedStyles(1)}
    <title>NFHN: Saved Stories</title>
  </head>
  <body>
    ${readingProgress()}
    ${skipLink()}
    <main id="main-content" aria-label="Main content">
      ${headerBar("saved")}
      <div class="saved-header">
        <h1>Saved Stories</h1>
        <p class="saved-description">Stories saved to your browser for offline reading.</p>
        <div class="saved-actions">
          <button id="export-stories-btn" class="saved-action-btn" title="Export saved stories">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 1v9M8 1L4 5M8 1l4 4M2 11v2a2 2 0 002 2h8a2 2 0 002-2v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Export
          </button>
          <button id="import-stories-btn" class="saved-action-btn" title="Import saved stories">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 10V1M8 10l4-4M8 10L4 6M2 11v2a2 2 0 002 2h8a2 2 0 002-2v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Import
          </button>
          <button id="export-html-btn" class="saved-action-btn" title="Export as HTML archive">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 1h7l3 3v11H3V1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
              <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Archive
          </button>
        </div>
      </div>
      <div id="saved-stories-container">
        <p class="loading-message">Loading saved stories...</p>
      </div>
    </main>
    ${backToTop()}
    ${keyboardNavScript()}
    ${themeScript()}
  </body>
</html>
`;
