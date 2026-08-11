// app_test.ts - Tests that run the real browser code out of static/app.js.
//
// See tests/dom-shim.ts for why these execute the shipped source rather than a
// copy of its logic.

import { assert, assertEquals, assertStringIncludes } from "std/testing/asserts.ts";
import {
  El,
  el,
  FakeCaches,
  FakeEventSource,
  FakeWindow,
  moduleSource,
  runModule,
  runModuleReturning,
} from "./dom-shim.ts";
import { home } from "../netlify/edge-functions/lib/render.ts";
import { liveUpdates, storyPreviewCard } from "../netlify/edge-functions/lib/render/components.ts";
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

// =============================================================================
// Story previews on hover
// =============================================================================

const PREVIEW_MODULE = "Story previews on hover";

/** A feed page with the preview card the renderer emits alongside it. */
const previewPage = () => {
  const page = feedPage();
  const card = el(
    "div",
    { id: "story-preview", popover: "hint", class: "story-preview", hidden: "" },
    el("p", { class: "story-preview-title" }),
    el("p", { class: "story-preview-excerpt" }),
    el("p", { class: "story-preview-meta" }),
  );
  card.parent = page;
  page.children.push(card);
  return page;
};

const cardIn = (page: El) => ({
  root: page.querySelector("#story-preview")!,
  title: page.querySelector(".story-preview-title")!,
  excerpt: page.querySelector(".story-preview-excerpt")!,
  meta: page.querySelector(".story-preview-meta")!,
});

const jsonResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
});

const SAMPLE = {
  id: 22,
  title: "A story worth reading",
  domain: "example.com",
  points: 1,
  user: "alice",
  time: 1700000000,
  comments: 4,
  excerpt: "One paragraph about the thing.",
  source: "story",
};

