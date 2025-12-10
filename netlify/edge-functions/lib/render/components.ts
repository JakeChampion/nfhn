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

// --- Keyboard navigation script ---

export const keyboardNavScript = (): HTML =>
  html`
    <div id="aria-live" class="sr-only" aria-live="polite" aria-atomic="true"></div>
    <dialog id="shortcuts-modal" class="shortcuts-modal">
      <h2>Keyboard Shortcuts</h2>
      <dl class="shortcuts-list">
        <dt><kbd>j</kbd></dt><dd>Next item</dd>
        <dt><kbd>k</kbd></dt><dd>Previous item</dd>
        <dt><kbd>o</kbd> / <kbd>Enter</kbd></dt><dd>Open selected item</dd>
        <dt><kbd>?</kbd></dt><dd>Show this help</dd>
        <dt><kbd>Esc</kbd></dt><dd>Close modal / clear selection</dd>
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
  if (!username) return html`[deleted]`;
  return html`<a href="/user/${username}" class="user-link">${username}</a>`;
};

// --- Share buttons ---

export const shareButtons = (title: string, url: string): HTML =>
  html`
    <div class="share-buttons" aria-label="Share this story">
      <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}"
         class="share-btn share-twitter"
         target="_blank"
         rel="noopener noreferrer"
         title="Share on Twitter">
        <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
        <span class="sr-only">Twitter</span>
      </a>
      <button type="button"
              class="share-btn share-copy"
              data-url="${url}"
              title="Copy link">
        <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
          <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
        </svg>
        <span class="sr-only">Copy link</span>
      </button>
    </div>
    <script>
    document.querySelectorAll('.share-copy').forEach(btn => {
      btn.addEventListener('click', async function() {
        const url = this.dataset.url;
        try {
          await navigator.clipboard.writeText(url);
          this.classList.add('copied');
          this.title = 'Copied!';
          setTimeout(() => {
            this.classList.remove('copied');
            this.title = 'Copy link';
          }, 2000);
        } catch (err) {
          console.error('Failed to copy:', err);
        }
      });
    });
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

  const userDisplay = user === "[deleted]"
    ? html`<span class="comment-user">[deleted]</span>`
    : html`<a href="/user/${user}" class="comment-user${isOP ? " is-op" : ""}">${user}</a>${isOP ? html` <abbr title="Original Poster" class="op-badge">OP</abbr>` : ""}`;

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
