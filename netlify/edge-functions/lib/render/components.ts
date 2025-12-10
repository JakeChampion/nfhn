// render/components.ts - Reusable UI components

import { type HTML, html, unsafeHTML } from "../html.ts";
import { FEEDS } from "../feeds.ts";
import { type FeedSlug, type HNAPIItem, type Item, type ItemType } from "../hn.ts";

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

// --- Service worker registration script ---

export const serviceWorkerScript = (): HTML =>
  html`
    <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    </script>
  `;

// --- External link indicator script ---

export const externalLinkScript = (): HTML =>
  html`
    <script>
    document.querySelectorAll('a[href^="http"]').forEach(link => {
      const url = new URL(link.href);
      if (url.origin !== location.origin) {
        link.classList.add('external-link');
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
        // Add screen reader text
        if (!link.querySelector('.sr-only')) {
          const sr = document.createElement('span');
          sr.className = 'sr-only';
          sr.textContent = ' (opens in new tab)';
          link.appendChild(sr);
        }
      }
    });
    </script>
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

// --- Header bar with nav and theme toggle ---

export const headerBar = (activeFeed: FeedSlug | "saved"): HTML =>
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

// --- Keyboard navigation script ---

export const keyboardNavScript = (): HTML =>
  html`
    <div id="aria-live" class="sr-only" aria-live="polite" aria-atomic="true"></div>
    <dialog id="shortcuts-modal" class="shortcuts-modal">
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
      <button type="button" class="modal-close" aria-label="Close">×</button>
    </dialog>
    <script>
    (function() {
    let currentIndex = -1;
    const liveRegion = document.getElementById('aria-live');
    const modal = document.getElementById('shortcuts-modal');

    function announce(message) {
      if (liveRegion) liveRegion.textContent = message;
    }

    function getItems() {
      // On feed pages: list items; on item pages: top-level comments
      const listItems = document.querySelectorAll('main ol > li');
      if (listItems.length) return Array.from(listItems);
      const comments = document.querySelectorAll('section[aria-label="Comments"] > details');
      return Array.from(comments);
    }

    function getItemLabel(item, index, total) {
      // Try to get a meaningful label for the item
      const title = item.querySelector('.story-title-text, .title, summary');
      const text = title ? title.textContent.trim().slice(0, 50) : 'Item';
      return text + ' (' + (index + 1) + ' of ' + total + ')';
    }

    function highlightItem(index) {
      const items = getItems();
      if (!items.length) return;

      // Remove previous highlight
      items.forEach(item => item.classList.remove('kbd-focus'));

      // Clamp index
      if (index < 0) index = 0;
      if (index >= items.length) index = items.length - 1;
      currentIndex = index;

      // Add highlight and scroll into view
      const item = items[currentIndex];
      item.classList.add('kbd-focus');
      item.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Set focus for keyboard accessibility
      item.setAttribute('tabindex', '-1');
      item.focus({ preventScroll: true });

      // Announce for screen readers
      announce(getItemLabel(item, currentIndex, items.length));
    }

    function clearSelection() {
      const items = getItems();
      items.forEach(item => {
        item.classList.remove('kbd-focus');
        item.removeAttribute('tabindex');
      });
      currentIndex = -1;
      announce('Selection cleared');
    }

    function openCurrentItem() {
      const items = getItems();
      if (currentIndex < 0 || currentIndex >= items.length) return;

      const item = items[currentIndex];
      // Find first link in item
      const link = item.querySelector('a.title, a.comments, a[href^="/item/"]');
      if (link) link.click();
    }

    function showModal() {
      modal.showModal();
      modal.querySelector('.modal-close').focus();
    }

    function hideModal() {
      modal.close();
    }

    // Close modal on button click or backdrop click
    modal.querySelector('.modal-close').addEventListener('click', hideModal);
    modal.addEventListener('click', function(e) {
      if (e.target === modal) hideModal();
    });

    document.addEventListener('keydown', function(e) {
      // Handle modal close
      if (modal.open && e.key === 'Escape') {
        e.preventDefault();
        hideModal();
        return;
      }

      // Ignore if typing in input/textarea
      if (e.target.matches('input, textarea, select')) return;

      // Show help modal on ?
      if (e.key === '?') {
        e.preventDefault();
        showModal();
        return;
      }

      const items = getItems();
      if (!items.length) return;

      switch (e.key) {
        case 'j':
          e.preventDefault();
          highlightItem(currentIndex + 1);
          break;
        case 'k':
          e.preventDefault();
          highlightItem(currentIndex - 1);
          break;
        case 'o':
        case 'Enter':
          if (currentIndex >= 0) {
            e.preventDefault();
            openCurrentItem();
          }
          break;
        case 'Escape':
          if (currentIndex >= 0) {
            e.preventDefault();
            clearSelection();
          }
          break;
        }
      });
    })();
    </script>
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

// --- Bookmark/Save button ---

export const bookmarkButton = (item: Item): HTML =>
  html`
    <button
      type="button"
      class="bookmark-btn"
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

// --- Favorites/Bookmarks script ---

export const favoritesScript = (): HTML =>
  html`
    <script>
    (function() {
      const STORAGE_KEY = 'nfhn-saved-stories';

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

      function notifyServiceWorker(type, id) {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: type,
            url: '/item/' + id
          });
        }
      }

      function toggleStory(btn) {
        const id = btn.dataset.storyId;
        const stories = getSavedStories();

        if (stories[id]) {
          delete stories[id];
          btn.classList.remove('is-saved');
          btn.title = 'Save story';
          btn.setAttribute('aria-label', 'Save story');
          notifyServiceWorker('UNCACHE_ITEM', id);
        } else {
          stories[id] = {
            id: parseInt(id, 10),
            title: btn.dataset.storyTitle,
            url: btn.dataset.storyUrl || null,
            domain: btn.dataset.storyDomain || null,
            type: btn.dataset.storyType,
            points: parseInt(btn.dataset.storyPoints, 10) || 0,
            user: btn.dataset.storyUser || null,
            time: parseInt(btn.dataset.storyTime, 10) || 0,
            time_ago: btn.dataset.storyTimeAgo,
            comments_count: parseInt(btn.dataset.storyComments, 10) || 0,
            saved_at: Date.now()
          };
          btn.classList.add('is-saved');
          btn.title = 'Remove from saved';
          btn.setAttribute('aria-label', 'Remove from saved');
          notifyServiceWorker('CACHE_ITEM', id);
        }

        saveStories(stories);
      }

      function initBookmarks() {
        const saved = getSavedStories();
        document.querySelectorAll('.bookmark-btn').forEach(btn => {
          const id = btn.dataset.storyId;
          if (saved[id]) {
            btn.classList.add('is-saved');
            btn.title = 'Remove from saved';
            btn.setAttribute('aria-label', 'Remove from saved');
          }
          btn.addEventListener('click', () => toggleStory(btn));
        });
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBookmarks);
      } else {
        initBookmarks();
      }
    })();
    </script>
  `;

// --- Story list item ---

export const renderStory = (data: Item): HTML => {
  const meta = getTypeMeta(data.type);

  return html`
    <li data-story-id="${data.id}">
      <a class="title" href="${meta.href(data)}">
        <span class="badge ${meta.badgeClass}">${meta.label}</span>
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
        ${bookmarkButton(data)}
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
