// app.js - Main application scripts for NFHN

// --- Theme management ---
(function initTheme() {
  const root = document.documentElement;
  const stored = localStorage.getItem("theme") || "auto";
  root.setAttribute("data-theme", stored);

  const radios = document.querySelectorAll('input[name="theme"]');
  radios.forEach((radio) => {
    if (radio.value === stored) radio.checked = true;
    radio.addEventListener("change", (e) => {
      const theme = e.target.value;
      root.setAttribute("data-theme", theme);
      localStorage.setItem("theme", theme);
    });
  });
})();

// --- Service worker registration ---
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// --- External link handling ---
document.querySelectorAll('a[href^="http"]').forEach((link) => {
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

// --- Favorites/Bookmarks ---
(function initBookmarks() {
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
      notifyServiceWorker("CACHE_ITEM", id, externalUrl);
    }

    saveStories(stories);
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

  // --- Saved stories page rendering ---
  const container = document.getElementById("saved-stories-container");
  if (container) {
    const TYPE_META = {
      ask: { label: "Ask HN", badgeClass: "badge-ask", href: (item) => "/item/" + item.id },
      show: { label: "Show HN", badgeClass: "badge-show", href: (item) => "/item/" + item.id },
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

// --- Navigation API for View Transitions ---
(function initNavigationAPI() {
  // Use Navigation API if available for enhanced view transitions
  if (!("navigation" in window)) return;

  let lastDirection = null;

  navigation.addEventListener("navigate", function (e) {
    // Determine navigation direction for view transition animations
    const currentIndex = navigation.currentEntry?.index ?? 0;
    const destinationIndex = e.destination?.index ?? currentIndex;

    if (destinationIndex < currentIndex) {
      lastDirection = "backward";
    } else if (destinationIndex > currentIndex) {
      lastDirection = "forward";
    } else {
      lastDirection = null;
    }

    // Set direction as data attribute for CSS view transitions
    if (lastDirection) {
      document.documentElement.dataset.navDirection = lastDirection;
    } else {
      delete document.documentElement.dataset.navDirection;
    }
  });
})();
