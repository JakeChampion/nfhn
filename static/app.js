// app.js - Main application scripts for NFHN

// --- Theme management ---
(function initTheme() {
  const root = document.documentElement;
  const stored = localStorage.getItem("theme") || "auto";
  root.setAttribute("data-theme", stored);

  // The media-based <meta name="theme-color"> pair tracks the OS, so an in-page
  // override would leave the browser chrome out of step with the page. The
  // pre-paint inline script prepends a media-less tag, which browsers prefer
  // because it is first in document order; keep its value on the resolved theme.
  const darkQuery = matchMedia("(prefers-color-scheme: dark)");
  const syncThemeColor = (theme) => {
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (!meta) return;
    const dark = theme === "dark" || (theme === "auto" && darkQuery.matches);
    meta.content = dark ? "#0d1117" : "#f5f5f5";
  };
  syncThemeColor(stored);
  darkQuery.addEventListener("change", () => {
    syncThemeColor(localStorage.getItem("theme") || "auto");
  });

  const radios = document.querySelectorAll('input[name="theme"]');
  radios.forEach((radio) => {
    if (radio.value === stored) radio.checked = true;
    radio.addEventListener("change", (e) => {
      const theme = e.target.value;
      root.setAttribute("data-theme", theme);
      localStorage.setItem("theme", theme);
      syncThemeColor(theme);
    });
  });
})();

// --- Service worker registration ---
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// --- External link handling ---
document.querySelectorAll('a[href^="http"]:not(.reader-mode-link)').forEach((link) => {
  const url = new URL(link.href);
  if (url.origin !== location.origin) {
    link.classList.add("external-link");
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
    if (!link.querySelector(".sr-only")) {
      const sr = document.createElement("span");
      sr.className = "sr-only";
      sr.textContent = " (opens in new tab)";
      link.appendChild(sr);
    }
  }
});

// --- Prefetch/prerender on intent ---
(function initTurbo() {
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
      link.as = "document";
    } else {
      return;
    }

    link.href = href;
    document.head.appendChild(link);
  }

  function onIntent(e) {
    const a = e.target.closest("a[href]");
    if (!a) return;
    if (a.target && a.target !== "_self") return;
    if (a.hasAttribute("download")) return;

    warm(a.href);
  }

  document.addEventListener("mouseover", onIntent, { passive: true });
  document.addEventListener("touchstart", onIntent, { passive: true });
})();

// --- Keyboard navigation ---
(function initKeyboardNav() {
  let currentIndex = -1;
  const liveRegion = document.getElementById("aria-live");
  const modal = document.getElementById("shortcuts-modal");
  if (!modal) return;

  // Detect if the element uses Popover API or is a dialog
  const isPopover = modal.hasAttribute("popover");

  function announce(message) {
    if (liveRegion) liveRegion.textContent = message;
  }

  function getItems() {
    const listItems = document.querySelectorAll("main ol > li");
    if (listItems.length) return Array.from(listItems);
    const comments = document.querySelectorAll('section[aria-label="Comments"] > details');
    return Array.from(comments);
  }

  function getItemLabel(item, index, total) {
    const title = item.querySelector(".story-title-text, .title, summary");
    const text = title ? title.textContent.trim().slice(0, 50) : "Item";
    return text + " (" + (index + 1) + " of " + total + ")";
  }

  function highlightItem(index) {
    const items = getItems();
    if (!items.length) return;

    items.forEach((item) => item.classList.remove("kbd-focus"));

    if (index < 0) index = 0;
    if (index >= items.length) index = items.length - 1;
    currentIndex = index;

    const item = items[currentIndex];
    item.classList.add("kbd-focus");
    item.scrollIntoView({ behavior: "smooth", block: "center" });
    item.setAttribute("tabindex", "-1");
    item.focus({ preventScroll: true });
    announce(getItemLabel(item, currentIndex, items.length));
  }

  function clearSelection() {
    const items = getItems();
    items.forEach((item) => {
      item.classList.remove("kbd-focus");
      item.removeAttribute("tabindex");
    });
    currentIndex = -1;
    announce("Selection cleared");
  }

  function openCurrentItem() {
    const items = getItems();
    if (currentIndex < 0 || currentIndex >= items.length) return;

    const item = items[currentIndex];
    const link = item.querySelector('a.title, a.comments, a[href^="/item/"]');
    if (link) link.click();
  }

  function showModal() {
    if (isPopover) {
      modal.showPopover();
    } else {
      modal.showModal();
    }
    const closeBtn = modal.querySelector(".modal-close");
    if (closeBtn) closeBtn.focus();
  }

  function hideModal() {
    if (isPopover) {
      modal.hidePopover();
    } else {
      modal.close();
    }
  }

  function isModalOpen() {
    if (isPopover) {
      return modal.matches(":popover-open");
    }
    return modal.open;
  }

  modal.addEventListener("click", function (e) {
    if (e.target === modal) hideModal();
  });

  const settingsMenu = document.getElementById("settings-menu");
  if (settingsMenu) {
    const isSettingsPopover = settingsMenu.hasAttribute("popover");
    settingsMenu.addEventListener("click", function (e) {
      if (e.target === settingsMenu) {
        if (isSettingsPopover) {
          settingsMenu.hidePopover();
        } else {
          settingsMenu.close();
        }
      }
    });
  }

  document.addEventListener("keydown", function (e) {
    if (isModalOpen() && e.key === "Escape") {
      e.preventDefault();
      hideModal();
      return;
    }

    if (e.target.matches("input, textarea, select")) return;

    if (e.key === "?") {
      e.preventDefault();
      showModal();
      return;
    }

    const items = getItems();
    if (!items.length) return;

    switch (e.key) {
      case "j":
        e.preventDefault();
        highlightItem(currentIndex + 1);
        break;
      case "k":
        e.preventDefault();
        highlightItem(currentIndex - 1);
        break;
      case "o":
      case "Enter":
        if (currentIndex >= 0) {
          e.preventDefault();
          openCurrentItem();
        }
        break;
      case "Escape":
        if (currentIndex >= 0) {
          e.preventDefault();
          clearSelection();
        }
        break;
    }
  });
})();

