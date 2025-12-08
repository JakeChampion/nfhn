import type { Config } from "@netlify/edge-functions";
import { contents } from "./handlers/icon.ts";

type Primitive = string | number | boolean | null | undefined;

const RAW_HTML_SYMBOL = Symbol("RawHTML");

export interface RawHTML {
  readonly [RAW_HTML_SYMBOL]: true;
  readonly __raw: string;
}

export const raw = (html: string): RawHTML => ({
  [RAW_HTML_SYMBOL]: true,
  __raw: html,
});

export const unsafeHTML = (htmlString: string): RawHTML => raw(htmlString);
export const dangerouslySetInnerHTML = unsafeHTML;

export interface HTML extends AsyncIterable<string> {}

export type HTMLValue =
  | Primitive
  | RawHTML
  | HTML
  | Promise<HTMLValue>
  | Iterable<HTMLValue>
  | AsyncIterable<HTMLValue>
  | (() => HTMLValue | Promise<HTMLValue>);

export const escape = (value: unknown): string => {
  if (value == null || value === false) return "";
  const str = String(value);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const isRawHTML = (v: unknown): v is RawHTML =>
  !!v && typeof v === "object" && (v as any)[RAW_HTML_SYMBOL] === true;

const isAsyncIterable = (v: unknown): v is AsyncIterable<unknown> =>
  !!v && typeof (v as any)[Symbol.asyncIterator] === "function";

const isIterable = (v: unknown): v is Iterable<unknown> =>
  !!v && typeof (v as any)[Symbol.iterator] === "function";

const isHTML = (v: unknown): v is HTML =>
  isAsyncIterable(v) && !isRawHTML(v);

// Reuse a single TextEncoder per edge instance
const sharedEncoder = new TextEncoder();

async function* flattenValue(value: HTMLValue): AsyncIterable<string> {
  if (value == null || value === false) return;

  if (typeof value === "function") {
    const result = value();
    yield* flattenValue(await result);
    return;
  }

  if (value instanceof Promise) {
    const result = await value;
    yield* flattenValue(result as HTMLValue);
    return;
  }

  if (isRawHTML(value)) {
    yield value.__raw;
    return;
  }

  if (isHTML(value)) {
    for await (const chunk of value) {
      yield chunk;
    }
    return;
  }

  if (isAsyncIterable(value)) {
    for await (const v of value as AsyncIterable<HTMLValue>) {
      yield* flattenValue(v);
    }
    return;
  }

  if (isIterable(value) && typeof value !== "string") {
    for (const v of value as Iterable<HTMLValue>) {
      yield* flattenValue(v);
    }
    return;
  }

  yield escape(value);
}

export function html(
  strings: TemplateStringsArray,
  ...values: HTMLValue[],
): HTML {
  return (async function* (): AsyncGenerator<string> {
    for (let i = 0; i < strings.length; i++) {
      yield strings[i];
      if (i >= values.length) continue;
      const value = values[i];
      yield* flattenValue(value);
    }
  })();
}

export const htmlToString = async (fragment: HTML): Promise<string> => {
  let out = "";
  for await (const chunk of fragment) out += chunk;
  return out;
};

export function htmlToStream(
  fragment: HTML,
  encoder: TextEncoder = sharedEncoder,
): ReadableStream<Uint8Array> {
  const iterator = fragment[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(value));
      } catch (e) {
        controller.error(e);
      }
    },

    async cancel() {
      if (typeof iterator.return === "function") {
        try {
          await iterator.return();
        } catch {
          // ignore
        }
      }
    },
  });
}

export class HTMLResponse extends Response {
  constructor(body: HTML | string, init?: ResponseInit) {
    const headers = new Headers(init?.headers || undefined);
    if (!headers.has("content-type")) {
      headers.set("content-type", "text/html; charset=utf-8");
    }

    if (typeof body === "string") {
      super(body, { ...init, headers });
    } else {
      const stream = htmlToStream(body);
      super(stream as any, { ...init, headers });
    }
  }
}

