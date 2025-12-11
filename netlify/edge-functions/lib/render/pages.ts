// render/pages.ts - Full page templates

import { type HTML, html as tpl, unsafeHTML } from "../html.ts";
import { type FeedSlug, type Item, type SubmissionItem, type User } from "../hn.ts";
import {
  articleJsonLd,
  bookmarkButton,
  commentsSection,
  countComments,
  estimateReadingTime,
  externalLinkScript,
  favoritesScript,
  getTypeMeta,
  headerBar,
  keyboardNavScript,
  pwaHeadTags,
  readerModeLink,
  renderStory,
  serviceWorkerScript,
  sharedStyles,
  skipLink,
  themeScript,
  turboScript,
  userLink,
  websiteJsonLd,
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
    ${skipLink()}
    <main id="main-content" aria-label="Main content">
      ${headerBar(feed)}
      <ol class="stories">
        ${content.map((data: Item) => renderStory(data))}
      </ol>
      <a href="/${feed}/${pageNumber + 1}" class="more-link">More</a>
    </main>
    ${turboScript()}
    ${keyboardNavScript()}
    ${externalLinkScript()}
    ${themeScript()}
    ${favoritesScript()}
    ${serviceWorkerScript()}
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
    ${skipLink()}
    `;

    yield* body;

    yield* tpl`
      ${externalLinkScript()}
      ${themeScript()}
      ${serviceWorkerScript()}
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
            ${bookmarkButton(item)}
          </div>
          <hr />
          ${unsafeHTML(item.content || "")} ${commentsSection(item.comments, opUser)}
        </article>
      </main>
      ${turboScript()}
      ${keyboardNavScript()}
      ${favoritesScript()}
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
      ${turboScript()}
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
    ${skipLink()}
    <main id="main-content" aria-label="Main content">
      ${headerBar("saved")}
      <div class="saved-header">
        <h1>Saved Stories</h1>
        <p class="saved-description">Stories saved to your browser for offline reading.</p>
      </div>
      <div id="saved-stories-container">
        <p class="loading-message">Loading saved stories...</p>
      </div>
    </main>
    ${turboScript()}
    ${keyboardNavScript()}
    ${externalLinkScript()}
    ${themeScript()}
    ${savedPageScript()}
    ${serviceWorkerScript()}
  </body>
</html>
`;

// --- Script for rendering saved stories on client ---

const savedPageScript = (): HTML =>
  tpl`
    <script>
    (function() {
      const STORAGE_KEY = 'nfhn-saved-stories';
      const container = document.getElementById('saved-stories-container');

      const TYPE_META = {
        ask: { label: 'Ask HN', badgeClass: 'badge-ask', href: (item) => '/item/' + item.id },
        show: { label: 'Show HN', badgeClass: 'badge-show', href: (item) => '/item/' + item.id },
        job: { label: 'Job', badgeClass: 'badge-job', href: (item) => item.url || '/item/' + item.id },
        link: { label: '', badgeClass: '', href: (item) => item.url || '/item/' + item.id },
        comment: { label: 'Comment', badgeClass: 'badge-default', href: (item) => '/item/' + item.id }
      };

      function getSavedStories() {
        try {
          return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch { return {}; }
      }

      function saveStories(stories) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
        } catch (e) { console.error('Failed to save:', e); }
      }

      function removeStory(id) {
        const stories = getSavedStories();
        delete stories[id];
        saveStories(stories);
        renderStories();
      }

      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      function renderStory(item) {
        const meta = TYPE_META[item.type] || TYPE_META.link;
        const href = meta.href(item);
        
        return '<li data-story-id="' + item.id + '">' +
          '<a class="title" href="' + escapeHtml(href) + '">' +
            (meta.label ? '<span class="badge ' + meta.badgeClass + '">' + meta.label + '</span>' : '') +
            '<span class="story-title-text">' + escapeHtml(item.title) + '</span>' +
            (item.domain ? '<span class="story-meta">(' + escapeHtml(item.domain) + ')</span>' : '') +
          '</a>' +
          '<div class="story-actions">' +
            '<a class="comments" href="/item/' + item.id + '">' +
              'view ' + (item.comments_count > 0 ? item.comments_count + ' comments' : 'discussion') +
            '</a>' +
            '<button type="button" class="bookmark-btn is-saved" ' +
              'data-story-id="' + item.id + '" ' +
              'title="Remove from saved" aria-label="Remove from saved">' +
              '<svg class="bookmark-icon-outline" viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">' +
                '<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>' +
              '</svg>' +
              '<svg class="bookmark-icon-filled" viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">' +
                '<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>' +
              '</svg>' +
              '<span class="sr-only">Remove</span>' +
            '</button>' +
          '</div>' +
        '</li>';
      }

      function renderStories() {
        const stories = getSavedStories();
        const items = Object.values(stories);
        
        if (items.length === 0) {
          container.innerHTML = 
            '<div class="empty-saved">' +
              '<p>No saved stories yet.</p>' +
              '<p>Click the bookmark icon on any story to save it for offline reading.</p>' +
            '</div>';
          return;
        }

        // Sort by saved_at descending (most recently saved first)
        items.sort((a, b) => (b.saved_at || 0) - (a.saved_at || 0));

        container.innerHTML = 
          '<p class="saved-count">' + items.length + ' saved stor' + (items.length === 1 ? 'y' : 'ies') + '</p>' +
          '<ol class="stories">' + items.map(renderStory).join('') + '</ol>';

        // Add click handlers for remove buttons
        container.querySelectorAll('.bookmark-btn').forEach(btn => {
          btn.addEventListener('click', function() {
            removeStory(this.dataset.storyId);
          });
        });
      }

      renderStories();
    })();
    </script>
  `;
