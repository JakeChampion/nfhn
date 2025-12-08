import type { Config } from "@netlify/edge-functions";
import { Elysia } from "elysia";
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

async function* flattenValue(
  value: HTMLValue,
): AsyncIterable<string> {
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
  ...values: HTMLValue[]
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
  encoder: TextEncoder = new TextEncoder(),
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
            <a class="title" href="${data.url}">${data.title}</a>
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

// Streaming-friendly comments with no root <ul> and no user links
const commentsList = (comments: Item[], level: number): HTML =>
  (async function* (): AsyncGenerator<string> {
    const isNested = level >= 1;

    // Only nested comments get a <ul>
    if (isNested) yield "<ul>";

    for (const child of comments) {
      // Only nested comments get <li>
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
        ${item.user} -
        <a href="#${item.id}">${item.time_ago}</a>
      </span>
    </summary>
    <div>${unsafeHTML(item.content)}</div>
    ${item.comments.length
      ? commentsList(item.comments, level + 1)
      : ""}
  </details>
`;

// Tiny client-side helper to swap suspense placeholders with templates
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

// Shell-first streaming page wrapper for article
const shellPage = (title: string, body: HTML): HTML =>
  (async function* (): AsyncGenerator<string> {
    // Head + layout flush early
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

    // Body streams independently (including comments)
    yield* body;

    // Tail
    yield* html`
  </body>
</html>
    `;
  })();

// Suspense-style helper for comments slot
const suspense = (
  id: string,
  placeholder: HTML,
  loader: () => HTMLValue | Promise<HTMLValue>,
): HTML =>
  (async function* (): AsyncGenerator<string> {
    const escapedId = escape(id);

    // 1. Placeholder container (renders immediately)
    yield `<div id="${escapedId}" data-suspense-placeholder="true">`;
    for await (const chunk of placeholder) {
      yield chunk;
    }
    yield `</div>`;

    // 2. Resolve real content
    const resolved = await loader();

    // 3. Send a template that will replace the placeholder on the client
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
        <a href="${item.url}">
          <h1>${item.title}</h1>
          <small>${item.domain}</small>
        </a>
        <p>
          ${item.points} points by
          ${item.user} ${item.time_ago}
        </p>
        <hr />
        ${unsafeHTML(item.content)}
        ${suspense(
          `comments-root-${item.id}`,
          html`<p>Loading comments…</p>`,
          () => commentsList(item.comments, 0),
        )}
      </article>
    </main>
  `);

const redirectToTop1 = () =>
  new Response(null, {
    status: 301,
    headers: {
      Location: "/top/1",
    },
  });

export const app = new Elysia()
  .onError(({ code, error, set }) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error:", code, errorMessage);
    if (code === "NOT_FOUND") {
      set.status = 404;
      return "Not Found";
    }
    set.status = 500;
    return "Internal Server Error";
  })
  .get("/", redirectToTop1)
  .get("/top", redirectToTop1)
  .get("/top/", redirectToTop1)
  .get("/icon.svg", () => {
    return new Response(contents, {
      status: 200,
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
      },
    });
  })
  .get("/top/:pageNumber", async ({ params, set }) => {
    const pageNumber = Number.parseInt(params.pageNumber, 10);
    if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > 20) {
      set.status = 404;
      return "Not Found";
    }

    let backendResponse: Response;
    try {
      backendResponse = await fetch(
        `https://api.hnpwa.com/v0/news/${pageNumber}.json`,
      );
    } catch (e) {
      console.error("Upstream fetch error (news):", e);
      set.status = 502;
      return "Backend service error";
    }

    if (!backendResponse.ok) {
      set.status = backendResponse.status === 404 ? 404 : 502;
      return `Backend service error (${backendResponse.status})`;
    }

    const body = await backendResponse.text();
    try {
      const results: Item[] = JSON.parse(body);
      if (!results) {
        set.status = 404;
        return "No such page";
      }
      return new HTMLResponse(home(results, pageNumber));
    } catch (e) {
      console.error("JSON parse error (news):", e);
      set.status = 500;
      return `Hacker News API did not return valid JSON.\n\nStatus: ${backendResponse.status}\n\nResponse Body: ${JSON.stringify(
        body,
      )}`;
    }
  })
  .get("/item/:id", async ({ params, set }) => {
    const id = Number.parseInt(params.id, 10);
    if (!Number.isFinite(id)) {
      set.status = 404;
      return "Not Found";
    }

    let backendResponse: Response;
    try {
      backendResponse = await fetch(
        `https://api.hnpwa.com/v0/item/${id}.json`,
      );
    } catch (e) {
      console.error("Upstream fetch error (item):", e);
      set.status = 502;
      return "Backend service error";
    }

    if (!backendResponse.ok) {
      set.status = backendResponse.status === 404 ? 404 : 502;
      return `Backend service error (${backendResponse.status})`;
    }

    const body = await backendResponse.text();
    try {
      const result: Item = JSON.parse(body);
      if (!result) {
        set.status = 404;
        return "No such page";
      }
      return new HTMLResponse(article(result));
    } catch (e) {
      console.error("JSON parse error (item):", e);
      set.status = 500;
      return `Hacker News API did not return valid JSON.\n\nResponse Body: ${JSON.stringify(
        body,
      )}`;
    }
  });

export default (request: Request) => app.handle(request);

export const config: Config = {
  method: ["GET"],
  path: "/*",
};