/** Let the module's fetch-then-fill chain settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

Deno.test("hovering a story fetches its preview and fills the card", async () => {
  const window = new FakeWindow("/top/1", previewPage());
  window.fetch = () => Promise.resolve(jsonResponse(SAMPLE));
  await runModule(PREVIEW_MODULE, window);

  const card = cardIn(window.root);
  // The renderer ships the card hidden so a browser without popover support
  // does not paint a stray box; the module unhides it once it knows better.
  assertEquals(card.root.hidden, false);

  const link = linkIn(window.root, 22, "title");
  // The browser only fires interest for elements carrying the attribute.
  assertEquals(link.getAttribute("interestfor"), "story-preview");

  card.root.dispatch({ type: "interest", source: link });
  // Something before the request lands, so the card does not open empty and
  // then jump to full height.
  assertEquals(card.meta.textContent, "Loading…");

  await settle();
  assertEquals(window.requests, ["/api/preview/22"]);
  assertEquals(card.title.textContent, SAMPLE.title);
  assertEquals(card.excerpt.textContent, SAMPLE.excerpt);
  assertEquals(card.excerpt.hidden, false);
  assertStringIncludes(card.meta.textContent, "by alice");
  assertStringIncludes(card.meta.textContent, "1 point");
});

Deno.test("a second hover on the same story does not hit the network again", async () => {
  const window = new FakeWindow("/top/1", previewPage());
  window.fetch = () => Promise.resolve(jsonResponse(SAMPLE));
  await runModule(PREVIEW_MODULE, window);

  const card = cardIn(window.root);
  const link = linkIn(window.root, 22, "title");

  card.root.dispatch({ type: "interest", source: link });
  await settle();
  card.root.dispatch({ type: "loseinterest" });
  card.root.dispatch({ type: "interest", source: link });

  // Straight from cache, so it is filled before any await - and no second
  // request behind the pointer on the way back up the page.
  assertEquals(card.excerpt.textContent, SAMPLE.excerpt);
  assertEquals(window.requests.length, 1);
});

Deno.test("moving on cancels the request nobody is waiting for", async () => {
  const window = new FakeWindow("/top/1", previewPage());
  let aborted = false;
  window.fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  await runModule(PREVIEW_MODULE, window);

  const card = cardIn(window.root);
  card.root.dispatch({ type: "interest", source: linkIn(window.root, 11, "title") });
  card.root.dispatch({ type: "loseinterest" });
  await settle();

  assertEquals(aborted, true);
});

Deno.test("a preview that arrives late does not overwrite the card in front of you", async () => {
  // Scanning a feed quickly means several of these can be in flight; the slow
  // one landing last must not repaint the row the reader has settled on.
  const window = new FakeWindow("/top/1", previewPage());
  const resolvers: ((value: unknown) => void)[] = [];
  window.fetch = () => new Promise((resolve) => resolvers.push(resolve));
  await runModule(PREVIEW_MODULE, window);

  const card = cardIn(window.root);
  card.root.dispatch({ type: "interest", source: linkIn(window.root, 11, "title") });
  card.root.dispatch({ type: "interest", source: linkIn(window.root, 33, "title") });

  resolvers[1]!(jsonResponse({ ...SAMPLE, id: 33, title: "Story thirty-three" }));
  await settle();
  resolvers[0]!(jsonResponse({ ...SAMPLE, id: 11, title: "Story eleven" }));
  await settle();

  assertEquals(card.title.textContent, "Story thirty-three");
});

Deno.test("a story with no excerpt shows the metadata and no empty paragraph", async () => {
  const window = new FakeWindow("/top/1", previewPage());
  window.fetch = () =>
    Promise.resolve(jsonResponse({ ...SAMPLE, excerpt: undefined, source: undefined }));
  await runModule(PREVIEW_MODULE, window);

  const card = cardIn(window.root);
  card.root.dispatch({ type: "interest", source: linkIn(window.root, 22, "title") });
  await settle();

  assertEquals(card.excerpt.hidden, true);
  assertEquals(card.excerpt.textContent, "");
  assertStringIncludes(card.meta.textContent, "by alice");
});

Deno.test("a failed request leaves a card rather than a spinner", async () => {
  const window = new FakeWindow("/top/1", previewPage());
  window.fetch = () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
  await runModule(PREVIEW_MODULE, window);

  const card = cardIn(window.root);
  card.root.dispatch({ type: "interest", source: linkIn(window.root, 22, "title") });
  await settle();

  // The title came off the row itself, so the card still says something true.
  assertEquals(card.meta.textContent, "");
  assertEquals(card.excerpt.hidden, true);
});

Deno.test("without interest invokers nothing is attached and nothing is unhidden", async () => {
  // The card is only useful if the browser will open it. Attaching interestfor
  // to links a browser ignores would be harmless; unhiding a card it will
  // never open would leave a stray box on the page.
  const window = new FakeWindow("/top/1", previewPage());
  window.supportsInterestInvokers = false;
  await runModule(PREVIEW_MODULE, window);

  assertEquals(cardIn(window.root).root.hidden, true);
  assertEquals(linkIn(window.root, 22, "title").getAttribute("interestfor"), null);
});

Deno.test("the card the renderer emits is the card the module expects", async () => {
  const markup = await htmlToString(storyPreviewCard());

  assertStringIncludes(markup, 'id="story-preview"');
  // popover="hint" specifically: it is the only type interest invokers drive.
  assertStringIncludes(markup, 'popover="hint"');
  // Rendered hidden, or a browser without popover paints it inline.
  assertStringIncludes(markup, "hidden");

  const source = await moduleSource(PREVIEW_MODULE);
  for (const part of ["story-preview-title", "story-preview-excerpt", "story-preview-meta"]) {
    assertStringIncludes(markup, part);
    assertStringIncludes(source, part);
  }
});

// =============================================================================
// Live thread updates
// =============================================================================

const LIVE_MODULE = "Live thread updates";

/** An item page carrying the banner the renderer emits. */
const itemPage = (id = 4242, comments = 10) =>
  el(
    "body",
    {},
    el("article", {}),
    el(
      "p",
      {
        class: "live-updates",
        id: "live-updates",
        "data-item-id": String(id),
        "data-comments": String(comments),
        role: "status",
        hidden: "",
      },
      el("a", { href: `/item/${id}`, class: "live-updates-link" }),
    ),
  );