// --- The saved list, where the service worker can read it ---
//
// Saved stories live in localStorage, which a service worker cannot reach.
// The periodic refresh in sw.js needs to know which threads to check, so the
// list is mirrored into the cache under a synthetic URL every time it
// changes. Ids and two numbers, nothing else: it is read on a background task
// with no page open, and none of the rest is any of the worker's business.
//
// The two numbers are the whole design. `seen` is the comment count the last
// time the reader actually opened the thread; `latest` is what the background
// refresh last found. The badge is how many threads have `latest > seen` -
// conversations worth going back to.
//
// A single "count when saved" number cannot express that. It would either
// badge forever (nothing ever marks a thread read) or clear on any glance at
// the saved list, which is not the same thing as having read the comments.
const SavedIndex = (function () {
  const SAVED_INDEX_URL = "/__nfhn/saved-index";
  const SAVED_CACHE = "nfhn-saved-v1";

  async function readSavedIndex() {
    try {
      const cache = await caches.open(SAVED_CACHE);
      const response = await cache.match(SAVED_INDEX_URL);
      return response ? await response.json() : {};
    } catch {
      return {};
    }
  }

  async function writeSavedIndex(index) {
    const cache = await caches.open(SAVED_CACHE);
    await cache.put(
      SAVED_INDEX_URL,
      new Response(JSON.stringify(index), {
        headers: { "content-type": "application/json" },
      }),
    );
  }

  /** Threads with comments the reader has not seen. */
  const unreadCount = (index) =>
    Object.values(index).filter((entry) => (entry?.latest ?? 0) > (entry?.seen ?? 0)).length;

  async function showBadge(index) {
    try {
      const unread = unreadCount(index);
      if (unread > 0) await navigator.setAppBadge?.(unread);
      else await navigator.clearAppBadge?.();
    } catch {
      // Not installed, or badging unsupported.
    }
  }

  /** Bring the index in line with what is saved, preserving read state. */
  async function publishSavedIndex(stories) {
    if (!("caches" in globalThis)) return;
    try {
      const existing = await readSavedIndex();
      const index = {};
      for (const [id, story] of Object.entries(stories)) {
        const count = story.comments_count || 0;
        // A newly saved story starts read: the reader is looking at it now.
        // Unsaving one drops it, so the badge cannot count a thread that is no
        // longer in the list.
        index[id] = existing[id] ?? { seen: count, latest: count };
      }
      await writeSavedIndex(index);
      await showBadge(index);
    } catch {
      // Storage pressure. The refresh degrades to doing nothing, which is
      // where it started.
    }
  }

  /** Record that the reader has now seen this thread at this comment count. */
  async function markThreadSeen(id, count) {
    if (!("caches" in globalThis)) return;
    try {
      const index = await readSavedIndex();
      if (!index[id]) return;
      index[id] = { seen: count, latest: Math.max(count, index[id].latest ?? 0) };
      await writeSavedIndex(index);
      await showBadge(index);
    } catch {
      // Nothing to do; the count stays where it was.
    }
  }

  return { publish: publishSavedIndex, markSeen: markThreadSeen, unread: unreadCount };
})();

// --- Favorites/Bookmarks ---
(function initBookmarks() {
  const STORAGE_KEY = "nfhn-saved-stories";

  // Saved stories live in storage the browser is free to evict under pressure,
  // silently. Asking for persistence at the moment someone first saves
  // something - rather than on page load - is both more honest and more likely
  // to be granted, since browsers weigh engagement when deciding.
  // See docs/api-proposals/18-pwa-integration-surface.md
  let persistenceRequested = false;
  async function requestPersistence() {
    if (persistenceRequested) return;
    persistenceRequested = true;
    try {
      if (!navigator.storage?.persist) return;
      if (await navigator.storage.persisted()) return;
      await navigator.storage.persist();
    } catch {
      // Not supported, or the user declined. Saving still works; it is just
      // evictable, which is the status quo.
    }
  }

  function getSavedStories() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveStories(stories) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
    } catch (e) {
      console.error("Failed to save:", e);
    }
  }

  function notifyServiceWorker(type, id, externalUrl) {
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: type,
        url: "/item/" + id,
        externalUrl: externalUrl || null,
      });
    }
  }

  // --- Downloading a saved story ---
  //
  // The postMessage path above hands three URLs to the worker and hopes: they
  // are ordinary fetches started from a message handler, so nothing keeps the
  // worker alive and a slow article on a slow connection can be killed halfway.
  // The reader is told neither way, and finds out when they are offline.
  //
  // Background Fetch is the API for this. The browser owns the download - it
  // survives this page closing and the browser restarting, and it shows the
  // same progress UI as any other download. sw.js moves the responses into the
  // saved cache when it completes.
  //
  // Chrome-only, so this returns false and the caller falls back.
  async function downloadInBackground(id, title, externalUrl) {
    if (!("serviceWorker" in navigator)) return false;
    if (!("BackgroundFetchManager" in globalThis)) return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      if (!registration.backgroundFetch) return false;

      // Item page first: it is the one that must arrive, and a partial fetch
      // keeps whatever came before the failure.
      const requests = ["/item/" + id];
      if (externalUrl) {
        requests.push("/reader/" + externalUrl);
        // The article itself, opaquely - most sites will not send us CORS
        // headers, and an opaque response still renders.
        requests.push(new Request(externalUrl, { mode: "no-cors" }));
      }

      await registration.backgroundFetch.fetch("save-item-" + id, requests, {
        title: title || "Saving story",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
        // An honest guess. Getting it wrong only makes the progress bar
        // inaccurate; omitting it makes the download unbounded, and Chrome
        // will not show progress at all.
        downloadTotal: externalUrl ? 2_000_000 : 200_000,
      });
      return true;
    } catch {
      // Already registered under this id, quota exceeded, or unsupported.
      return false;
    }
  }

  // Periodic Background Sync only runs for an installed app the browser
  // considers engaged, and there is no prompt to show, so registering it at the
  // moment somebody first saves something - like the persistence request above
  // - is the honest place. Nothing is registered for a reader who never saves.
  let syncRegistered = false;
  async function registerPeriodicRefresh() {
    if (syncRegistered) return;
    syncRegistered = true;
    try {
      const registration = await navigator.serviceWorker?.ready;
      if (!registration?.periodicSync) return;

      const status = await navigator.permissions.query({ name: "periodic-background-sync" });
      if (status.state !== "granted") return;

      // Twelve hours is a request, not a schedule - the browser decides when,
      // and on what connection. Asking for less would not get it.
      await registration.periodicSync.register("refresh-saved", {
        minInterval: 12 * 60 * 60 * 1000,
      });
    } catch {
      // Unsupported, not installed, or the permission name is unknown to this
      // browser. Saved stories still work; they just do not refresh themselves.
    }
  }

  function toggleStory(btn) {
    const id = btn.dataset.storyId;
    const externalUrl = btn.dataset.storyUrl || null;
    const stories = getSavedStories();

    if (stories[id]) {
      delete stories[id];
      btn.setAttribute("aria-pressed", "false");
      btn.title = "Save story";
      btn.setAttribute("aria-label", "Save story");
      notifyServiceWorker("UNCACHE_ITEM", id, externalUrl);
    } else {
      stories[id] = {
        id: parseInt(id, 10),
        title: btn.dataset.storyTitle,
        url: externalUrl,
        domain: btn.dataset.storyDomain || null,
        type: btn.dataset.storyType,
        points: parseInt(btn.dataset.storyPoints, 10) || 0,
        user: btn.dataset.storyUser || null,
        time: parseInt(btn.dataset.storyTime, 10) || 0,
        time_ago: btn.dataset.storyTimeAgo,
        comments_count: parseInt(btn.dataset.storyComments, 10) || 0,
        saved_at: Date.now(),
      };
      btn.setAttribute("aria-pressed", "true");
      btn.title = "Remove from saved";
      btn.setAttribute("aria-label", "Remove from saved");
      // Background Fetch where it exists, the message handler where it does
      // not. Both end up writing to the same cache; only one of them is
      // guaranteed to finish.
      downloadInBackground(id, btn.dataset.storyTitle, externalUrl).then((started) => {
        if (!started) notifyServiceWorker("CACHE_ITEM", id, externalUrl);
      });
      requestPersistence();
      registerPeriodicRefresh();
    }

    saveStories(stories);
    SavedIndex.publish(stories);
  }

  const saved = getSavedStories();
  document.querySelectorAll(".bookmark-btn").forEach((btn) => {
    const id = btn.dataset.storyId;
    if (saved[id]) {
      btn.setAttribute("aria-pressed", "true");
      btn.title = "Remove from saved";
      btn.setAttribute("aria-label", "Remove from saved");
    }
    btn.addEventListener("click", () => toggleStory(btn));
  });

  // Opening a saved thread is what marks it read. The banner rendered for the
  // live-updates stream already carries the count this page was built with, so
  // there is nothing extra to render for this.
  const liveBanner = document.getElementById("live-updates");
  if (liveBanner?.dataset.itemId) {
    SavedIndex.markSeen(liveBanner.dataset.itemId, Number(liveBanner.dataset.comments) || 0);
  }

  // --- Saved stories page rendering ---
  const container = document.getElementById("saved-stories-container");
  if (container) {
    const TYPE_META = {
      ask: { label: "Ask HN", badgeClass: "badge-ask", href: (item) => "/item/" + item.id },
      show: { label: "Show HN", badgeClass: "badge-show", href: (item) => "/item/" + item.id },
      tell: { label: "Tell HN", badgeClass: "badge-tell", href: (item) => "/item/" + item.id },
      job: {
        label: "Job",
        badgeClass: "badge-job",
        href: (item) => item.url || "/item/" + item.id,
      },
      link: { label: "", badgeClass: "", href: (item) => item.url || "/item/" + item.id },
      comment: {
        label: "Comment",
        badgeClass: "badge-default",
        href: (item) => "/item/" + item.id,
      },
    };

    function escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }

    function renderSavedStory(item) {
      const meta = TYPE_META[item.type] || TYPE_META.link;
      const href = meta.href(item);

      return (
        '<li data-story-id="' +
        item.id +
        '">' +
        '<a class="title" href="' +
        escapeHtml(href) +
        '">' +
        (meta.label
          ? '<span class="badge ' + meta.badgeClass + '">' + meta.label + "</span>"
          : "") +
        '<span class="story-title-text">' +
        escapeHtml(item.title) +
        "</span>" +
        (item.domain ? '<span class="story-meta">(' + escapeHtml(item.domain) + ")</span>" : "") +
        "</a>" +
        '<div class="story-actions">' +
        '<a class="comments" href="/item/' +
        item.id +
        '">' +
        "view " +
        (item.comments_count > 0 ? item.comments_count + " comments" : "discussion") +
        "</a>" +
        '<button type="button" class="bookmark-btn" ' +
        'aria-pressed="true" ' +
        'data-story-id="' +
        item.id +
        '" ' +
        'title="Remove from saved" aria-label="Remove from saved">' +
        '<svg class="bookmark-icon-outline" viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">' +
        '<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>' +
        "</svg>" +
        '<svg class="bookmark-icon-filled" viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">' +
        '<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>' +
        "</svg>" +
        '<span class="sr-only">Remove</span>' +
        "</button>" +
        "</div>" +
        "</li>"
      );
    }

    function removeFromSaved(id) {
      const stories = getSavedStories();
      delete stories[id];
      saveStories(stories);
      // A thread that is no longer saved must not keep counting towards the
      // badge, and its offline copy is no longer wanted.
      SavedIndex.publish(stories);
      renderSavedStories();
    }

    function renderSavedStories() {
      const stories = getSavedStories();
      const items = Object.values(stories);

      if (items.length === 0) {
        container.innerHTML = '<div class="empty-saved">' +
          "<p>No saved stories yet.</p>" +
          "<p>Click the bookmark icon on any story to save it for offline reading.</p>" +
          "</div>";
        return;
      }

      // Sort by saved_at descending (most recently saved first)
      items.sort((a, b) => (b.saved_at || 0) - (a.saved_at || 0));

      container.innerHTML = '<p class="saved-count">' +
        items.length +
        " saved stor" +
        (items.length === 1 ? "y" : "ies") +
        "</p>" +
        '<ol class="stories">' +
        items.map(renderSavedStory).join("") +
        "</ol>";

      // Add click handlers for remove buttons
      container.querySelectorAll(".bookmark-btn").forEach((btn) => {
        btn.addEventListener("click", function () {
          removeFromSaved(this.dataset.storyId);
        });
      });
    }

    renderSavedStories();
  }
})();

