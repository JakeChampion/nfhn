// render/components.ts - Reusable UI components

import { type HTML, html, raw, unsafeHTML } from "../html.ts";
import { FEEDS } from "../feeds.ts";
import { SITE_ORIGIN, SRI } from "../config.ts";
import { DICTIONARY_TRANSPORT_ENABLED } from "../dictionary.ts";
import { assetVersionQuery, deployVersion } from "../deploy.ts";
import { type FeedSlug, type HNAPIItem, type Item, type ItemType } from "../hn.ts";

// --- JSON-LD Structured Data ---

export interface ArticleStructuredData {
  title: string;
  author: string | null;
  datePublished: number; // unix timestamp
  url: string;
  commentCount: number;
  discussionUrl: string;
}

export const articleJsonLd = (data: ArticleStructuredData): HTML => {
  const publishedDate = new Date(data.datePublished * 1000).toISOString();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: data.title,
    author: data.author
      ? {
        "@type": "Person",
        name: data.author,
        url: `https://news.ycombinator.com/user?id=${data.author}`,
      }
      : undefined,
    datePublished: publishedDate,
    url: data.url,
    discussionUrl: data.discussionUrl,
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/CommentAction",
      userInteractionCount: data.commentCount,
    },
    isPartOf: {
      "@type": "WebSite",
      name: "NFHN - Hacker News Reader",
      url: SITE_ORIGIN,
    },
  };

  // Remove undefined fields
  const cleanedJsonLd = JSON.stringify(jsonLd, (_, v) => v === undefined ? undefined : v);

  return html`
    <script type="application/ld+json">
    ${raw(cleanedJsonLd)}
    </script>
  `;
};

export interface WebSiteStructuredData {
  name: string;
  url: string;
  description: string;
}

export const websiteJsonLd = (data: WebSiteStructuredData): HTML => {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: data.name,
    url: data.url,
    description: data.description,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://hn.algolia.com/?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  };

  return html`
    <script type="application/ld+json">
    ${raw(JSON.stringify(jsonLd))}
    </script>
  `;
};

// --- Helper: Count total comments recursively ---

export const countComments = (comments: HNAPIItem[] | undefined): number => {
  if (!comments || comments.length === 0) return 0;
  return comments.reduce((count, comment) => {
    // Count this comment (if it has content) + its children
    const hasContent = comment.content && comment.content.trim() !== "";
    const childCount = countComments(comment.comments);
    return count + (hasContent ? 1 : 0) + childCount;
  }, 0);
};

// --- Helper: Estimate reading time ---

export const estimateReadingTime = (text: string | undefined): number => {
  if (!text) return 0;
  // Strip HTML tags, count words
  const plainText = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = plainText.split(" ").filter(Boolean).length;
  // Average reading speed: 200-250 words per minute, use 200 for technical content
  return Math.max(1, Math.ceil(wordCount / 200));
};

// --- Type metadata for story badges ---

export type TypeMeta = {
  label: string;
  badgeClass: string;
  href: (item: Item) => string;
};

const TYPE_META: Record<ItemType, TypeMeta> = {
  ask: { label: "Ask HN", badgeClass: "badge-ask", href: (item) => `/item/${item.id}` },
  show: { label: "Show HN", badgeClass: "badge-show", href: (item) => `/item/${item.id}` },
  tell: { label: "Tell HN", badgeClass: "badge-tell", href: (item) => `/item/${item.id}` },
  job: {
    label: "Job",
    badgeClass: "badge-job",
    href: (item) => item.url ?? `/item/${item.id}`,
  },
  link: {
    label: "",
    badgeClass: "",
    href: (item) => item.url ?? `/item/${item.id}`,
  },
  comment: { label: "Comment", badgeClass: "badge-default", href: (item) => `/item/${item.id}` },
};

export const getTypeMeta = (type: ItemType): TypeMeta => TYPE_META[type];

// --- Skip link for keyboard accessibility ---

export const skipLink = (): HTML =>
  html`
    <a href="#main-content" class="skip-link">Skip to main content</a>
  `;

// --- Reading Progress Indicator (Scroll-Driven Animations) ---

export const readingProgress = (): HTML =>
  html`
    <div class="reading-progress" aria-hidden="true"></div>
  `;