// ---------------------------------------------------------------------------
// Hacker News Firebase API integration + Netlify Cache API
// ---------------------------------------------------------------------------

const HN_API_BASE = "https://hacker-news.firebaseio.com/v0";

// Cache name & TTLS for Netlify Cache API
const HN_CACHE_NAME = "nfhn-hn-api";
const TOP_IDS_TTL_SECONDS = 30; // 30s
const ITEM_TTL_SECONDS = 60; // 60s

interface HNAPIItem {
  id: number;
  by?: string;
  time?: number;
  type: string;
  title?: string;
  url?: string;
  text?: string;
  score?: number;
  descendants?: number;
  kids?: number[];
  deleted?: boolean;
  dead?: boolean;
  domain?: string;
}

export interface Item {
  id: number;
  title: string;
  points: number | null;
  user: string | null;
  time: number;
  time_ago: string;
  content: string;
  deleted?: boolean;
  dead?: boolean;
  type: string;
  url?: string;
  domain?: string;
  comments: Item[];
  level: number;
  comments_count: number;
}

async function getCache() {
  // Allowed to open in global scope; operations (match/put) happen during handler execution
  return caches.open(HN_CACHE_NAME);
}

/**
 * Fetch JSON from HN with Netlify programmable Cache API.
 * - Uses URL as cache key.
 * - Ensures a valid Cache-Control header so Netlify will store it.
 * - Returns parsed JSON or null on error.
 */
async function fetchJSONWithNetlifyCache<T>(
  path: string,
  ttlSeconds: number,
): Promise<T | null> {
  const url = `${HN_API_BASE}${path}`;
  const cache = await getCache();
  const request = new Request(url);

  // 1. Try the cache
  const cached = await cache.match(request);
  if (cached) {
    try {
      const text = await cached.text();
      return JSON.parse(text) as T;
    } catch (e) {
      console.error("Cached JSON parse error:", path, e);
      // Fall through to network
    }
  }

  // 2. Network fallback
  const res = await fetch(request);
  if (!res.ok) {
    console.error("HN API error:", res.status, path);
    return null;
  }

  // Read once as text to both parse and cache
  const bodyText = await res.text();

  // 3. Store in Netlify cache if response is OK
  try {
    const headers = new Headers(res.headers);
    // Ensure a valid public cache directive per Netlify Cache API docs
    headers.set("Cache-Control", `public, max-age=${ttlSeconds}`);
    const cacheResponse = new Response(bodyText, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });

    cache.put(request, cacheResponse).catch((error) => {
      console.error("Failed to put into Netlify cache:", path, error);
    });
  } catch (e) {
    console.error("Error preparing response for cache:", path, e);
  }

  // 4. Parse JSON for the current request
  try {
    return JSON.parse(bodyText) as T;
  } catch (e) {
    console.error("HN API JSON parse error:", path, e);
    return null;
  }
}

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function now(): number {
  return Date.now();
}