// --- Web Share API ---
(function initWebShare() {
  // Check if Web Share API is supported
  if (!navigator.share) {
    // Hide share buttons if not supported
    document.documentElement.classList.add("no-share");
    return;
  }

  // Add class to enable share buttons via CSS
  document.documentElement.classList.add("can-share");

  // Handle share button clicks
  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".share-btn");
    if (!btn) return;

    e.preventDefault();

    const title = btn.dataset.shareTitle || document.title;
    const url = btn.dataset.shareUrl || window.location.href;

    navigator.share({
      title: title,
      url: url,
    }).catch(function (err) {
      // User cancelled or share failed silently
      if (err.name !== "AbortError") {
        console.error("Share failed:", err);
      }
    });
  });
})();

// --- Prerender gating ---
//
// Speculation Rules prerender pages that may never be activated. Work that
// measures, reports or warms an expensive resource must not run in that state:
// it inflates whatever it measures and spends the visitor's battery on a page
// they may never see. `document.prerendering` is true during prerender, and
// `prerenderingchange` fires if and when the page is actually activated.
function whenActivated(fn) {
  if (!document.prerendering) {
    fn();
    return;
  }
  document.addEventListener("prerenderingchange", () => fn(), { once: true });
}

// --- Long Animation Frames ---
//
// LoAF attributes a slow frame to the script that caused it, which is what INP
// debugging actually needs - "something blocked for 300ms" is not actionable,
// "justify.js blocked for 300ms" is. Reported to the same collector as CSP and
// bfcache reports.
whenActivated(function observeLongAnimationFrames() {
  if (typeof PerformanceObserver === "undefined") return;
  if (!PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame")) return;

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      // 200ms is well past "janky"; below that the report volume is not worth it.
      if (entry.duration < 200) continue;

      const worst = (entry.scripts ?? [])
        .slice()
        .sort((a, b) => b.duration - a.duration)[0];

      try {
        navigator.sendBeacon(
          "/_report",
          new Blob([JSON.stringify([{
            type: "long-animation-frame",
            url: location.href,
            body: {
              duration: Math.round(entry.duration),
              blockingDuration: Math.round(entry.blockingDuration ?? 0),
              script: worst
                ? {
                  name: worst.name,
                  source: worst.sourceURL || worst.invoker,
                  duration: Math.round(worst.duration),
                }
                : null,
            },
          }])], { type: "application/reports+json" }),
        );
      } catch {
        // Diagnostics must never be load-bearing.
      }
    }
  });

  try {
    observer.observe({ type: "long-animation-frame", buffered: true });
  } catch {
    // Nothing to do; the entry type is simply unavailable.
  }
});

// --- bfcache diagnostics ---
//
// NFHN's whole performance story assumes navigation is nearly free: Speculation
// Rules with prerender: moderate, No-Vary-Search so decorated URLs still hit,
// cross-document View Transitions to hide the seam. Back/forward should be free
// too - restored from bfcache with no request at all - but eligibility is easy
// to lose by accident and impossible to spot from source.
//
// notRestoredReasons says exactly why a restore was refused. Reported to the
// same collector as CSP violations (netlify/edge-functions/reports.ts).
//
// See docs/netlify-proposals/06-reporting-endpoint.md
whenActivated(function reportBfcacheBlocks() {
  const [nav] = performance.getEntriesByType("navigation");
  if (!nav || !nav.notRestoredReasons) return;

  const reasons = nav.notRestoredReasons;
  // A same-document reload reports no blocking reasons; only report a genuine
  // refusal, or this beacons on every single page load.
  if (!reasons.reasons?.length && !reasons.children?.length) return;

  try {
    navigator.sendBeacon(
      "/_report",
      new Blob(
        [
          JSON.stringify([{
            type: "bfcache-blocked",
            url: location.href,
            body: {
              reasons: reasons.reasons,
              blocked: reasons.blocked,
              id: reasons.id,
              name: reasons.name,
            },
          }]),
        ],
        { type: "application/reports+json" },
      ),
    );
  } catch {
    // Diagnostics must never be load-bearing.
  }
});

