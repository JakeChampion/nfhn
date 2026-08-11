// Text justification using tex-linebreak
// https://github.com/robertknight/tex-linebreak
//
// Shared by the main site and by reader mode. Reader mode used to carry its own
// inline copy of this logic, which meant fixes landed in one place and not the
// other - and reader mode is where the longest articles are.
(function () {
  "use strict";

  // Paragraphs worth justifying: comment bodies and article text on the main
  // site, and the extracted article in reader mode (<main id="article">).
  var SELECTOR = "details > div p, article > p, #article p";

  // Number of paragraphs to justify before handing the main thread back.
  var CHUNK_SIZE = 40;

  var lib = null;
  var hyphenate = null;

  function libraries() {
    if (lib) return true;
    if (!window.texLineBreak_lib || !window["texLineBreak_hyphens_en-us"]) return false;
    lib = window.texLineBreak_lib;
    hyphenate = lib.createHyphenator(window["texLineBreak_hyphens_en-us"]);
    return true;
  }

  // scheduler.yield() resumes at the *front* of the task queue, so unlike
  // setTimeout(0) the remaining chunks are not starved behind whatever else is
  // pending. Falls back where it does not exist.
  function yieldToMain() {
    if (typeof scheduler !== "undefined" && typeof scheduler.yield === "function") {
      return scheduler.yield();
    }
    return new Promise(function (resolve) {
      setTimeout(resolve, 0);
    });
  }

  // A paragraph inside a `content-visibility: auto` subtree that the browser is
  // currently skipping has no layout, so measuring it produces nonsense line
  // breaks. getClientRects() is empty for exactly those elements (and for
  // display:none), which makes it the right filter.
  function isRendered(el) {
    return el.getClientRects().length > 0;
  }

  // A paragraph with no text has nothing to break. tex-linebreak walks to the
  // first text node to build a Range, so an empty <p> - which HN comment bodies
  // and story text both produce - reaches Range.setStart with undefined and
  // throws. Filtering here is cheaper than catching there.
  function hasText(el) {
    return (el.textContent || "").trim() !== "";
  }

  function pending(root) {
    var scope = root && root.querySelectorAll ? root : document;
    return Array.prototype.filter.call(
      scope.querySelectorAll(SELECTOR),
      function (p) {
        return p.dataset.justified !== "1" && hasText(p) && isRendered(p);
      },
    );
  }

  function markDone(paragraphs) {
    paragraphs.forEach(function (p) {
      p.dataset.justified = "1";
    });
  }

  // One paragraph at a time, so that whichever one tex-linebreak cannot handle
  // is the only one that loses out. Marked done either way: it will fail again
  // on the next pass, and retrying it forever costs the same as never trying.
  function justifyIndividually(chunk) {
    chunk.forEach(function (p) {
      try {
        lib.justifyContent([p], hyphenate);
      } catch (err) {
        console.warn("tex-linebreak skipped a paragraph:", err);
      }
      p.dataset.justified = "1";
    });
  }

  async function justify(root) {
    if (!libraries()) return;

    var paragraphs = pending(root);
    for (var i = 0; i < paragraphs.length; i += CHUNK_SIZE) {
      var chunk = paragraphs.slice(i, i + CHUNK_SIZE);
      try {
        lib.justifyContent(chunk, hyphenate);
        markDone(chunk);
      } catch (_err) {
        // This used to `return`, so a single paragraph tex-linebreak choked on
        // switched justification off for everything below it on the page -
        // which is what Firefox was doing, silently, on any thread containing
        // an empty <p>. Retry the chunk one at a time instead of giving up.
        justifyIndividually(chunk);
      }
      if (i + CHUNK_SIZE < paragraphs.length) {
        await yieldToMain();
      }
    }
  }

  // Re-justify everything: the measure changed, so previous results are stale.
  function rejustifyAll() {
    Array.prototype.forEach.call(document.querySelectorAll(SELECTOR), function (p) {
      delete p.dataset.justified;
    });
    justify();
  }

  // Comment subtrees are skipped by content-visibility until they approach the
  // viewport. This is the moment they gain layout and can be measured - before
  // it, justifying them is both wrong and wasted.
  function watchVisibility() {
    if (!("oncontentvisibilityautostatechange" in HTMLElement.prototype)) return;

    var containers = document.querySelectorAll(
      '[aria-label="Comments"] > details, [aria-label="Comments"] ul > li',
    );
    Array.prototype.forEach.call(containers, function (el) {
      el.addEventListener("contentvisibilityautostatechange", function (event) {
        if (!event.skipped) justify(el);
      });
    });
  }

  function start() {
    // The three scripts are deferred and load in order (library, hyphenation
    // data, this file), so by the time this runs the other two have executed.
    // No polling required.
    justify();
    watchVisibility();
  }

  var resizeTimeout;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(rejustifyAll, 250);
  });

  // Restored from bfcache: the DOM is intact, but the viewport may not be.
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) rejustifyAll();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