// --- Live thread updates (Server-Sent Events) ---
//
// An item page is cached for a minute or so, and HN threads move fastest at
// exactly the times you are most likely to be reading them. This is where
// app.js says so.
//
// Rendered empty and `hidden`, carrying the two things the client needs: which
// thread this is, and how many comments the page it is looking at was rendered
// with. Reading the count off the DOM rather than having the client recount
// means the comparison is against what the reader can actually see.
//
// The refresh link is an ordinary link to the same page, deliberately. By the
// time the stream reports a change, the scheduled purge in hn-invalidate.mts
// has already dropped this page's `item:<id>` cache tag - the two run off the
// same signal - so following it gets the new comments rather than the cached
// copy the reader is already looking at.
//
// See netlify/edge-functions/live.ts

export const liveUpdates = (itemId: number, comments: number): HTML =>
  html`
    <p
      class="live-updates"
      id="live-updates"
      data-item-id="${itemId}"
      data-comments="${comments}"
      role="status"
      hidden
    >
      <a href="/item/${itemId}" class="live-updates-link"></a>
    </p>
  `;

// --- Story preview card (interest invokers) ---
//
// One card, shared by every row on the page - `interestfor` allows many
// invokers per target, and thirty empty popovers would be thirty times the
// markup for no gain.
//
// It is inert until app.js fills it and attaches `interestfor` to the story
// links. That is deliberate rather than lazy: without JavaScript there is
// nothing to put in the card, and a hover that opens an empty box is worse
// than a hover that does nothing at all. The element ships anyway because
// app.js needs somewhere to write, and it costs a few dozen bytes that the
// compression dictionary reduces to approximately none.
//
// `hidden` covers the browsers that do not implement popover: there the
// attribute is inert and the div would otherwise render as a stray box. app.js
// removes it once it knows the popover will behave.
//
// See docs/api-proposals/14-invoker-commands.md

export const storyPreviewCard = (): HTML =>
  html`
    <div id="story-preview" popover="hint" class="story-preview" hidden>
      <p class="story-preview-title"></p>
      <p class="story-preview-excerpt"></p>
      <p class="story-preview-meta"></p>
    </div>
  `;

// --- Back to Top Button (Scroll-Driven Animations) ---

export const backToTop = (): HTML =>
  html`
    <a href="#" class="back-to-top" aria-label="Back to top">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="18 15 12 9 6 15"></polyline>
      </svg>
    </a>
  `;

// --- PWA head tags ---

// The compression-dictionary URL carries the deploy id because the dictionary is
// served `immutable` for a year (RFC 9842 refuses a dictionary whose response is
// not fresh, and derives the dictionary's own lifetime from that `max-age`). The
// shell's bytes change whenever the markup does, and a visitor still holding an
// old copy advertises a hash the server no longer builds - which silently
// disables dictionary compression for them rather than failing loudly. The tag is
// omitted until the deploy id is known; see lib/deploy.ts for why null is not
// papered over with a placeholder.
export const pwaHeadTags = (): HTML =>
  html`
    <link rel="preconnect" href="https://hacker-news.firebaseio.com" fetchpriority="high">
    <link rel="preconnect" href="https://hn.algolia.com" fetchpriority="low">
    <link rel="manifest" href="/manifest.json">
    ${DICTIONARY_TRANSPORT_ENABLED && deployVersion()
      ? html`
        <link rel="compression-dictionary" href="/_dict/shell${assetVersionQuery()}">
      `
      : ""}
    <meta name="color-scheme" content="light dark">
    <meta name="theme-color" content="#f5f5f5" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#0d1117" media="(prefers-color-scheme: dark)">
    <!-- The standard name; the apple- prefixed one below is deprecated but is
        still what older iOS reads, so both ship. -->
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="NFHN">
    <link rel="apple-touch-icon" href="/icon.svg">
  `;

// --- Text justification script (tex-linebreak) ---
// SRI hashes ensure integrity of third-party libraries.
// `defer` rather than bare end-of-body scripts: these three depend on each other
// in order (library, hyphenation data, then the code that uses both), and defer
// preserves that order while keeping them out of the parser's way.

export const justifyScript = (): HTML =>
  html`
    <script
      src="/tex-linebreak.js"
      integrity="${SRI.texLineBreak}"
      crossorigin="anonymous"
      fetchpriority="low"
      defer
    ></script>
    <script
      src="/hyphens_en-us.js"
      integrity="${SRI.hyphens}"
      crossorigin="anonymous"
      fetchpriority="low"
      defer
    ></script>
    <script
      src="/justify.js"
      integrity="${SRI.justify}"
      crossorigin="anonymous"
      fetchpriority="low"
      defer
    ></script>
  `;

// --- Shared styles link ---