function formatTimeAgo(unixSeconds: number | undefined): string {
  if (!unixSeconds) return "";
  const then = unixSeconds * 1000;
  const current = now();
  const diff = Math.max(0, current - then);

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const years = Math.floor(days / 365);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function mapStoryToItem(
  raw: HNAPIItem,
  level = 0,
  comments: Item[] = [],
): Item {
  const time = raw.time ?? 0;
  return {
    id: raw.id,
    title: raw.title ?? "",
    points: typeof raw.score === "number" ? raw.score : null,
    user: raw.by ?? null,
    time,
    time_ago: formatTimeAgo(time),
    content: raw.text ?? "",
    deleted: raw.deleted,
    dead: raw.dead,
    type: raw.type,
    url: raw.url,
    domain: extractDomain(raw.url),
    comments,
    level,
    comments_count:
      typeof raw.descendants === "number" ? raw.descendants : comments.length,
  };
}

// Comment limits to keep edge execution bounded
const MAX_COMMENT_DEPTH = 10;
const MAX_COMMENTS_TOTAL = 300;

async function fetchTopIds(): Promise<number[] | null> {
  return fetchJSONWithNetlifyCache<number[]>("/topstories.json", TOP_IDS_TTL_SECONDS);
}

async function fetchItem(id: number): Promise<HNAPIItem | null> {
  return fetchJSONWithNetlifyCache<HNAPIItem>(`/item/${id}.json`, ITEM_TTL_SECONDS);
}

async function fetchCommentsTree(
  ids: number[] | undefined,
  level: number,
  state: { remaining: number },
): Promise<Item[]> {
  if (!ids || !ids.length || state.remaining <= 0 || level >= MAX_COMMENT_DEPTH) {
    return [];
  }

  const limitedIds = ids.slice(0, state.remaining);
  const results = await Promise.all(limitedIds.map((id) => fetchItem(id)));

  const items: Item[] = [];

  for (const raw of results) {
    if (!raw) continue;
    if (raw.deleted || raw.dead) continue;
    if (raw.type !== "comment") continue;

    if (state.remaining <= 0) break;
    state.remaining -= 1;

    const children = await fetchCommentsTree(raw.kids, level + 1, state);

    const time = raw.time ?? 0;
    const item: Item = {
      id: raw.id,
      title: "",
      points: null,
      user: raw.by ?? null,
      time,
      time_ago: formatTimeAgo(time),
      content: raw.text ?? "",
      deleted: raw.deleted,
      dead: raw.dead,
      type: raw.type,
      url: undefined,
      domain: undefined,
      comments: children,
      level,
      comments_count: children.length,
    };

    items.push(item);

    if (state.remaining <= 0) break;
  }

  return items;
}

async function fetchStoryWithComments(id: number): Promise<Item | null> {
  const raw = await fetchItem(id);
  if (!raw) return null;
  if (raw.deleted || raw.dead) return null;

  const state = { remaining: MAX_COMMENTS_TOTAL };
  const comments = await fetchCommentsTree(raw.kids, 0, state);

  return mapStoryToItem(raw, 0, comments);
}

async function fetchTopStoriesPage(
  pageNumber: number,
  pageSize = 30,
): Promise<Item[]> {
  const ids = await fetchTopIds();
  if (!ids || !ids.length) {
    return [];
  }

  const start = (pageNumber - 1) * pageSize;
  const end = start + pageSize;
  const slice = ids.slice(start, end);
  if (!slice.length) {
    return [];
  }

  const stories = await Promise.all(slice.map((id) => fetchItem(id)));

  return stories
    .filter(
      (s): s is HNAPIItem =>
        !!s && !s.deleted && !s.dead && s.type === "story",
    )
    .map((s) => mapStoryToItem(s, 0, []));
}

// ---------------------------------------------------------------------------
// Rendering (unchanged from your earlier version)
// ---------------------------------------------------------------------------

export const home = (content: Item[], pageNumber: number): HTML => html`
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" type="image/svg+xml" href="/icon.svg">
    <style type="text/css">
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
        background-color: whitesmoke;
        margin: 40px auto;
        max-width: 650px;
        line-height: 1.6;
        font-size: 18px;
        padding: 0 1em;
        box-sizing: border-box;
      }
      main {
        display: block;
      }
      ul {
        list-style: none;
        padding-left: 0;
      }
      ol {
        list-style-type: none;
        counter-reset: section;
        counter-set: section ${pageNumber === 1 ? 0 : (pageNumber - 1) * 30};
        padding: 0;
      }
      li {
        position: relative;
        display: grid;
        grid-template-columns: 0fr 1fr;
        grid-template-areas:
          ". main"
          ". footer"
          ". .";
        gap: 1em;
        margin-bottom: 1em;
      }
      li:before {
        counter-increment: section;
        content: counter(section);
        font-size: 1.6em;
        position: absolute;
      }
      li:after {
        content: "";
        background: black;
        position: absolute;
        bottom: 0;
        left: 3em;
        width: calc(100% - 3em);
        height: 1px;
      }
      li > * {
        margin-left: 2em;
      }
      .title {
        grid-area: main;
      }
      .comments {
        grid-area: footer;
      }
      a {
        display: flex;
        justify-content: center;
        align-content: center;
        flex-direction: column;
      }
      h1,h2,h3 {
        line-height: 1.2
      }
    </style>
    <title>NFHN: Page ${pageNumber}</title>
  </head>
  <body>
    <main>
      <ol>
        ${content.map((data: Item) => html`
          <li>
            <a class="title" href="${data.url ?? `/item/${data.id}`}">
              ${data.title}
            </a>
            <a class="comments" href="/item/${data.id}">
              view ${data.comments_count > 0 ? data.comments_count + " comments" : "discussion"}
            </a>
          </li>
        `)}
      </ol>
      <a href="/top/${pageNumber + 1}" style="text-align: center;">More</a>
    </main>
  </body>
</html>
`;

const commentsList = (comments: Item[], level: number): HTML =>
  (async function* (): AsyncGenerator<string> {
    const isNested = level >= 1;

    if (isNested) yield "<ul>";

    for (const child of comments) {
      if (isNested) yield "<li>";
      yield* comment(child, level);
      if (isNested) yield "</li>";
    }

    if (isNested) yield "</ul>";
  })();

const comment = (item: Item, level = 0): HTML => html`
  <details ${level === 0 ? "open" : ""} id="${item.id}">
    <summary>
      <span>
        ${item.user ?? "[deleted]"} -
        <a href="#${item.id}">${item.time_ago}</a>
      </span>
    </summary>
    <div>${unsafeHTML(item.content || "")}</div>
    ${item.comments.length
      ? commentsList(item.comments, level + 1)
      : ""}
  </details>
`;

const suspenseClientScript = raw(`
<script>
  (function () {
    function applyTemplate(tpl) {
      var targetId = tpl.getAttribute("data-suspense-replace");
      if (!targetId) return;
      var target = document.getElementById(targetId);
      if (!target) return;
      var clone = tpl.content ? tpl.content.cloneNode(true) : null;
      if (!clone) return;
      target.replaceWith(clone);
      tpl.remove();
    }

    function scan(root) {
      var tpls = root.querySelectorAll("template[data-suspense-replace]");
      for (var i = 0; i < tpls.length; i++) {
        applyTemplate(tpls[i]);
      }
    }

    function setupObserver() {
      var observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          for (var j = 0; j < m.addedNodes.length; j++) {
            var node = m.addedNodes[j];
            if (node.nodeType !== 1) continue;
            if (node.matches && node.matches("template[data-suspense-replace]")) {
              applyTemplate(node);
            } else if (node.querySelectorAll) {
              scan(node);
            }
          }
        }
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        scan(document);
        setupObserver();
      });
    } else {
      scan(document);
      setupObserver();
    }
  })();
</script>
`);

const shellPage = (title: string, body: HTML): HTML =>
  (async function* (): AsyncGenerator<string> {
    yield* html`
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <style type="text/css">
      * {
        box-sizing: border-box;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji",
          "Segoe UI Symbol";
        background-color: whitesmoke;
        margin: 40px auto;
        max-width: 80ch;
        line-height: 1.6;
        font-size: 18px;
        color: #444;
        padding: 0 10px;
      }
      main {
        display: block;
      }
      details {
        background-color: whitesmoke;
        margin: 40px auto;
        max-width: 650px;
        line-height: 1.6;
        font-size: 18px;
        color: #444;
      }
      summary {
        font-weight: bold;
        margin: -.5em -.5em 0;
        padding: .5em;
      }
      details[open] summary {
        border-bottom: 1px solid #aaa;
      }
      pre {
        white-space: pre-wrap;
      }
      ul {
        padding-left: 1em;
        list-style: none;
      }
      h1,
      h2,
      h3 {
        line-height: 1.2;
        font-size: x-large;
        margin: 0;
      }
      hr {
        border: 0.5em solid rgba(0, 0, 0, 0.1);
        margin: 2em 0;
      }
      article {
        padding-left: 1em;
      }
      small {
        display: block;
        padding-top: 0.5em;
      }
      p {
        padding-block: 0.5em;
        margin: 0;
      }
    </style>
    <title>${title}</title>
    ${suspenseClientScript}
  </head>
  <body>
    `;

    yield* body;

    yield* html`
  </body>
</html>
    `;
  })();

const suspense = (
  id: string,
  placeholder: HTML,
  loader: () => HTMLValue | Promise<HTMLValue>,
): HTML =>
  (async function* (): AsyncGenerator<string> {
    const escapedId = escape(id);

    yield `<div id="${escapedId}" data-suspense-placeholder="true">`;
    for await (const chunk of placeholder) {
      yield chunk;
    }
    yield `</div>`;

    const resolved = await loader();

    yield `<template data-suspense-replace="${escapedId}">`;
    for await (const chunk of flattenValue(resolved as HTMLValue)) {
      yield chunk;
    }
    yield `</template>`;
  })();

export const article = (item: Item): HTML =>
  shellPage(`NFHN: ${item.title}`, html`
    <nav>
      <a href="/">Home</a>
    </nav>
    <hr />
    <main>
      <article>
        <a href="${item.url ?? "#"}">
          <h1>${item.title}</h1>
          <small>${item.domain ?? ""}</small>
        </a>
        <p>
          ${item.points ?? 0} points by
          ${item.user ?? "[deleted]"} ${item.time_ago}
        </p>
        <hr />
        ${unsafeHTML(item.content || "")}
        ${suspense(
          `comments-root-${item.id}`,
          html`<p>Loading comments…</p>`,
          () => commentsList(item.comments, 0),
        )}
      </article>
    </main>
  `);

// ---------------------------------------------------------------------------
// Routing (no Elysia)
// ---------------------------------------------------------------------------

const redirectToTop1 = (): Response =>
  new Response(null, {
    status: 301,
    headers: { Location: "/top/1" },
  });

async function handleTop(pageNumber: number): Promise<Response> {
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const results = await fetchTopStoriesPage(pageNumber);
    if (!results.length) {
      return new Response("No such page", { status: 404 });
    }
    return new HTMLResponse(home(results, pageNumber));
  } catch (e) {
    console.error("Top stories fetch error:", e);
    return new Response("Hacker News API error", { status: 502 });
  }
}