// --- On-device summarisation (Built-in AI) ---
//
// Chrome ships Gemini Nano with the browser and exposes it through task APIs.
// No API key, no backend, no per-use cost, and no data leaves the device -- which
// is why this fits a site with no accounts, no analytics and a CSP of
// connect-src 'self'. A conventional "summarise this" feature would break all
// four; this one adds no network request at all.
//
// Chrome desktop only, and gated on availability() rather than mere presence of
// the global: the model may be unavailable on the hardware, or need a large
// download first. The control is only inserted once we know it can actually run,
// so nobody is offered a button that does nothing.
//
// See docs/api-proposals/15-built-in-ai.md
const Summarise = (function () {
  // A very long thread will exceed the model's input quota. Summarising the
  // highest-signal part beats failing, and beats silently truncating mid-word.
  const MAX_CHARS = 12000;

  function threadText() {
    const section = document.getElementById("comments");
    if (!section) return "";

    const parts = [];
    let used = 0;
    for (const comment of section.querySelectorAll("details")) {
      const author = comment.querySelector(".comment-user")?.textContent?.trim() || "someone";
      const body = comment.querySelector("summary + div")?.textContent?.trim();
      if (!body) continue;

      const line = author + ": " + body;
      if (used + line.length > MAX_CHARS) break;
      parts.push(line);
      used += line.length;
    }
    return parts.join("\n\n");
  }

  async function available() {
    if (!("Summarizer" in self)) return false;
    try {
      const state = await Summarizer.availability();
      // "downloadable" is offered too: the download is user-initiated below,
      // with progress, rather than starting on page load.
      return state !== "unavailable";
    } catch {
      return false;
    }
  }

  async function run(target, options) {
    const text = threadText();
    if (!text) {
      target.textContent = "Nothing to summarise yet.";
      return;
    }

    target.textContent = "Preparing…";

    const summarizer = await Summarizer.create({
      type: options.type || "key-points",
      format: "plain-text",
      length: "short",
      sharedContext: options.context,
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (event) => {
          const pct = Math.round((event.loaded || 0) * 100);
          target.textContent = "Downloading model… " + pct + "%";
        });
      },
    });

    try {
      target.textContent = "";
      // Streaming matters here: on-device inference is not instant, and a panel
      // that fills progressively reads far better than a spinner.
      const stream = summarizer.summarizeStreaming(text);
      for await (const chunk of stream) {
        target.textContent += chunk;
      }
    } finally {
      summarizer.destroy?.();
    }
  }

  return { available, run, threadText };
})();

whenActivated(function initSummariseControl() {
  const controls = document.querySelector(".comment-controls");
  if (!controls) return;

  Summarise.available().then((ok) => {
    if (!ok) return;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Summarise thread";
    button.className = "comment-summarise";

    const panel = document.createElement("div");
    panel.className = "comment-summary";
    panel.hidden = true;
    // The output is an interpretation of a contentious discussion, not a
    // substitute for it. Say so, and keep the full thread one scroll away.
    panel.setAttribute("aria-live", "polite");

    const output = document.createElement("p");
    const note = document.createElement("p");
    note.className = "comment-summary-note";
    note.textContent = "Generated on your device. The full thread is below.";
    panel.append(output, note);

    button.addEventListener("click", async () => {
      button.disabled = true;
      panel.hidden = false;
      try {
        await Summarise.run(output, {
          type: "key-points",
          context:
            "A Hacker News discussion thread. Identify the main points of disagreement and the most substantive claims.",
        });
      } catch (err) {
        output.textContent = "Could not summarise this thread: " + err.message;
      } finally {
        button.disabled = false;
      }
    });

    controls.append(button);
    controls.after(panel);
  });
});

// --- Comment thread controls (Invoker Commands) ---
//
// The buttons declare `commandfor="comments" command="--collapse-all"` in
// markup. Custom commands (the `--` prefix) dispatch a `command` event rather
// than performing a built-in action, so this one delegated listener covers every
// control -- and event.source gives the invoking button directly, with no
// closest() walk from the event target.
//
// Browsers without invoker support leave the buttons inert, so the same handler
// is wired to click as a fallback and removed once support is universal.
(function initCommentControls() {
  const supportsInvokers = "commandForElement" in HTMLButtonElement.prototype;

  function setAll(open) {
    const section = document.getElementById("comments");
    if (!section) return;
    for (const details of section.querySelectorAll("details")) {
      details.open = open;
    }
    // Swap which control is offered, so the button always describes the action
    // that is actually available.
    const collapse = document.querySelector('[command="--collapse-all"]');
    const expand = document.querySelector('[command="--expand-all"]');
    if (collapse) collapse.hidden = !open;
    if (expand) expand.hidden = open;
  }

  function run(command) {
    if (command === "--collapse-all") {
      setAll(false);
      return true;
    }
    if (command === "--expand-all") {
      setAll(true);
      return true;
    }
    return false;
  }

  if (supportsInvokers) {
    document.addEventListener("command", (event) => {
      run(event.command);
    });
    return;
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[command]");
    if (!button) return;
    if (run(button.getAttribute("command"))) event.preventDefault();
  });
})();

// --- Relative timestamps (Intl.RelativeTimeFormat) ---
//
// The server renders a relative string that is frozen at render time, and these
// pages are cached for minutes. This re-renders every <time datetime> against
// the reader's own clock and locale, so a page served from cache still shows the
// right age. The server text remains the no-JS fallback.
const RelativeTime = (function () {
  const UNITS = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];

  let formatter = null;
  const getFormatter = () => {
    if (!formatter) {
      formatter = new Intl.RelativeTimeFormat(navigator.language || "en", {
        numeric: "auto",
      });
    }
    return formatter;
  };

  // Fixed-size units are an approximation: a "month" is not 2,592,000 seconds,
  // and years are not all 365 days. Temporal does real calendar arithmetic, so
  // where it exists we use it and get "2 months ago" that means two calendar
  // months. Everywhere else the approximation below is what you get, which is
  // exactly today's behaviour.
  const hasTemporal = typeof Temporal !== "undefined";

  function calendarUnits(date, now) {
    const from = Temporal.Instant.fromEpochMilliseconds(now)
      .toZonedDateTimeISO(Temporal.Now.timeZoneId());
    const to = Temporal.Instant.fromEpochMilliseconds(date.getTime())
      .toZonedDateTimeISO(Temporal.Now.timeZoneId());

    const diff = from.until(to, { largestUnit: "year" });
    for (const unit of ["years", "months", "weeks", "days", "hours", "minutes"]) {
      if (diff[unit] !== 0) {
        return [diff[unit], unit.slice(0, -1)];
      }
    }
    return null;
  }

  function format(date, now) {
    const reference = now ?? Date.now();
    const seconds = Math.round((date.getTime() - reference) / 1000);
    const magnitude = Math.abs(seconds);
    if (magnitude < 45) return "just now";

    if (hasTemporal) {
      try {
        const calendar = calendarUnits(date, reference);
        if (calendar) return getFormatter().format(calendar[0], calendar[1]);
      } catch {
        // Fall through to the fixed-size approximation below.
      }
    }

    for (const [unit, size] of UNITS) {
      if (magnitude >= size) {
        return getFormatter().format(Math.round(seconds / size), unit);
      }
    }
    return getFormatter().format(Math.round(seconds / 60), "minute");
  }

  function refresh(root) {
    if (!("RelativeTimeFormat" in Intl)) return;
    const now = Date.now();
    const scope = root || document;
    for (const el of scope.querySelectorAll("time[datetime]")) {
      const date = new Date(el.dateTime);
      if (Number.isNaN(date.getTime())) continue;
      // Keep the absolute time reachable on hover / for assistive tech.
      if (!el.title) el.title = date.toLocaleString();
      el.textContent = format(date, now);
    }
  }

  return { format, refresh };
})();

