// Text justification using tex-linebreak
// https://github.com/robertknight/tex-linebreak
(function () {
  "use strict";

  // Wait for both libraries to load
  var ready = false;

  function justify() {
    if (!window.texLineBreak_lib || !window["texLineBreak_hyphens_en-us"]) {
      return;
    }

    var lib = window.texLineBreak_lib;
    var hyphenate = lib.createHyphenator(window["texLineBreak_hyphens_en-us"]);

    // Target comment content paragraphs and article text content
    var paragraphs = Array.from(
      document.querySelectorAll("details > div p, article > p")
    );

    if (paragraphs.length > 0) {
      justifyInChunks(paragraphs, lib, hyphenate);
    }

    ready = true;
  }

  // TeX line-breaking a thousand-comment thread in one call is a single task
  // hundreds of milliseconds long, and nothing - scrolling, tapping, the
  // keyboard shortcuts - can happen while it runs. Chunking it and yielding
  // between chunks keeps the work but gives the main thread somewhere to
  // breathe.
  //
  // scheduler.yield() resumes at the *front* of the task queue, so unlike
  // setTimeout(0) the remaining chunks are not starved by whatever else is
  // pending. Falls back where it does not exist.
  var CHUNK_SIZE = 40;

  function yieldToMain() {
    if (typeof scheduler !== "undefined" && typeof scheduler.yield === "function") {
      return scheduler.yield();
    }
    return new Promise(function (resolve) {
      setTimeout(resolve, 0);
    });
  }

  async function justifyInChunks(paragraphs, lib, hyphenate) {
    for (var i = 0; i < paragraphs.length; i += CHUNK_SIZE) {
      var chunk = paragraphs.slice(i, i + CHUNK_SIZE);
      try {
        lib.justifyContent(chunk, hyphenate);
      } catch (err) {
        console.error("tex-linebreak justification error:", err);
        return;
      }
      if (i + CHUNK_SIZE < paragraphs.length) {
        await yieldToMain();
      }
    }
  }

  // Initial justification when libraries are loaded
  function init() {
    var checkInterval = setInterval(function () {
      if (window.texLineBreak_lib && window["texLineBreak_hyphens_en-us"]) {
        clearInterval(checkInterval);
        justify();
      }
    }, 50);

    // Timeout after 5 seconds
    setTimeout(function () {
      clearInterval(checkInterval);
    }, 5000);
  }

  // Re-justify on window resize (debounced)
  var resizeTimeout;
  window.addEventListener("resize", function () {
    if (!ready) return;
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(justify, 250);
  });

  // Re-justify after Turbo page loads
  document.addEventListener("turbo:load", function () {
    if (ready) {
      justify();
    } else {
      init();
    }
  });

  // Start on DOMContentLoaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