const bannerIn = (page: El) => ({
  root: page.querySelector("#live-updates")!,
  link: page.querySelector(".live-updates-link")!,
});

async function liveWindow(options: Partial<FakeWindow> = {}): Promise<FakeWindow> {
  FakeEventSource.reset();
  const window = new FakeWindow("/item/4242", itemPage());
  Object.assign(window, options);
  await runModule(LIVE_MODULE, window);
  return window;
}

Deno.test("an item page subscribes, carrying the count it was rendered with", async () => {
  const window = await liveWindow();

  assertEquals(FakeEventSource.instances.length, 1);
  // `since` is what stops a reconnect re-announcing comments already on screen.
  assertEquals(FakeEventSource.instances[0]!.url, "/api/live/4242?since=10");
  assertEquals(bannerIn(window.root).root.hidden, true, "nothing to say yet");
});

Deno.test("new comments offer a refresh, counted against what is on screen", async () => {
  const window = await liveWindow();
  const banner = bannerIn(window.root);

  FakeEventSource.instances[0]!.emit("comments", { id: 4242, count: 13 });

  assertEquals(banner.root.hidden, false);
  // Three new, not thirteen: the page already shows ten.
  assertEquals(banner.link.textContent, "3 new comments · refresh");
});

Deno.test("the count the page already shows is not announced as new", async () => {
  const window = await liveWindow();
  const banner = bannerIn(window.root);

  // The first frame a stream sends is the current count, which for a page
  // served from a warm cache is usually the count it was rendered with.
  FakeEventSource.instances[0]!.emit("comments", { id: 4242, count: 10 });
  assertEquals(banner.root.hidden, true);

  FakeEventSource.instances[0]!.emit("comments", { id: 4242, count: 11 });
  assertEquals(banner.link.textContent, "1 new comment · refresh");
});

Deno.test("a malformed frame does not take the connection down", async () => {
  const window = await liveWindow();
  const source = FakeEventSource.instances[0]!;

  for (const listener of source.listeners.get("comments") ?? []) listener({ data: "not json" });
  source.emit("comments", { id: 4242, count: 12 });

  assertEquals(source.closed, false);
  assertEquals(bannerIn(window.root).link.textContent, "2 new comments · refresh");
});

Deno.test("hiding the tab closes the stream, and coming back opens a new one", async () => {
  const window = await liveWindow();
  const first = FakeEventSource.instances[0]!;

  window.visible = false;
  window.dispatchOnDocument({ type: "visibilitychange" });
  assertEquals(first.closed, true);
  assertEquals(FakeEventSource.instances.length, 1, "nothing reopened while hidden");

  window.visible = true;
  window.dispatchOnDocument({ type: "visibilitychange" });
  assertEquals(FakeEventSource.instances.length, 2);
});

Deno.test("navigating away closes the stream, so the page stays bfcache-eligible", async () => {
  // An open EventSource makes a page ineligible for the back/forward cache in
  // some browsers. Trading instant Back for a live comment count is a bad
  // trade, and one the bfcache reporting elsewhere in app.js would then have
  // to explain.
  const window = await liveWindow();
  const source = FakeEventSource.instances[0]!;

  window.dispatch({ type: "pagehide" });
  assertEquals(source.closed, true);

  // Restored from bfcache: the DOM is intact but the stream is not.
  window.dispatch({ type: "pageshow", persisted: true });
  assertEquals(FakeEventSource.instances.length, 2);
});