async function handleItem(id: number): Promise<Response> {
  if (!Number.isFinite(id)) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const item = await fetchStoryWithComments(id);
    if (!item) {
      return new Response("No such page", { status: 404 });
    }
    return new HTMLResponse(article(item));
  } catch (e) {
    console.error("Item fetch error:", e);
    return new Response("Hacker News API error", { status: 502 });
  }
}

export default async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === "/" || path === "/top" || path === "/top/") {
      return redirectToTop1();
    }

    if (path === "/icon.svg") {
      return new Response(contents, {
        status: 200,
        headers: {
          "content-type": "image/svg+xml; charset=utf-8",
        },
      });
    }

    const topMatch = path.match(/^\/top\/(\d+)$/);
    if (topMatch) {
      const pageNumber = Number.parseInt(topMatch[1], 10);
      return await handleTop(pageNumber);
    }

    const itemMatch = path.match(/^\/item\/(\d+)$/);
    if (itemMatch) {
      const id = Number.parseInt(itemMatch[1], 10);
      return await handleItem(id);
    }

    return new Response("Not Found", { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Unhandled error in edge function:", message);
    return new Response("Internal Server Error", { status: 500 });
  }
};

export const config: Config = {
  method: ["GET"],
  path: "/*",
  // Optional: you can also opt into full edge response caching if you want,
  // but this is *separate* from the programmable Cache API used above.
  // cache: "manual",
};