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