Deno.test("a rotated stream is not left as a dangling handle", async () => {
  // The server closes streams after a few minutes and EventSource reconnects
  // on its own; the module only has to keep its own handle in step.
  const window = await liveWindow();
  FakeEventSource.instances[0]!.emit("bye", { reason: "rotate" });

  window.dispatch({ type: "pageshow", persisted: false });
  assertEquals(FakeEventSource.instances.length, 2, "a new stream after a rotate");
});

Deno.test("a page with no banner subscribes to nothing", async () => {
  // Feed pages, the saved list, user profiles: there is no thread to watch.
  FakeEventSource.reset();
  const window = new FakeWindow("/top/1", feedPage());
  await runModule(LIVE_MODULE, window);

  assertEquals(FakeEventSource.instances.length, 0);
});

Deno.test("the banner the renderer emits is the banner the module drives", async () => {
  const markup = await htmlToString(liveUpdates(4242, 10));
  const source = await moduleSource(LIVE_MODULE);

  assertStringIncludes(markup, 'id="live-updates"');
  assertStringIncludes(markup, 'data-item-id="4242"');
  assertStringIncludes(markup, 'data-comments="10"');
  // Rendered hidden and announced politely - it appears while the reader is
  // mid-page, so it must not steal focus or interrupt.
  assertStringIncludes(markup, "hidden");
  assertStringIncludes(markup, 'role="status"');

  for (const hook of ["live-updates-link", "itemId", "comments"]) {
    assertStringIncludes(source, hook);
  }
});

// =============================================================================
// The saved index and the app badge
// =============================================================================

const INDEX_MODULE = "The saved list, where the service worker can read it";
const SAVED_CACHE = "nfhn-saved-v1";
const SAVED_INDEX = "/__nfhn/saved-index";

interface IndexEntry {
  seen: number;
  latest: number;
}

async function savedIndexModule(seed: Record<string, IndexEntry> = {}) {
  const caches = new FakeCaches();
  if (Object.keys(seed).length) {
    const cache = await caches.open(SAVED_CACHE);
    await cache.put(SAVED_INDEX, new Response(JSON.stringify(seed)));
  }

  const badge: { value: number | null } = { value: null };
  const api = await runModuleReturning(INDEX_MODULE, "app.js", {
    caches,
    Response,
    JSON,
    Math,
    Object,
    globalThis: { caches },
    navigator: {
      setAppBadge: (n: number) => {
        badge.value = n;
        return Promise.resolve();
      },
      clearAppBadge: () => {
        badge.value = 0;
        return Promise.resolve();
      },
    },
  }, ["SavedIndex"]) as unknown as {
    SavedIndex: {
      publish(stories: unknown): Promise<void>;
      markSeen(id: string, count: number): Promise<void>;
    };
  };

  return {
    badge,
    publish: api.SavedIndex.publish,
    markSeen: api.SavedIndex.markSeen,
    // Read the stored bytes rather than asking the module what it thinks it
    // wrote - the service worker reads these bytes, not the module.
    read: async (): Promise<Record<string, IndexEntry>> => {
      const stored = await (await caches.open(SAVED_CACHE)).match(SAVED_INDEX);
      return stored ? await stored.json() : {};
    },
  };
}

const story = (id: number, comments: number) => ({ id, comments_count: comments });

Deno.test("a newly saved story starts read - the reader is looking at it", async () => {
  const module = await savedIndexModule();
  await module.publish({ "5": story(5, 12) });

  assertEquals(await module.read(), { "5": { seen: 12, latest: 12 } });
  assertEquals(module.badge.value, 0, "nothing unread yet");
});

Deno.test("republishing preserves read state rather than resetting it", async () => {
  // Saving a second story must not silently mark the first one read - which is
  // what rebuilding the index from localStorage alone would do, since
  // localStorage only knows the count at save time.
  const module = await savedIndexModule({ "5": { seen: 12, latest: 30 } });
  await module.publish({ "5": story(5, 12), "6": story(6, 1) });

  assertEquals((await module.read())["5"], { seen: 12, latest: 30 });
  assertEquals(module.badge.value, 1);
});