(function initRelativeTimes() {
  RelativeTime.refresh();
  // Comment threads sit open for a long time; a page left on screen should not
  // keep claiming a story was posted "2 minutes ago" an hour later.
  setInterval(() => RelativeTime.refresh(), 60_000);
  addEventListener("pageshow", (event) => {
    // Restored from bfcache: the DOM is exactly as it was, timestamps included.
    if (event.persisted) RelativeTime.refresh();
  });
})();

// --- Grapheme-safe truncation (Intl.Segmenter) ---
//
// Slicing a string by code unit splits emoji with skin-tone modifiers, family
// sequences, Hangul syllables and combining accents - all of which turn up in HN
// titles. Segmenter counts what a reader would call a character.
const TextSegments = (function () {
  const supported = typeof Intl !== "undefined" && "Segmenter" in Intl;
  let graphemes = null;

  function truncate(text, maxGraphemes) {
    if (!text || text.length <= maxGraphemes) return text;
    if (!supported) return text.slice(0, maxGraphemes) + "…";

    if (!graphemes) {
      graphemes = new Intl.Segmenter(navigator.language || "en", {
        granularity: "grapheme",
      });
    }

    const parts = [];
    for (const { segment } of graphemes.segment(text)) {
      parts.push(segment);
      if (parts.length > maxGraphemes) {
        return parts.slice(0, maxGraphemes).join("") + "…";
      }
    }
    return text;
  }

  return { truncate, supported };
})();

// --- View transition types ---
//
// Cross-document view transitions are opted into from CSS (@view-transition in
// styles.css). This classifies each navigation and hands the result to the
// transition as a *type*, which is what `:active-view-transition-type(...)`
// selectors match on. Without this every navigation animates identically:
// paging forward looks the same as going back, and drilling into a story looks
// the same as returning from one.
//
// Types are assigned in both pageswap (outgoing document) and pagereveal
// (incoming document) because each side runs its own half of the animation.
(function initViewTransitionTypes() {
  const routeKind = (pathname) => {
    const feed = pathname.match(/^\/(top|newest|ask|show|jobs)\/(\d+)$/);
    if (feed) return { kind: "feed", feed: feed[1], page: Number(feed[2]) };
    if (/^\/item\/\d+$/.test(pathname)) return { kind: "item" };
    if (/^\/user\//.test(pathname)) return { kind: "user" };
    return { kind: "other" };
  };

  // Returns the transition type for a navigation, or null to leave the default.
  const classify = (fromUrl, toUrl) => {
    if (!fromUrl || !toUrl) return null;

    let from, to;
    try {
      from = new URL(fromUrl);
      to = new URL(toUrl);
    } catch {
      return null;
    }
    if (from.origin !== to.origin) return null;

    const a = routeKind(from.pathname);
    const b = routeKind(to.pathname);

    // Paging within one feed: direction follows the page number.
    if (a.kind === "feed" && b.kind === "feed" && a.feed === b.feed) {
      if (b.page > a.page) return "forward";
      if (b.page < a.page) return "backward";
      return null;
    }

    // Feed to story and back: the story title is a shared element, so these get
    // their own types rather than the horizontal slide used for paging.
    if (a.kind === "feed" && b.kind === "item") return "drill-in";
    if (a.kind === "item" && b.kind === "feed") return "drill-out";

    return null;
  };

  const apply = (transition, fromUrl, toUrl) => {
    if (!transition || !transition.types) return;
    const type = classify(fromUrl, toUrl);
    if (type) transition.types.add(type);
  };

  addEventListener("pageswap", (event) => {
    if (!event.viewTransition) return;
    const activation = event.activation;
    apply(event.viewTransition, activation?.from?.url, activation?.entry?.url);
  });

  addEventListener("pagereveal", (event) => {
    if (!event.viewTransition) return;
    const from = globalThis.navigation?.activation?.from?.url;
    apply(event.viewTransition, from, location.href);
  });
})();

// --- Returning to where you were ---
//
// Cross-document navigation resets focus to the start of the document. On the
// way *into* a story that is correct - the new page is the new context. On the
// way back out it is not: the browser restores your scroll position to the
// story you clicked, and then puts focus a hundred rows above it. Tab, and you
// are back at the skip link.
//
// So this restores the one thing the platform does not: which link you left
// from. It only ever fires on a traversal (Back, or a gesture the browser
// reports as one), only when the recorded page is the page we landed on, and
// only when the exact link still exists - a forward navigation to the same URL
// is a fresh visit and gets the default.
//
// `preventScroll` matters. The browser has already restored the scroll offset
// by this point and it is more accurate than anything derived from an element,
// so focusing without it would jump the page a few pixels for no reason.
(function initFocusRestoration() {
  const KEY = "nfhn:left-from";
  const STORY = "li[data-story-id]";

  // What to come back to, or null when the answer is "nothing in particular".
  const departure = (link) => {
    const story = link.closest(STORY);
    if (story) {
      return {
        id: story.dataset.storyId,
        // Title and comments links sit in one row; coming back to the wrong one
        // of the two would be its own small annoyance.
        via: link.classList.contains("comments") ? "comments" : "title",
      };
    }
    // Paging back and forth should leave you on the pager, not send you to the
    // top of a list you have already read.
    if (link.classList.contains("more-link")) return { via: "more" };
    return null;
  };

  const remember = (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link) return;

    const leaving = departure(link);
    try {
      // An unrecognised link overwrites rather than leaves the old record in
      // place: whatever it was, it is no longer where the reader left from.
      if (leaving) {
        sessionStorage.setItem(KEY, JSON.stringify({ path: location.pathname, ...leaving }));
      } else {
        sessionStorage.removeItem(KEY);
      }
    } catch {
      // Private mode, or a full quota. Losing this is not worth an error.
    }
  };

  // Capture, because a click on the title span never reaches the anchor as
  // `target` and because nothing else here should be able to stop it.
  addEventListener("click", remember, { capture: true });
  // Keyboard activation of a link fires click too, but a middle-click or a
  // modified click opens a new tab and must not overwrite the record.
  addEventListener("auxclick", (event) => event.button === 1 && remember(event), {
    capture: true,
  });

  const cameBack = () => {
    const type = globalThis.navigation?.activation?.navigationType;
    if (type) return type === "traverse";
    // No Navigation API: the Performance entry says the same thing, later.
    return performance.getEntriesByType?.("navigation")[0]?.type === "back_forward";
  };

  const restore = () => {
    if (!cameBack()) return;

    let record;
    try {
      record = JSON.parse(sessionStorage.getItem(KEY) || "null");
    } catch {
      return;
    }
    if (!record || record.path !== location.pathname) return;

    const link = record.via === "more" ? document.querySelector("a.more-link") : document
      .querySelector(`${STORY}[data-story-id="${CSS.escape(String(record.id))}"]`)
      ?.querySelector(record.via === "comments" ? "a.comments" : "a.title");
    if (!link) return;

    link.focus({ preventScroll: true });
  };

  // After the transition, not during it: focusing mid-animation scrolls the
  // snapshot rather than the page in some browsers, and the old and new
  // documents are both alive at that point.
  addEventListener("pagereveal", (event) => {
    if (event.viewTransition) event.viewTransition.finished.then(restore, restore);
    else restore();
  });
  // pagereveal is Chrome-only so far, and bfcache restores focus itself.
  addEventListener("pageshow", (event) => {
    if (!event.persisted && !("onpagereveal" in globalThis)) restore();
  });
})();

