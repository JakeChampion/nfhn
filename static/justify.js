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
      try {
        lib.justifyContent(paragraphs, hyphenate);
      } catch (err) {
        console.error("tex-linebreak justification error:", err);
      }
    }

    ready = true;
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