Deno.test("unsaving a story drops it from the badge", async () => {
  const module = await savedIndexModule({
    "5": { seen: 1, latest: 9 },
    "6": { seen: 1, latest: 9 },
  });
  await module.publish({ "6": story(6, 1) });

  assertEquals(Object.keys(await module.read()), ["6"]);
  assertEquals(module.badge.value, 1);
});

Deno.test("opening a thread marks it read and updates the badge immediately", async () => {
  // Not on the next background refresh: the badge has to respond to the thing
  // the reader just did, or it reads as broken.
  const module = await savedIndexModule({
    "5": { seen: 1, latest: 9 },
    "6": { seen: 1, latest: 4 },
  });

  await module.markSeen("5", 9);
  assertEquals((await module.read())["5"], { seen: 9, latest: 9 });
  assertEquals(module.badge.value, 1, "only story 6 is still unread");

  await module.markSeen("6", 4);
  assertEquals(module.badge.value, 0);
});

Deno.test("opening a thread that is not saved records nothing", async () => {
  const module = await savedIndexModule({ "5": { seen: 1, latest: 9 } });
  await module.markSeen("999", 40);

  assertEquals(Object.keys(await module.read()), ["5"]);
});

Deno.test("a thread read while it was still growing keeps the higher count", async () => {
  // The page was rendered from cache at 3 comments; the last refresh saw 9.
  // Marking it read at 3 must not lose the 9, or the badge reappears saying
  // there are new comments the reader has in fact already been offered.
  const module = await savedIndexModule({ "5": { seen: 1, latest: 9 } });
  await module.markSeen("5", 3);

  assertEquals((await module.read())["5"], { seen: 3, latest: 9 });
});

// =============================================================================
// Justification survives a paragraph tex-linebreak cannot handle
// =============================================================================

/**
 * Run static/justify.js against a tiny stub of the tex-linebreak library.
 *
 * The whole file is one IIFE, so it runs as-is rather than by heading. What is
 * under test is the error handling around the library, not the library.
 */
async function runJustify(
  paragraphs: { text: string; rendered?: boolean }[],
  failsOn: (text: string) => boolean,
) {
  const source = await Deno.readTextFile(new URL("../static/justify.js", import.meta.url));

  const elements = paragraphs.map(({ text, rendered = true }) => {
    const node = el("p", {});
    node.textContent = text;
    // content-visibility skipping is what getClientRects() detects.
    (node as unknown as { getClientRects(): unknown[] }).getClientRects = () =>
      rendered ? [{}] : [];
    return node;
  });
  const root = el("article", {}, ...elements);

  const justified: string[] = [];
  const lib = {
    createHyphenator: () => () => [],
    justifyContent: (chunk: El[]) => {
      for (const p of chunk) {
        if (failsOn(p.textContent)) {
          throw new TypeError("Range.setStart: Argument 1 is not an object");
        }
      }
      for (const p of chunk) justified.push(p.textContent);
    },
  };

  const window = new FakeWindow("/item/1", root);
  const globals: Record<string, unknown> = {
    ...window.globals(),
    window: {
      texLineBreak_lib: lib,
      "texLineBreak_hyphens_en-us": {},
      addEventListener: () => {},
    },
    HTMLElement: { prototype: {} },
    console: { error: () => {}, warn: () => {} },
    Array,
    Promise,
    setTimeout,
    clearTimeout,
  };
  (globals.document as Record<string, unknown>).readyState = "complete";

  const names = Object.keys(globals);
  new Function(...names, source)(...names.map((name) => globals[name]));
  // justify() is async and yields between chunks.
  await new Promise((resolve) => setTimeout(resolve, 0));

  return { justified, elements };
}