// --- Story previews on hover ---
//
// A feed row tells you a story's title, domain and comment count. What it does
// not tell you is whether the thing is worth opening, which is the question you
// are actually asking when you hover it. This shows one paragraph: the
// submitter's own text, or the article's excerpt if reader mode has ever seen
// this URL, or the first substantial comment. /api/preview/:id decides which.
//
// Interest invokers do the hard part. `interestfor` on a link means the browser
// owns "has the reader shown interest in this?" - a hover held long enough, a
// long-press on touch, a keyboard hotkey, focus - and it owns dismissal, focus
// containment and the accessible relationship between link and card. All of
// which is what previously made hover cards a bad idea to build: they were
// mouse-only, they fought with focus, and they ate the click.
//
// The attribute is attached here rather than rendered, so a reader without
// JavaScript never gets a hover that opens an empty box.
//
// See docs/api-proposals/14-invoker-commands.md
(function initStoryPreviews() {
  const card = document.getElementById("story-preview");
  if (!card) return;
  // Both halves are needed: the invoker fires the interaction, and `hint` is
  // the only popover type interest invokers drive. A browser with one and not
  // the other gets today's behaviour, which is a plain link.
  if (!("interestForElement" in HTMLAnchorElement.prototype)) return;
  if (typeof card.showPopover !== "function") return;

  // The card is rendered `hidden` so that a browser without popover support
  // does not paint a stray box. This is the point at which we know it will not.
  card.hidden = false;

  const titleLine = card.querySelector(".story-preview-title");
  const excerptLine = card.querySelector(".story-preview-excerpt");
  const metaLine = card.querySelector(".story-preview-meta");

  const attach = (root) => {
    for (const link of root.querySelectorAll("li[data-story-id] a.title:not([interestfor])")) {
      link.setAttribute("interestfor", "story-preview");
    }
  };
  attach(document);

  // Saved stories are rendered client-side after this runs, and re-rendered
  // whenever one is removed.
  const saved = document.getElementById("saved-stories-container");
  if (saved) new MutationObserver(() => attach(saved)).observe(saved, { childList: true });

  // Previews are immutable for the life of the page - a story's text does not
  // change while you scan a feed - so a hover costs at most one request.
  const cache = new Map();
  let pending = null;

  const describe = (preview) => {
    const parts = [];
    if (preview.points !== null && preview.points !== undefined) {
      parts.push(`${preview.points} point${preview.points === 1 ? "" : "s"}`);
    }
    if (preview.user) parts.push(`by ${preview.user}`);
    if (preview.time) parts.push(RelativeTime.format(new Date(preview.time * 1000), Date.now()));
    if (preview.source === "article") parts.push("excerpt from the article");
    if (preview.source === "comment") parts.push("from the first comment");
    return parts.join(" · ");
  };

  // textContent throughout. The server sends plain text precisely so that this
  // can be true: no innerHTML means no new sink for the Trusted Types policy in
  // config.ts to have to keep exempting.
  const fill = (preview) => {
    titleLine.textContent = preview.title || "";
    excerptLine.textContent = preview.excerpt || "";
    excerptLine.hidden = !preview.excerpt;
    metaLine.textContent = describe(preview);
  };

  const load = async (id) => {
    pending?.abort();
    const controller = new AbortController();
    pending = controller;

    try {
      const response = await fetch(`/api/preview/${id}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]),
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(String(response.status));

      const preview = await response.json();
      cache.set(id, preview);
      // The reader may have moved on while this was in flight; filling the card
      // then would rewrite whatever they are looking at now.
      if (card.dataset.storyId === String(id)) fill(preview);
    } catch {
      // Including AbortError, which is the normal case rather than a failure.
      if (card.dataset.storyId === String(id)) {
        excerptLine.hidden = true;
        metaLine.textContent = "";
      }
    } finally {
      if (pending === controller) pending = null;
    }
  };

  card.addEventListener("interest", (event) => {
    const link = event.source;
    const id = link?.closest("li[data-story-id]")?.dataset.storyId;
    if (!id) return;

    card.dataset.storyId = id;
    const known = cache.get(id);
    if (known) {
      fill(known);
      return;
    }

    // Something in the card before the request lands, so it does not open
    // empty and then jump to full height a moment later.
    titleLine.textContent = link.querySelector(".story-title-text")?.textContent?.trim() ?? "";
    excerptLine.textContent = "";
    excerptLine.hidden = true;
    metaLine.textContent = "Loading…";
    load(id);
  });

  card.addEventListener("loseinterest", () => {
    // Nobody is waiting on it any more, and a feed scanned quickly would
    // otherwise leave a trail of requests behind the pointer.
    pending?.abort();
    pending = null;
    delete card.dataset.storyId;
  });
})();

// --- Live thread updates ---
//
// Subscribes to /api/live/:id and offers a refresh when the thread has moved.
// It never rewrites the comments in place: reordering a thread underneath
// somebody who is reading it is hostile, and the page is a few kilobytes -
// reloading it is cheap and gives them the whole updated tree at a moment they
// chose.
//
// Three things govern when the connection is open, and all three matter:
//
//   - Not during a prerender. Speculation Rules prerenders item pages that may
//     never be activated, and each one would otherwise hold a stream.
//   - Not while the tab is hidden. Nobody is reading it, and reconnecting when
//     they come back costs one request.
//   - Not across a navigation. An open EventSource makes a page ineligible for
//     the back/forward cache in some browsers, which would trade a live
//     comment count for instant Back - a bad trade, and one the bfcache
//     reporting above would then have to explain.
//
// See netlify/edge-functions/live.ts
whenActivated(function initLiveUpdates() {
  const banner = document.getElementById("live-updates");
  if (!banner || typeof EventSource === "undefined") return;

  const link = banner.querySelector(".live-updates-link");
  const itemId = banner.dataset.itemId;
  const rendered = Number(banner.dataset.comments) || 0;
  if (!itemId || !link) return;

  let source = null;
  let latest = rendered;

  const show = (count) => {
    const added = count - rendered;
    if (added <= 0) return;
    link.textContent = `${added} new comment${added === 1 ? "" : "s"} · refresh`;
    banner.hidden = false;
  };

  const open = () => {
    if (source) return;
    // `since` is the highest count this page knows about, so a reconnect after
    // the server rotated the stream does not re-announce what is already on
    // screen.
    source = new EventSource(`/api/live/${encodeURIComponent(itemId)}?since=${latest}`);

    source.addEventListener("comments", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (typeof data.count !== "number") return;
        latest = Math.max(latest, data.count);
        show(latest);
      } catch {
        // A malformed frame is not worth tearing the connection down for.
      }
    });

    // The server rotates streams rather than holding one open forever.
    // EventSource reconnects on its own after `retry`, so this is only here to
    // keep our own handle in step.
    source.addEventListener("bye", () => close());
    source.addEventListener("error", () => {
      // EventSource retries by itself; closing here would stop that. Only a
      // permanently closed connection needs our attention.
      if (source && source.readyState === EventSource.CLOSED) source = null;
    });
  };

  const close = () => {
    source?.close();
    source = null;
  };

  const sync = () => (document.visibilityState === "visible" ? open() : close());

  sync();
  document.addEventListener("visibilitychange", sync);
  // pagehide rather than unload: unload is what makes a page bfcache-ineligible
  // in the first place, and this listener exists precisely to protect that.
  addEventListener("pagehide", close);
  addEventListener("pageshow", sync);
});

// --- Compression Streams API (Phase 3) ---
// Utilities for compressing/decompressing data to reduce storage usage
const CompressionUtils = (function () {
  // Check if Compression Streams API is supported
  const isSupported = typeof CompressionStream !== "undefined" &&
    typeof DecompressionStream !== "undefined";

  async function compress(data) {
    if (!isSupported) return null;

    try {
      const jsonString = JSON.stringify(data);
      const encoder = new TextEncoder();
      const inputStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(jsonString));
          controller.close();
        },
      });

      const compressedStream = inputStream.pipeThrough(new CompressionStream("gzip"));
      const reader = compressedStream.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Combine chunks
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      // Convert to base64 for localStorage
      return btoa(String.fromCharCode(...result));
    } catch (e) {
      console.error("Compression failed:", e);
      return null;
    }
  }

  async function decompress(base64Data) {
    if (!isSupported || !base64Data) return null;

    try {
      // Convert from base64
      const binary = atob(base64Data);
      const compressed = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        compressed[i] = binary.charCodeAt(i);
      }

      const inputStream = new ReadableStream({
        start(controller) {
          controller.enqueue(compressed);
          controller.close();
        },
      });

      const decompressedStream = inputStream.pipeThrough(new DecompressionStream("gzip"));
      const decoder = new TextDecoder();
      const reader = decompressedStream.getReader();
      let result = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
      }

      return JSON.parse(result);
    } catch (e) {
      console.error("Decompression failed:", e);
      return null;
    }
  }

  return { isSupported, compress, decompress };
})();

// --- File System Access API (Phase 3) ---
// Export/import saved stories functionality
const StoriesExport = (function () {
  const STORAGE_KEY = "nfhn-saved-stories";

  function getSavedStories() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveStories(stories) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
      return true;
    } catch {
      return false;
    }
  }

  // Fallback download for browsers without File System Access API
  function fallbackDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Export saved stories as JSON
  async function exportAsJSON() {
    const savedStories = getSavedStories();
    const storiesArray = Object.entries(savedStories).map(function ([id, data]) {
      return { id: id, ...data };
    });

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: "nfhn",
      totalStories: storiesArray.length,
      stories: storiesArray,
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const filename = "nfhn-saved-stories-" + Date.now() + ".json";

    // Check for File System Access API
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: "JSON Files",
              accept: { "application/json": [".json"] },
            },
          ],
        });

        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { success: true, message: "Stories exported successfully" };
      } catch (err) {
        if (err.name === "AbortError") {
          return { success: false, message: "Export cancelled" };
        }
        throw err;
      }
    } else {
      fallbackDownload(blob, filename);
      return { success: true, message: "Stories downloaded" };
    }
  }

  // Export as self-contained HTML archive
  async function exportAsHTML() {
    const savedStories = getSavedStories();
    const storiesArray = Object.entries(savedStories);

    const htmlContent =
      '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>NFHN Saved Stories Archive</title>\n  <style>\n    :root { --bg: #f5f5f5; --text: #1f2937; --border: rgba(0,0,0,0.1); --accent: #ff6600; }\n    @media (prefers-color-scheme: dark) {\n      :root { --bg: #0d1117; --text: #c9d1d9; --border: rgba(255,255,255,0.1); }\n    }\n    body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }\n    h1 { border-bottom: 2px solid var(--accent); padding-bottom: 0.5rem; }\n    .story { padding: 1rem; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 1rem; }\n    .story-title { font-size: 1.1rem; margin: 0 0 0.5rem; }\n    .story-meta { font-size: 0.85rem; opacity: 0.7; }\n    a { color: var(--accent); }\n  </style>\n</head>\n<body>\n  <h1>NFHN Saved Stories</h1>\n  <p>Exported on ' +
      new Date().toLocaleString() +
      "</p>\n  <p>Total stories: " +
      storiesArray.length +
      "</p>\n" +
      storiesArray
        .map(function ([id, story]) {
          const title = story.title || "Untitled";
          const url = story.url || "https://news.ycombinator.com/item?id=" + id;
          const domain = story.domain || "news.ycombinator.com";
          const points = story.points || 0;
          return (
            '  <article class="story">\n    <h2 class="story-title"><a href="' +
            url +
            '" target="_blank" rel="noopener">' +
            escapeHtml(title) +
            '</a></h2>\n    <p class="story-meta">' +
            points +
            " points · " +
            domain +
            ' · <a href="https://news.ycombinator.com/item?id=' +
            id +
            '" target="_blank">HN Discussion</a></p>\n  </article>'
          );
        })
        .join("\n") +
      "\n</body>\n</html>";

    const blob = new Blob([htmlContent], { type: "text/html" });
    const filename = "nfhn-saved-stories-" + Date.now() + ".html";

    if ("showSaveFilePicker" in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: "HTML Files",
              accept: { "text/html": [".html"] },
            },
          ],
        });

        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { success: true, message: "Archive exported successfully" };
      } catch (err) {
        if (err.name === "AbortError") {
          return { success: false, message: "Export cancelled" };
        }
        throw err;
      }
    } else {
      fallbackDownload(blob, filename);
      return { success: true, message: "Archive downloaded" };
    }
  }

  // Import stories from JSON file
  async function importFromJSON() {
    // Check for File System Access API
    if ("showOpenFilePicker" in window) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [
            {
              description: "JSON Files",
              accept: { "application/json": [".json"] },
            },
          ],
          multiple: false,
        });

        const file = await handle.getFile();
        const text = await file.text();
        return processImport(text);
      } catch (err) {
        if (err.name === "AbortError") {
          return { success: false, message: "Import cancelled" };
        }
        throw err;
      }
    } else {
      // Fallback: use file input
      return new Promise(function (resolve) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.onchange = async function (e) {
          const file = e.target.files[0];
          if (!file) {
            resolve({ success: false, message: "No file selected" });
            return;
          }
          const text = await file.text();
          resolve(processImport(text));
        };
        input.click();
      });
    }
  }

  function processImport(jsonText) {
    try {
      const data = JSON.parse(jsonText);

      if (!data.stories || !Array.isArray(data.stories)) {
        return { success: false, message: "Invalid file format" };
      }

      const currentStories = getSavedStories();
      let imported = 0;
      let skipped = 0;

      data.stories.forEach(function (story) {
        const id = story.id || story.storyId;
        if (!id) return;

        if (currentStories[id]) {
          skipped++;
        } else {
          currentStories[id] = {
            id: parseInt(id, 10),
            title: story.title || "Untitled",
            url: story.url || null,
            domain: story.domain || null,
            type: story.type || "link",
            points: story.points || 0,
            user: story.user || null,
            time: story.time || 0,
            time_ago: story.time_ago || "",
            comments_count: story.comments_count || 0,
            saved_at: story.saved_at || Date.now(),
          };
          imported++;
        }
      });

      saveStories(currentStories);
      // Imported threads join the badge on the same terms as saved ones: read
      // now, counted when they grow.
      SavedIndex.publish(currentStories);

      return {
        success: true,
        message: "Imported " + imported + " stories" +
          (skipped > 0 ? " (" + skipped + " already existed)" : ""),
        imported: imported,
        skipped: skipped,
      };
    } catch (e) {
      return { success: false, message: "Failed to parse file: " + e.message };
    }
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  return {
    exportAsJSON: exportAsJSON,
    exportAsHTML: exportAsHTML,
    importFromJSON: importFromJSON,
    isFileSystemAccessSupported: "showSaveFilePicker" in window,
  };
})();

// --- Document Picture-in-Picture API (Phase 3) ---
// Floating reader mode for reading articles while browsing
const ReaderPiP = (function () {
  const isSupported = "documentPictureInPicture" in window;

  async function openInPiP(articleUrl, articleTitle) {
    // Fallback: open in new tab
    if (!isSupported) {
      window.open("/reader/" + articleUrl, "_blank");
      return { success: false, reason: "not-supported" };
    }

    try {
      // Open PiP window
      const pipWindow = await documentPictureInPicture.requestWindow({
        width: 420,
        height: 650,
      });

      // Get current theme
      const currentTheme = document.documentElement.getAttribute("data-theme") || "auto";

      // Add styles to PiP window
      const pipStyles = document.createElement("style");
      pipStyles.textContent = getPiPStyles();
      pipWindow.document.head.appendChild(pipStyles);

      // Apply theme
      pipWindow.document.documentElement.setAttribute("data-theme", currentTheme);

      // Create loading state
      pipWindow.document.body.innerHTML = '<div class="pip-container">' +
        '<header class="pip-header">' +
        '<h1 class="pip-title">' +
        escapeHtml(articleTitle) +
        "</h1>" +
        '<button class="pip-close" onclick="window.close()" aria-label="Close">×</button>' +
        "</header>" +
        '<main class="pip-content">' +
        '<div class="pip-loading">Loading article...</div>' +
        "</main>" +
        "</div>";

      // Fetch article content
      const response = await fetch("/reader/" + articleUrl);
      const html = await response.text();

      // Parse and extract article content
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const articleContent = doc.querySelector("#article, main, article, .reader-content");

      if (articleContent) {
        pipWindow.document.querySelector(".pip-content").innerHTML = articleContent.innerHTML;
      } else {
        pipWindow.document.querySelector(".pip-content").innerHTML =
          '<p>Unable to load article content. <a href="/reader/' +
          articleUrl +
          '" target="_blank">Open in new tab</a></p>';
      }

      return { success: true };
    } catch (error) {
      console.error("Failed to open PiP:", error);
      // Fallback to new tab
      window.open("/reader/" + articleUrl, "_blank");
      return { success: false, reason: "error", error: error };
    }
  }

  function getPiPStyles() {
    return (
      ":root, :root[data-theme='light'] { --pip-bg: #f5f5f5; --pip-bg-elevated: #fff; --pip-text: #1f2937; --pip-text-muted: #6b7280; --pip-border: rgba(0,0,0,0.1); --pip-link: #2563eb; }\n" +
      ":root[data-theme='dark'] { --pip-bg: #0d1117; --pip-bg-elevated: #161b22; --pip-text: #c9d1d9; --pip-text-muted: #8b949e; --pip-border: rgba(255,255,255,0.1); --pip-link: #58a6ff; }\n" +
      "@media (prefers-color-scheme: dark) { :root[data-theme='auto'] { --pip-bg: #0d1117; --pip-bg-elevated: #161b22; --pip-text: #c9d1d9; --pip-text-muted: #8b949e; --pip-border: rgba(255,255,255,0.1); --pip-link: #58a6ff; } }\n" +
      "* { box-sizing: border-box; }\n" +
      "body { margin: 0; font-family: system-ui, sans-serif; background: var(--pip-bg); color: var(--pip-text); line-height: 1.6; }\n" +
      ".pip-container { height: 100vh; display: flex; flex-direction: column; }\n" +
      ".pip-header { position: sticky; top: 0; background: var(--pip-bg-elevated); padding: 0.75rem 1rem; border-bottom: 1px solid var(--pip-border); display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; z-index: 10; }\n" +
      ".pip-title { font-size: 0.9rem; font-weight: 600; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }\n" +
      ".pip-close { background: none; border: 1px solid var(--pip-border); border-radius: 4px; padding: 0.25rem 0.5rem; cursor: pointer; color: var(--pip-text-muted); font-size: 1.2rem; line-height: 1; }\n" +
      ".pip-close:hover { background: var(--pip-border); }\n" +
      ".pip-content { flex: 1; overflow-y: auto; padding: 1rem; font-size: 1rem; }\n" +
      ".pip-content img { max-width: 100%; height: auto; border-radius: 4px; }\n" +
      ".pip-content a { color: var(--pip-link); }\n" +
      ".pip-content pre { background: var(--pip-bg-elevated); padding: 1rem; border-radius: 6px; overflow-x: auto; border: 1px solid var(--pip-border); }\n" +
      ".pip-content code { background: var(--pip-bg-elevated); padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.9em; }\n" +
      ".pip-content pre code { background: none; padding: 0; }\n" +
      ".pip-content blockquote { margin: 1rem 0; padding: 0 1rem; border-left: 3px solid var(--pip-border); color: var(--pip-text-muted); }\n" +
      ".pip-loading { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--pip-text-muted); }"
    );
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize PiP button handlers
  function init() {
    if (!isSupported) {
      // Add class to hide PiP buttons
      document.documentElement.classList.add("no-pip");
      return;
    }

    document.documentElement.classList.add("can-pip");

    // Handle PiP button clicks
    document.addEventListener("click", function (e) {
      const btn = e.target.closest(".pip-reader-btn");
      if (!btn) return;

      e.preventDefault();
      const url = btn.dataset.url;
      const title = btn.dataset.title || "Article";

      openInPiP(url, title);
    });
  }

  return {
    isSupported: isSupported,
    openInPiP: openInPiP,
    init: init,
  };
})();

// Initialize Document PiP
ReaderPiP.init();

// Expose export functions globally for UI buttons
window.NFHN = window.NFHN || {};
window.NFHN.exportStoriesJSON = StoriesExport.exportAsJSON;
window.NFHN.exportStoriesHTML = StoriesExport.exportAsHTML;
window.NFHN.importStories = StoriesExport.importFromJSON;
window.NFHN.openReaderPiP = ReaderPiP.openInPiP;

// --- Initialize Saved Page Export/Import Buttons ---
(function initSavedPageButtons() {
  const exportBtn = document.getElementById("export-stories-btn");
  const importBtn = document.getElementById("import-stories-btn");
  const exportHtmlBtn = document.getElementById("export-html-btn");

  if (!exportBtn && !importBtn && !exportHtmlBtn) return;

  // Show toast notification
  function showToast(message, isError) {
    const existingToast = document.querySelector(".toast-notification");
    if (existingToast) existingToast.remove();

    const toast = document.createElement("div");
    toast.className = "toast-notification" + (isError ? " toast-error" : "");
    toast.textContent = message;
    toast.setAttribute("role", "alert");
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(function () {
      toast.classList.add("toast-visible");
    });

    // Remove after delay
    setTimeout(function () {
      toast.classList.remove("toast-visible");
      setTimeout(function () {
        toast.remove();
      }, 300);
    }, 3000);
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", async function () {
      exportBtn.disabled = true;
      try {
        const result = await StoriesExport.exportAsJSON();
        showToast(result.message, !result.success);
      } catch (err) {
        showToast("Export failed: " + err.message, true);
      } finally {
        exportBtn.disabled = false;
      }
    });
  }

  if (importBtn) {
    importBtn.addEventListener("click", async function () {
      importBtn.disabled = true;
      try {
        const result = await StoriesExport.importFromJSON();
        showToast(result.message, !result.success);
        if (result.success && result.imported > 0) {
          // Reload the saved stories list
          setTimeout(function () {
            location.reload();
          }, 1500);
        }
      } catch (err) {
        showToast("Import failed: " + err.message, true);
      } finally {
        importBtn.disabled = false;
      }
    });
  }

  if (exportHtmlBtn) {
    exportHtmlBtn.addEventListener("click", async function () {
      exportHtmlBtn.disabled = true;
      try {
        const result = await StoriesExport.exportAsHTML();
        showToast(result.message, !result.success);
      } catch (err) {
        showToast("Export failed: " + err.message, true);
      } finally {
        exportHtmlBtn.disabled = false;
      }
    });
  }
})();