export const sharedStyles = (pageNumber = 1): HTML => {
  // Only the dynamic counter-set needs to be inline; all other styles are in /styles.css
  const counterStart = pageNumber === 1 ? 0 : (pageNumber - 1) * 30;
  return html`
    <link rel="stylesheet" href="/styles.css${assetVersionQuery()}" fetchpriority="high">
    <style>
    ol { counter-set: section ${counterStart}; }
    </style>
  `;
};

// --- Stale-data banner ---
//
// Shown when HN's API is unreachable and the page has been rendered from the
// Blobs mirror instead. Being up and honestly labelled beats a 503.
//
// See docs/netlify-proposals/03-netlify-blobs.md

export const staleBanner = (storedAt: number): HTML => {
  const iso = new Date(storedAt).toISOString();
  return html`
    <p class="stale-banner" role="status">
      Hacker News is not responding. Showing the copy saved
      <time datetime="${iso}">at ${iso}</time>.
    </p>
  `;
};

// --- Relative timestamps ---
//
// A relative string rendered on the server is frozen at render time. These pages
// sit in the edge cache for up to five minutes and in the browser's cache for
// longer, so "1 minute ago" is routinely six minutes old by the time it is read.
//
// Emitting <time datetime> fixes three things at once: the machine-readable
// timestamp is correct however long the page was cached, app.js can re-render it
// against the reader's clock and locale with Intl.RelativeTimeFormat, and the
// markup is finally consistent with the JSON-LD, which has always used ISO dates.
// The server-rendered text stays as the no-JS fallback.
//
// See docs/api-proposals/17-typography-and-i18n.md

export const relativeTime = (unixSeconds: number | undefined, text: string): HTML => {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) {
    return html`${text}`;
  }
  const iso = new Date(unixSeconds * 1000).toISOString();
  return html`<time datetime="${iso}">${text}</time>`;
};

// --- Shared-element view transition names ---
//
// Giving a story title the same view-transition-name on the feed and on its own
// page makes the title travel from the list into the article heading, instead of
// the whole page crossfading. Names must be unique per document, which they are:
// a story appears at most once per feed page.
//
// This is emitted as a <style> block rather than a style attribute because the
// CSP sets `style-src-attr 'none'`. Inline <style> elements are already the
// established pattern here (see the counter-set above).

const transitionNameFor = (id: number): string => `story-${id}`;

export const feedTransitionNames = (items: Item[]): HTML => {
  if (!items.length) return html``;
  const rules = items
    .map((item) =>
      `li[data-story-id="${item.id}"] .story-title-text{view-transition-name:${
        transitionNameFor(item.id)
      };view-transition-class:story-title}`
    )
    .join("");
  return html`
    <style>${unsafeHTML(rules)}</style>
  `;
};

export const itemTransitionName = (id: number): HTML =>
  html`
    <style>${unsafeHTML(
      `.story-heading{view-transition-name:${
        transitionNameFor(id)
      };view-transition-class:story-title}`,
    )}</style>
  `;

// --- Theme toggle ---

export const themeToggle = (): HTML =>
  html`
    <div class="theme-toggle">
      <fieldset>
        <legend>Theme</legend>
        <input type="radio" id="theme-light" name="theme" value="light">
        <label for="theme-light" title="Light theme">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"
            />
          </svg>
        </label>
        <input type="radio" id="theme-dark" name="theme" value="dark">
        <label for="theme-dark" title="Dark theme">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"
            />
          </svg>
        </label>
        <input type="radio" id="theme-auto" name="theme" value="auto" checked>
        <label for="theme-auto" title="System theme">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 22c1.1 0 2-.9 2-2h-4a2 2 0 002 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
            />
          </svg>
        </label>
      </fieldset>
    </div>
  `;

// Main application script - loaded with defer to not block rendering
// Note: app.js is first-party code; SRI would require build-time hash generation
//
// The `?v=` is what makes the immutable, dictionary-eligible response in asset.ts
// safe to serve: the bytes at a given versioned URL never change, so a new deploy
// is a new URL rather than a year-long stale copy.
export const themeScript = (): HTML =>
  html`
    <script src="/app.js${assetVersionQuery()}" defer></script>
  `;

// --- Navigation ---

export const renderNav = (activeFeed: FeedSlug | "saved"): HTML =>
  html`
    <nav class="nav-feeds" aria-label="Primary">
      ${FEEDS.map(({ slug, label }) =>
        html`
          <a href="/${slug}/1" class="${activeFeed === slug
            ? "active"
            : ""}" aria-current="${activeFeed === slug ? "page" : undefined}">${label}</a>
        `
      )}
      <a href="/saved" class="${activeFeed === "saved"
        ? "active"
        : ""}" aria-current="${activeFeed === "saved" ? "page" : undefined}">Saved</a>
    </nav>
  `;