Deno.test("an empty paragraph is never handed to tex-linebreak", async () => {
  // tex-linebreak walks to the first text node to build a Range, so an empty
  // <p> - which HN comment bodies and story text both produce - reaches
  // Range.setStart with undefined and throws.
  const { justified } = await runJustify(
    [{ text: "First." }, { text: "   " }, { text: "Third." }],
    () => false,
  );

  assertEquals(justified, ["First.", "Third."]);
});

Deno.test("a paragraph tex-linebreak chokes on does not take the page with it", async () => {
  // This used to `return`, so one bad paragraph switched justification off for
  // everything below it - which is what Firefox was doing on any thread
  // containing one. Chrome happened not to throw, so it looked fine there.
  const { justified, elements } = await runJustify(
    [{ text: "One." }, { text: "poison" }, { text: "Three." }, { text: "Four." }],
    (text) => text === "poison",
  );

  assertEquals(justified.includes("Three."), true, "the rest of the page still justifies");
  assertEquals(justified.includes("Four."), true);
  assertEquals(justified.includes("poison"), false);
  // Marked done anyway: it will fail again next pass, and retrying forever
  // costs the same as never trying.
  assertEquals(elements.every((p) => p.dataset.justified === "1"), true);
});

Deno.test("paragraphs with no layout are left for when they gain it", async () => {
  // A comment subtree still skipped by content-visibility has no layout, so
  // measuring it produces nonsense line breaks.
  const { justified } = await runJustify(
    [{ text: "Visible." }, { text: "Skipped.", rendered: false }],
    () => false,
  );

  assertEquals(justified, ["Visible."]);
});

// =============================================================================
// The saved list, built as nodes
// =============================================================================
//
// This used to be a string of concatenated markup assigned to innerHTML, which is
// the sink Trusted Types blocks and the reason `require-trusted-types-for` had to
// ship report-only. It builds DOM nodes now, and `trusted-types 'none'` is
// enforced - so this code has to work, and until now none of it was tested.

const BOOKMARKS_MODULE = "Favorites/Bookmarks";

interface SavedStory {
  id: number;
  title: string;
  type: string;
  url?: string | null;
  domain?: string | null;
  comments_count?: number;
  saved_at?: number;
}

async function renderSavedList(stories: SavedStory[]): Promise<El> {
  const container = el("div", { id: "saved-stories-container" });
  const root = el("body", {}, container);
  const stored: Record<string, SavedStory> = {};
  for (const story of stories) stored[String(story.id)] = story;

  const document = {
    getElementById: (id: string) => root.querySelector(`[id="${id}"]`),
    querySelectorAll: (selector: string) => root.querySelectorAll(selector),
    createElement: (tag: string) => new El(tag),
    createElementNS: (namespace: string, tag: string) => {
      const node = new El(tag);
      node.namespace = namespace;
      return node;
    },
  };

  await runModuleReturning(BOOKMARKS_MODULE, "app.js", {
    document,
    localStorage: {
      getItem: () => JSON.stringify(stored),
      setItem: () => {},
    },
    // The list render is all this test drives; the storage, sync and background
    // fetch paths this module also sets up have their own tests.
    navigator: {},
    SavedIndex: { publish: () => {}, markSeen: () => {} },
    console,
    JSON,
    Object,
    Date,
    parseInt,
    Number,
  }, []);

  return container;
}

