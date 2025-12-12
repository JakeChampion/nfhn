// render/components.ts - Reusable UI components

import { type HTML, html, raw, unsafeHTML } from "../html.ts";
import { FEEDS } from "../feeds.ts";
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
      url: "https://nfhn.netlify.app",
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

// --- PWA head tags ---

export const pwaHeadTags = (): HTML =>
  html`
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#ff7a18">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="NFHN">
    <link rel="apple-touch-icon" href="/icon.svg">
  `;

// --- Text justification script (tex-linebreak) ---
// SRI hashes ensure integrity of third-party libraries

export const justifyScript = (): HTML =>
  html`
    <script
      src="/tex-linebreak.js"
      integrity="sha384-Mz2e2ZKHUt95NE5A4Q3jnM4vMi3TW/aI+z0XpUTTtvDOGtOicI7DlGTmCj3yVG0x"
      crossorigin="anonymous"
    ></script>
    <script
      src="/hyphens_en-us.js"
      integrity="sha384-O18JzLDtmRj8lMDKjQ/VZOo09Ye41get5V+PDYP1atYLjrMbCO390FdScF4XAZts"
      crossorigin="anonymous"
    ></script>
    <script
      src="/justify.js"
      integrity="sha384-FI/M0Xsdr+Yk/caRCCNCvazelNiHYTHJDbPjVQ+5tt+AIoP2DoNt9Suks7KP+Mc8"
      crossorigin="anonymous"
    ></script>
  `;

// --- Shared styles link ---

export const sharedStyles = (pageNumber = 1): HTML => {
  // Only the dynamic counter-set needs to be inline; all other styles are in /styles.css
  const counterStart = pageNumber === 1 ? 0 : (pageNumber - 1) * 30;
  return html`
    <link rel="stylesheet" href="/styles.css">
    <style>
    ol { counter-set: section ${counterStart}; }
    </style>
  `;
};

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
export const themeScript = (): HTML =>
  html`
    <script src="/app.js" defer></script>
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

export const headerBar = (activeFeed: FeedSlug | "saved"): HTML =>
  html`
    <div class="header-bar">
      ${settingsMenuButton()} ${renderNav(activeFeed)}
    </div>
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
      target="_blank"
      rel="noopener noreferrer"
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

// --- Share button ---

export const shareButton = (item: Item): HTML =>
  html`
    <button
      type="button"
      class="share-btn"
      data-share-title="${item.title}"
      data-share-url="${item.url || `https://nfhn.netlify.app/item/${item.id}`}"
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
          <a class="comment-permalink" href="#${comment.id}">${time_ago}</a>
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

export const commentsSection = (rootComments: HNAPIItem[] | undefined, opUser?: string): HTML => {
  const visibleComments = (rootComments ?? []).filter(isRenderableComment);
  if (visibleComments.length === 0) {
    return html`
      <p>No comments yet.</p>
    `;
  }

  return html`
    <section aria-label="Comments">
      ${visibleComments.map((comment) => renderComment(comment, 0, opUser))}
    </section>
  `;
};
