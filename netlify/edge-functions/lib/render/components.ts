// render/components.ts - Reusable UI components

import { type HTML, html, unsafeHTML } from "../html.ts";
import { FEEDS } from "../feeds.ts";
import { type FeedSlug, type HNAPIItem, type Item, type ItemType } from "../hn.ts";

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
    label: "Link",
    badgeClass: "badge-link",
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

export const themeScript = (): HTML =>
  html`
    <script>
    (function() {
      const root = document.documentElement;
      const stored = localStorage.getItem('theme') || 'auto';
      root.setAttribute('data-theme', stored);

      const radios = document.querySelectorAll('input[name="theme"]');
      radios.forEach(radio => {
        if (radio.value === stored) radio.checked = true;
        radio.addEventListener('change', (e) => {
          const theme = e.target.value;
          root.setAttribute('data-theme', theme);
          localStorage.setItem('theme', theme);
        });
      });
    })();
    </script>
  `;

// --- Navigation ---

export const renderNav = (activeFeed: FeedSlug): HTML =>
  html`
    <nav class="nav-feeds" aria-label="Primary">
      ${FEEDS.map(({ slug, label }) =>
        html`
          <a href="/${slug}/1" class="${activeFeed === slug
            ? "active"
            : ""}" aria-current="${activeFeed === slug ? "page" : undefined}">${label}</a>
        `
      )}
    </nav>
  `;

// --- Header bar with nav and theme toggle ---

export const headerBar = (activeFeed: FeedSlug): HTML =>
  html`
    <div class="header-bar">
      ${renderNav(activeFeed)} ${themeToggle()}
    </div>
  `;

// --- Prefetch/prerender script ---

export const turboScript = (): HTML =>
  html`
    <script>
    const used = new Set();

    function supportsRel(rel) {
      const link = document.createElement("link");
      return !!(link.relList && link.relList.supports && link.relList.supports(rel));
    }

    const canPrerender = supportsRel("prerender");
    const canPrefetch = supportsRel("prefetch");

    function warm(url) {
      const u = new URL(url, location.href);
      if (u.origin !== location.origin) return;

      const href = u.toString();
      if (used.has(href)) return;
      used.add(href);

      const link = document.createElement("link");
      if (canPrerender) {
        link.rel = "prerender";
      } else if (canPrefetch) {
        link.rel = "prefetch";
        link.as = "document"; // hint, safe to omit if you like
      } else {
        // No supported rel, give up quietly.
        return;
      }

      link.href = href;
      document.head.appendChild(link);
      console.debug("Warming link:", link.rel, link.href);
    }

    function onIntent(e) {
      const a = e.target.closest("a[href]");
      if (!a) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;

      warm(a.href);
    }

    // Hover (desktop) + first touch (mobile)
    document.addEventListener("mouseover", onIntent, { passive: true });
    document.addEventListener("touchstart", onIntent, { passive: true });
    </script>
  `;

// --- Story list item ---

export const renderStory = (data: Item): HTML => {
  const meta = getTypeMeta(data.type);

  return html`
    <li>
      <a class="title" href="${meta.href(data)}">
        <span class="badge ${meta.badgeClass}">${meta.label}</span>
        <span class="story-title-text">${data.title}</span>
        ${data.domain
          ? html`
            <span class="story-meta">(${data.domain})</span>
          `
          : ""}
      </a>
      <a class="comments" href="/item/${data.id}">
        view ${data.comments_count > 0 ? data.comments_count + " comments" : "discussion"}
      </a>
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

  const details = html`
    <details open id="${comment.id}">
      <summary aria-label="Comment by ${user}${isOP ? " (OP)" : ""}, posted ${time_ago}">
        <span class="comment-meta">
          <span class="comment-user${isOP ? " is-op" : ""}">${user}${isOP ? html` <abbr title="Original Poster" class="op-badge">OP</abbr>` : ""}</span>
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