Deno.test("the saved list renders one row per story, as nodes", async () => {
  const container = await renderSavedList([
    {
      id: 1,
      title: "First story",
      type: "link",
      url: "https://example.com/one",
      domain: "example.com",
      comments_count: 4,
      saved_at: 200,
    },
    { id: 2, title: "An Ask HN", type: "ask", comments_count: 0, saved_at: 100 },
  ]);

  assertEquals(container.querySelector(".saved-count")?.textContent, "2 saved stories");

  const rows = container.querySelectorAll("li");
  assertEquals(rows.length, 2);
  // Newest first.
  assertEquals(rows[0]?.dataset.storyId, "1");
  assertEquals(rows[1]?.dataset.storyId, "2");

  assertEquals(rows[0]?.querySelector(".story-title-text")?.textContent, "First story");
  assertEquals(rows[0]?.querySelector(".story-meta")?.textContent, "(example.com)");
  assertEquals(rows[0]?.querySelector("a.title")?.getAttribute("href"), "https://example.com/one");
  assertEquals(rows[0]?.querySelector("a.comments")?.textContent, "view 4 comments");

  // An Ask HN gets its badge and links to the discussion, and with no comments
  // the link says so rather than reading "view 0 comments".
  assertEquals(rows[1]?.querySelector(".badge")?.textContent, "Ask HN");
  assertEquals(rows[1]?.querySelector("a.title")?.getAttribute("href"), "/item/2");
  assertEquals(rows[1]?.querySelector("a.comments")?.textContent, "view discussion");

  // The remove button is what the module attaches its click handler to.
  const button = rows[0]?.querySelector(".bookmark-btn");
  assertEquals(button?.getAttribute("aria-pressed"), "true");
  assertEquals(button?.dataset.storyId, "1");

  // SVG needs createElementNS: an <svg> built with createElement lands in the
  // XHTML namespace and renders as nothing at all.
  const icon = button?.querySelector("svg");
  assertEquals(icon?.namespace, "http://www.w3.org/2000/svg");
  assert(icon?.querySelector("path")?.getAttribute("d")?.startsWith("M17 3H7"));
});

Deno.test("a story title is text, not markup", async () => {
  // The old version escaped this by hand before concatenating it into innerHTML.
  // A node cannot be escaped wrongly: the title is text, and the only way to read
  // it back is as text.
  const container = await renderSavedList([
    {
      id: 7,
      title: '<img src=x onerror="alert(1)">',
      type: "link",
      url: 'javascript:alert("no")',
      comments_count: 0,
    },
  ]);

  const title = container.querySelector(".story-title-text");
  assertEquals(title?.textContent, '<img src=x onerror="alert(1)">');
  assertEquals(title?.querySelectorAll("img").length, 0);
  // The href is set as an attribute value, so it is never parsed as markup - and a
  // javascript: URL in a saved story's own url field is not something this list
  // invents, it is whatever HN had.
  assertEquals(container.querySelector("a.title")?.getAttribute("href"), 'javascript:alert("no")');
});

Deno.test("an empty saved list says so", async () => {
  const container = await renderSavedList([]);
  assertEquals(container.querySelectorAll("li").length, 0);
  assertStringIncludes(
    container.querySelector(".empty-saved")?.textContent ?? "",
    "No saved stories yet.",
  );
});

// =============================================================================
// What a third-party article may bring into the PiP window
// =============================================================================

const PIP_MODULE = "Document Picture-in-Picture API (Phase 3)";

async function pipModule() {
  // The section ends by calling init(), which tags <html> with whether PiP is
  // available. A classList that only records is enough for that.
  const classes: string[] = [];
  const api = await runModuleReturning(PIP_MODULE, "app.js", {
    window: {},
    document: {
      documentElement: { classList: { add: (name: string) => classes.push(name) } },
      addEventListener: () => {},
      createElement: (tag: string) => new El(tag),
    },
    // Not supported, so init() only adds the no-pip class and returns. The PiP
    // window cannot be opened from a test at all; the sanitiser is the part with
    // logic worth asserting on.
    documentPictureInPicture: undefined,
    fetch: () => Promise.reject(new Error("not used")),
    DOMParser: class {},
    // The section runs to the next heading, which is where app.js hangs the export
    // helpers off window.NFHN. Declared in a different section, stubbed here.
    StoriesExport: { exportAsJSON: () => {}, exportAsHTML: () => {}, importFromJSON: () => {} },
    console,
    Array,
    Set,
    Object,
  }, ["ReaderPiP"]) as unknown as {
    ReaderPiP: { adoptSanitized(doc: unknown, source: El): El[] };
  };

  const targetDoc = { importNode: (node: El, deep: boolean) => node.cloneNode(deep) };
  return (source: El): El[] => api.ReaderPiP.adoptSanitized(targetDoc, source);
}

