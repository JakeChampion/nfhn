// app_test.ts - Tests that run the real browser code out of static/app.js.
//
// See tests/dom-shim.ts for why these execute the shipped source rather than a
// copy of its logic.

import { assert, assertEquals, assertStringIncludes } from "std/testing/asserts.ts";
import { type El, el, FakeWindow, moduleSource, runModule } from "./dom-shim.ts";
import { home } from "../netlify/edge-functions/lib/render.ts";
import { htmlToString } from "../netlify/edge-functions/lib/html.ts";

const FOCUS_MODULE = "Returning to where you were";

/** A feed page: three stories and a pager, as render/components.ts emits them. */
const feedPage = () =>
  el(
    "body",
    {},
    el(
      "ol",
      { class: "stories" },
      ...[11, 22, 33].map((id) =>
        el(
          "li",
          { "data-story-id": String(id) },
          el(
            "a",
            { class: "title", href: `https://example.com/${id}` },
            el("span", { class: "story-title-text" }),
          ),
          el("a", { class: "comments", href: `/item/${id}` }),
        )
      ),
    ),
    el("a", { class: "more-link", href: "/top/2" }),
  );

const linkIn = (page: El, storyId: number, className: string): El => {
  const link = page
    .querySelector(`li[data-story-id="${storyId}"]`)!
    .querySelector(`a.${className}`);
  assert(link, `fixture is missing a.${className} for story ${storyId}`);
  return link;
};

/** Leave `page` by clicking `link`, then come back to `pathname` as `page2`. */
async function roundTrip(
  { from, link, back, via = "traverse" }: {
    from: string;
    link: (page: El) => El;
    back: string;
    via?: string;
  },
): Promise<El> {
  const departing = new FakeWindow(from, feedPage());
  await runModule(FOCUS_MODULE, departing);
  // Clicking the inner span, not the anchor - that is what a real click gives
  // you, and the module has to walk up to find the link.
  const clicked = link(departing.root);
  departing.dispatch({ type: "click", target: clicked.querySelector("span") ?? clicked });

  const arriving = new FakeWindow(back, feedPage());
  arriving.storage.set(
    "nfhn:left-from",
    departing.storage.get("nfhn:left-from") ?? "",
  );
  if (!departing.storage.has("nfhn:left-from")) arriving.storage.delete("nfhn:left-from");
  arriving.navigationType = via;

  await runModule(FOCUS_MODULE, arriving);
  arriving.dispatch({ type: "pagereveal" });
  return arriving.root;
}

const focusedIn = (page: El): El | null => {
  const search = (node: El): El | null => {
    if (node.focused) return node;
    for (const child of node.children) {
      const found = search(child);
      if (found) return found;
    }
    return null;
  };
  return search(page);
};

Deno.test("going back to a feed restores focus to the story you left from", async () => {
  const page = await roundTrip({
    from: "/top/1",
    link: (root) => linkIn(root, 22, "comments"),
    back: "/top/1",
  });

  const focused = focusedIn(page);
  assert(focused, "expected focus to be restored");
  assertEquals(focused.closest("li")?.dataset.storyId, "22");
  // The title and the comments link sit in one row; coming back to the other
  // one of the two is its own small annoyance.
  assertEquals(focused.classList.contains("comments"), true);
  // The browser has already restored scroll, and more accurately than anything
  // derived from an element.
  assertEquals(focused.focusOptions, { preventScroll: true });
});

Deno.test("paging back leaves you on the pager, not the top of the list", async () => {
  const page = await roundTrip({
    from: "/top/1",
    link: (root) => root.querySelector("a.more-link")!,
    back: "/top/1",
  });

  assertEquals(focusedIn(page)?.classList.contains("more-link"), true);
});

Deno.test("a forward navigation to the same page is a fresh visit", async () => {
  // Same recorded departure, but arrived at by typing the URL or following a
  // link. Restoring focus there would move it somewhere the reader never was.
  const page = await roundTrip({
    from: "/top/1",
    link: (root) => linkIn(root, 11, "title"),
    back: "/top/1",
    via: "push",
  });

  assertEquals(focusedIn(page), null);
});

Deno.test("focus is not restored onto a different page", async () => {
  const page = await roundTrip({
    from: "/top/1",
    link: (root) => linkIn(root, 33, "title"),
    back: "/newest/1",
  });

  assertEquals(focusedIn(page), null);
});

Deno.test("leaving by an unrelated link clears the record", async () => {
  // Otherwise Back lands you on a story you clicked several navigations ago.
  const departing = new FakeWindow("/top/1", feedPage());
  await runModule(FOCUS_MODULE, departing);

  departing.dispatch({ type: "click", target: linkIn(departing.root, 11, "title") });
  assert(departing.storage.has("nfhn:left-from"));

  const nav = el("a", { class: "nav-feed", href: "/newest/1" });
  el("nav", {}, nav);
  departing.dispatch({ type: "click", target: nav });
  assertEquals(departing.storage.has("nfhn:left-from"), false);
});