// --- Keyboard shortcut hint ---

export const keyboardHint = (): HTML =>
  html`
    <button
      type="button"
      class="keyboard-hint"
      popovertarget="shortcuts-modal"
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts (press ?)"
    >
      <kbd>?</kbd> Keyboard shortcuts
    </button>
  `;

// --- Settings menu popover ---

export const settingsMenu = (): HTML =>
  html`
    <div id="settings-menu" class="settings-menu" popover>
      <h2>Settings</h2>
      ${themeToggle()} ${keyboardHint()}
      <button
        type="button"
        class="modal-close"
        popovertarget="settings-menu"
        popovertargetaction="hide"
        aria-label="Close"
      >
        ×
      </button>
    </div>
  `;

// --- Settings menu button ---

export const settingsMenuButton = (): HTML =>
  html`
    <button
      type="button"
      class="settings-menu-btn"
      popovertarget="settings-menu"
      aria-label="Settings menu"
      title="Settings"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
        <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
      </svg>
    </button>
  `;

// --- Header bar with nav and theme toggle ---

// Rendered as a sibling before <main>, not inside it: a <header> nested in
// <main> is not a banner landmark, and - more importantly - the skip link points
// at <main>, so navigation living inside it was navigation the skip link could
// not skip.
export const headerBar = (activeFeed: FeedSlug | "saved"): HTML =>
  html`
    <header class="header-bar">
      ${settingsMenuButton()} ${renderNav(activeFeed)}
    </header>
    ${settingsMenu()}
  `;

// --- Keyboard navigation script ---
// The script logic is now in /app.js, but we keep the HTML structure here

export const keyboardNavScript = (): HTML =>
  html`
    <div id="aria-live" class="sr-only" aria-live="polite" aria-atomic="true"></div>
    <div id="shortcuts-modal" class="shortcuts-modal" popover>
      <h2>Keyboard Shortcuts</h2>
      <dl class="shortcuts-list">
        <dt><kbd>j</kbd></dt>
        <dd>Next item</dd>
        <dt><kbd>k</kbd></dt>
        <dd>Previous item</dd>
        <dt><kbd>o</kbd> / <kbd>Enter</kbd></dt>
        <dd>Open selected item</dd>
        <dt><kbd>?</kbd></dt>
        <dd>Show this help</dd>
        <dt><kbd>Esc</kbd></dt>
        <dd>Close modal / clear selection</dd>
      </dl>
      <button
        type="button"
        class="modal-close"
        popovertarget="shortcuts-modal"
        popovertargetaction="hide"
        aria-label="Close"
      >
        ×
      </button>
    </div>
  `;

// --- User link ---

export const userLink = (username: string | null | undefined): HTML => {
  if (!username) {
    return html`
      [deleted]
    `;
  }
  return html`
    <a href="/user/${username}" class="user-link">${username}</a>
  `;
};

// --- Reader mode link ---

export const readerModeLink = (url: string | undefined): HTML => {
  if (!url) {
    return html`
    `;
  }
  const readerUrl = `/reader/${url}`;
  return html`
    <a
      href="${readerUrl}"
      class="reader-mode-link"
      title="Open in Reader Mode"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
        <path
          d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"
        />
      </svg>
      <span>Reader</span>
    </a>
  `;
};

// --- Picture-in-Picture reader button (Chrome only) ---

export const pipReaderButton = (url: string | undefined, title: string): HTML => {
  if (!url) {
    return html`
    `;
  }
  return html`
    <button
      type="button"
      class="pip-reader-btn"
      data-url="${url}"
      data-title="${title}"
      title="Open in floating window (Chrome only)"
      aria-label="Open in Picture-in-Picture reader"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
        <path
          d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"
        />
      </svg>
      <span class="pip-label">PiP</span>
    </button>
  `;
};

// --- Share button ---

export const shareButton = (item: Item): HTML =>
  html`
    <button
      type="button"
      class="share-btn"
      data-share-title="${item.title}"
      data-share-url="${item.url || `${SITE_ORIGIN}/item/${item.id}`}"
      title="Share story"
      aria-label="Share story"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
        <path
          d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"
        />
      </svg>
    </button>
  `;

// --- Bookmark/Save button ---