Deno.test("adopting an article keeps its content and drops what runs", async () => {
  const adopt = await pipModule();

  const article = el(
    "article",
    {},
    el("p", {}, el("img", { src: "https://cdn.example.com/photo.jpg", alt: "A photo" })),
    el("script", { src: "https://tracker.example.com/t.js" }),
    el("iframe", { src: "https://ads.example.com/frame" }),
    el("a", { href: "https://example.com/next" }),
  );

  const adopted = adopt(article);
  const root = el("main", {}, ...adopted);

  // Reader mode without images and links is not reader mode.
  assertEquals(root.querySelector("img")?.getAttribute("src"), "https://cdn.example.com/photo.jpg");
  assertEquals(root.querySelector("a")?.getAttribute("href"), "https://example.com/next");

  // These load or execute, and the PiP document is same-origin with the page.
  assertEquals(root.querySelectorAll("script").length, 0);
  assertEquals(root.querySelectorAll("iframe").length, 0);
});

Deno.test("adopting an article strips handlers and script URLs", async () => {
  const adopt = await pipModule();

  const article = el(
    "article",
    {},
    // The one that mattered: innerHTML does not execute <script>, but it very much
    // fires onerror, and this is somebody else's HTML.
    el("img", { src: "x", onerror: "alert(1)" }),
    el("a", { href: "javascript:alert(1)" }),
    el("a", { href: "data:text/html,<script>alert(1)</script>" }),
    el("div", { onclick: "steal()", "data-keep": "yes" }),
    el("img", { src: "data:image/png;base64,iVBORw0KGgo=" }),
  );

  const root = el("main", {}, ...adopt(article));

  assertEquals(root.querySelector("img")?.getAttribute("onerror"), null);
  assertEquals(root.querySelectorAll("a")[0]?.getAttribute("href"), null);
  assertEquals(root.querySelectorAll("a")[1]?.getAttribute("href"), null);
  assertEquals(root.querySelector("div")?.getAttribute("onclick"), null);
  // Not everything with a colon is dangerous: a data: image is how plenty of
  // articles inline their figures, and it navigates nowhere.
  assertEquals(root.querySelector("div")?.getAttribute("data-keep"), "yes");
  assertEquals(
    root.querySelectorAll("img")[1]?.getAttribute("src"),
    "data:image/png;base64,iVBORw0KGgo=",
  );
});

Deno.test("adopting reaches all the way down, not just the top level", async () => {
  const adopt = await pipModule();

  const article = el(
    "article",
    {},
    el(
      "div",
      {},
      el("section", {}, el("img", { src: "x", onerror: "alert(1)" }), el("script", {})),
    ),
  );

  const root = el("main", {}, ...adopt(article));
  assertEquals(root.querySelectorAll("script").length, 0);
  assertEquals(root.querySelector("img")?.getAttribute("onerror"), null);
});

Deno.test("adopting copies rather than moving the parsed nodes", async () => {
  const adopt = await pipModule();

  const article = el("article", {}, el("p", { onclick: "x()" }));
  const adopted = adopt(article);

  // importNode, not appendChild: the source document keeps its own tree. If this
  // moved nodes instead, the fallback path that re-reads the parsed document would
  // find it emptied.
  assertEquals(article.querySelector("p")?.getAttribute("onclick"), "x()");
  assertEquals(adopted[0]?.getAttribute("onclick"), null);
});
