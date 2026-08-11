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

  function pending(root) {
    var scope = root && root.querySelectorAll ? root : document;
    return Array.prototype.filter.call(
      scope.querySelectorAll(SELECTOR),
      function (p) {
        return p.dataset.justified !== "1" && isRendered(p);
      },
    );
  }

  async function justify(root) {
    if (!libraries()) return;

    var paragraphs = pending(root);
    for (var i = 0; i < paragraphs.length; i += CHUNK_SIZE) {
      var chunk = paragraphs.slice(i, i + CHUNK_SIZE);
      try {
        lib.justifyContent(chunk, hyphenate);
        chunk.forEach(function (p) {
          p.dataset.justified = "1";
        });
      } catch (err) {
        console.error("tex-linebreak justification error:", err);
        return;
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