Deno.test("a middle-click opens a tab without moving where you left from", async () => {
  const departing = new FakeWindow("/top/1", feedPage());
  await runModule(FOCUS_MODULE, departing);

  departing.dispatch({ type: "click", target: linkIn(departing.root, 11, "title") });
  departing.dispatch({
    type: "auxclick",
    button: 2,
    target: linkIn(departing.root, 33, "title"),
  });

  const record = JSON.parse(departing.storage.get("nfhn:left-from")!);
  assertEquals(record.id, "11");
});

Deno.test("a story that is no longer on the page is not chased", async () => {
  // Feeds re-rank constantly; by the time you press Back the story may have
  // moved to page 2. Doing nothing is right - there is nowhere to go.
  const departing = new FakeWindow("/top/1", feedPage());
  await runModule(FOCUS_MODULE, departing);
  departing.dispatch({ type: "click", target: linkIn(departing.root, 22, "title") });

  const arriving = new FakeWindow("/top/1", el("body", {}, el("ol", { class: "stories" })));
  arriving.storage.set("nfhn:left-from", departing.storage.get("nfhn:left-from")!);
  arriving.navigationType = "traverse";

  await runModule(FOCUS_MODULE, arriving);
  arriving.dispatch({ type: "pagereveal" });
  assertEquals(focusedIn(arriving.root), null);
});

Deno.test("without pagereveal, pageshow restores instead - but never after bfcache", async () => {
  for (const persisted of [false, true]) {
    const departing = new FakeWindow("/top/1", feedPage());
    await runModule(FOCUS_MODULE, departing);
    departing.dispatch({ type: "click", target: linkIn(departing.root, 11, "title") });

    const arriving = new FakeWindow("/top/1", feedPage());
    arriving.storage.set("nfhn:left-from", departing.storage.get("nfhn:left-from")!);
    // No Navigation API either, so the Performance entry is the only signal.
    arriving.supportsPageReveal = false;
    arriving.performanceNavigationType = "back_forward";

    await runModule(FOCUS_MODULE, arriving);
    arriving.dispatch({ type: "pageshow", persisted });

    // bfcache restores the whole document including focus; stepping on that
    // would move focus away from wherever the reader actually was.
    assertEquals(
      focusedIn(arriving.root) !== null,
      !persisted,
      persisted ? "bfcache restore must be left alone" : "expected a restore",
    );
  }
});

Deno.test("a view transition finishes before focus moves", async () => {
  const departing = new FakeWindow("/top/1", feedPage());
  await runModule(FOCUS_MODULE, departing);
  departing.dispatch({ type: "click", target: linkIn(departing.root, 11, "title") });

  const arriving = new FakeWindow("/top/1", feedPage());
  arriving.storage.set("nfhn:left-from", departing.storage.get("nfhn:left-from")!);
  arriving.navigationType = "traverse";
  await runModule(FOCUS_MODULE, arriving);

  let settle: () => void;
  const finished = new Promise<void>((resolve) => (settle = resolve));
  arriving.dispatch({ type: "pagereveal", viewTransition: { finished } });

  // Focusing mid-animation scrolls the snapshot rather than the page.
  assertEquals(focusedIn(arriving.root), null, "focus moved during the transition");
  settle!();
  await finished;
  await Promise.resolve();
  assert(focusedIn(arriving.root), "focus should land once the transition ends");
});

Deno.test("the markup focus restoration looks for is the markup we render", async () => {
  // The module above is tested against a fixture. A fixture cannot notice
  // someone renaming `.more-link` in components.ts - the tests would keep
  // passing and the feature would quietly stop working, which is the failure
  // this codebase keeps rediscovering. So check the real renderer too.
  const markup = await htmlToString(
    home(
      [{
        id: 4242,
        title: "A story",
        points: 1,
        user: "someone",
        time: 1700000000,
        time_ago: "1 hour ago",
        content: "",
        type: "link",
        url: "https://example.com",
        domain: "example.com",
        comments: [],
        level: 0,
        comments_count: 3,
      }],
      1,
      "top",
    ),
  );

  const source = await moduleSource(FOCUS_MODULE);
  for (const selector of ['li[data-story-id="4242"]', 'class="title"', "comments", "more-link"]) {
    assertStringIncludes(markup, selector);
  }
  // And that the module is still looking for those, rather than having drifted
  // to something the renderer no longer emits.
  for (const selector of ["li[data-story-id]", "a.comments", "a.title", "a.more-link"]) {
    assertStringIncludes(source, selector);
  }
});