export const bookmarkButton = (item: Item): HTML =>
  html`
    <button
      type="button"
      class="bookmark-btn"
      aria-pressed="false"
      data-story-id="${item.id}"
      data-story-title="${item.title}"
      data-story-url="${item.url || ""}"
      data-story-domain="${item.domain || ""}"
      data-story-type="${item.type}"
      data-story-points="${item.points ?? 0}"
      data-story-user="${item.user || ""}"
      data-story-time="${item.time ?? 0}"
      data-story-time-ago="${item.time_ago || ""}"
      data-story-comments="${item.comments_count ?? 0}"
      title="Save story"
      aria-label="Save story"
    >
      <svg class="bookmark-icon-outline" viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
        <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z" />
      </svg>
      <svg class="bookmark-icon-filled" viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
        <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
      </svg>
      <span class="sr-only">Save</span>
    </button>
  `;

// --- Story list item ---

export const renderStory = (data: Item): HTML => {
  const meta = getTypeMeta(data.type);

  return html`
    <li data-story-id="${data.id}">
      <a class="title" href="${meta.href(data)}">
        ${meta.label
          ? html`
            <span class="badge ${meta.badgeClass}">${meta.label}</span>
          `
          : ""}
        <span class="story-title-text">${data.title}</span>
        ${data.domain
          ? html`
            <span class="story-meta">(${data.domain})</span>
          `
          : ""}
      </a>
      <div class="story-actions">
        <a class="comments" href="/item/${data.id}">
          view ${data.comments_count > 0 ? data.comments_count + " comments" : "discussion"}
        </a>
        ${shareButton(data)} ${bookmarkButton(data)}
      </div>
    </li>
  `;
};

// --- Comments ---

export const isRenderableComment = (comment: HNAPIItem): boolean =>
  comment.type === "comment" && !comment.deleted && !comment.dead;

export const renderComment = (comment: HNAPIItem, level: number, opUser?: string): HTML => {
  if (!isRenderableComment(comment)) {
    return html`
    `;
  }

  const time_ago = comment.time_ago ?? "";
  const user = comment.user ?? "[deleted]";
  const content = unsafeHTML(comment.content ?? "");
  const children = (comment.comments ?? []).filter(isRenderableComment);
  const isOP = opUser && user === opUser;

  const userDisplay = user === "[deleted]"
    ? html`
      <span class="comment-user">[deleted]</span>
    `
    : html`
      <a href="/user/${user}" class="comment-user${isOP ? " is-op" : ""}">${user}</a>${isOP
        ? html`
          <abbr title="Original Poster" class="op-badge">OP</abbr>
        `
        : ""}
    `;

  const details = html`
    <details open id="${comment.id}">
      <summary aria-label="Comment by ${user}${isOP ? " (OP)" : ""}, posted ${time_ago}">
        <span class="comment-meta">
          ${userDisplay}
          <a class="comment-permalink" href="#${comment.id}">${relativeTime(
            comment.time,
            time_ago,
          )}</a>
        </span>
      </summary>
      <div>${content}</div>
      ${children.length
        ? html`
          <ul>${children.map((child) => renderComment(child, level + 1, opUser))}</ul>
        `
        : ""}
    </details>
  `;

  return level >= 1
    ? html`
      <li>${details}</li>
    `
    : details;
};

// --- Comment thread controls (Invoker Commands) ---
//
// `commandfor` + `command` let a button declare what it does to another element
// in markup: the browser handles activation, keyboard support and the
// accessibility wiring, and no click handler is needed. Commands prefixed with
// `--` are custom, dispatching a `command` event instead of a built-in action,
// so one delegated listener in app.js replaces per-button handlers.
//
// This suits NFHN's CSP in particular - script-src is 'self' plus a single
// pinned hash - but the buttons are inert in a browser without invoker support,
// so app.js keeps a click fallback until support is universal.
//
// See docs/api-proposals/14-invoker-commands.md

const commentControls = (count: number): HTML =>
  html`
    <div class="comment-controls">
      <button type="button" commandfor="comments" command="--collapse-all">
        Collapse all
      </button>
      <button type="button" commandfor="comments" command="--expand-all" hidden>
        Expand all
      </button>
      <span class="comment-count">${count} thread${count === 1 ? "" : "s"}</span>
    </div>
  `;

export const commentsSection = (rootComments: HNAPIItem[] | undefined, opUser?: string): HTML => {
  const visibleComments = (rootComments ?? []).filter(isRenderableComment);
  if (visibleComments.length === 0) {
    return html`
      <p>No comments yet.</p>
    `;
  }

  return html`
    ${commentControls(visibleComments.length)}
    <section id="comments" aria-label="Comments">
      ${visibleComments.map((comment) => renderComment(comment, 0, opUser))}
    </section>
  `;
};
