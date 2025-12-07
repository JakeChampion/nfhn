import type { Config } from "@netlify/edge-functions";
import { Elysia } from "elysia";
import { contents } from "./handlers/icon.ts";
//import {
//  html,
//  unsafeHTML,
//  type HTML,
//  HTMLResponse,
//} from //"https://ghuc.cc/worker-tools/html";

// netlify/edge-functions/html.ts

// Primitive values allowed directly
type Primitive = string | number | boolean | null | undefined;

// Explicit marker for “don’t escape this”
export interface RawHTML {
  readonly __raw: string;
}

export const raw = (html: string): RawHTML => ({ __raw: html });

// Streaming HTML fragment: async generator of string chunks
export interface HTML extends AsyncIterable<string> {}

// Full universe of allowed values inside ${...}
export type HTMLValue =
  | Primitive
  | RawHTML
  | HTML
  | Promise<HTMLValue>
  | Iterable<HTMLValue>
  | AsyncIterable<HTMLValue>
  | (() => HTMLValue | Promise<HTMLValue>);

// Escape function – you can swap this if you want custom escaping
export type EscapeFn = (value: unknown) => string;

export const defaultEscape: EscapeFn = (value: unknown): string => {
  if (value == null || value === false) return "";
  const str = String(value);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const isAsyncIterable = (v: any): v is AsyncIterable<any> =>
  v && typeof v[Symbol.asyncIterator] === "function";

const isIterable = (v: any): v is Iterable<any> =>
  v && typeof v[Symbol.iterator] === "function";

const isHTML = (v: any): v is HTML =>
  v && typeof v[Symbol.asyncIterator] === "function" && !("__raw" in v);

// Core: recursively flatten any HTMLValue into escaped chunks
async function* flattenValue(
  value: HTMLValue,
  escape: EscapeFn,
): AsyncIterable<string> {
  if (value == null || value === false) return;

  // Lazy function: call once, then process
  if (typeof value === "function") {
    const result = value();
    yield* flattenValue(await result, escape);
    return;
  }

  // Promise: await then recurse
  if (value instanceof Promise) {
    const result = await value;
    yield* flattenValue(result as HTMLValue, escape);
    return;
  }

  // Raw HTML: emit as-is
  if ((value as RawHTML).__raw !== undefined) {
    yield (value as RawHTML).__raw;
    return;
  }

  // Another HTML fragment
  if (isHTML(value)) {
    for await (const chunk of value) {
      yield chunk;
    }
    return;
  }

  // Async iterable
  if (isAsyncIterable(value)) {
    for await (const v of value) {
      yield* flattenValue(v as HTMLValue, escape);
    }
    return;
  }

  // Sync iterable (Array, Set, etc.), but not string
  if (isIterable(value) && typeof value !== "string") {
    for (const v of value as Iterable<HTMLValue>) {
      yield* flattenValue(v, escape);
    }
    return;
  }

  // Plain primitive
  yield escape(value);
}

// Tagged template: returns a streaming HTML fragment
export function html(
  strings: TemplateStringsArray,
  ...values: HTMLValue[]
): HTML {
  return (async function* (): AsyncGenerator<string> {
    const escape = defaultEscape;

    for (let i = 0; i < strings.length; i++) {
      // Static bit
      yield strings[i];

      if (i >= values.length) continue;

      // Dynamic bit
      const value = values[i];
      yield* flattenValue(value, escape);
    }
  })();
}

// Escape hatch (like unsafeHTML)
export const unsafeHTML = (htmlString: string): RawHTML => raw(htmlString);

// Convert HTML fragment into a ReadableStream<Uint8Array>
export function htmlToStream(
  fragment: HTML,
  encoder: TextEncoder = new TextEncoder(),
): ReadableStream<Uint8Array> {
  const iterator = fragment[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(value));
    },

    async cancel() {
      if (iterator.return) {
        try {
          await iterator.return();
        } catch {
          // ignore
        }
      }
    },
  });
}

// Streaming HTML Response
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

// Optional helper for tests / emails
export async function renderToString(fragment: HTML): Promise<string> {
  let out = "";
  for await (const chunk of fragment) {
    out += chunk;
  }
  return out;
}

export const home = (content: any, pageNumber: number) => html`
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
      ol {
        list-style-type: none;
        counter-reset: section;
        counter-set: section ${pageNumber === 1 ? 0 : (pageNumber-1)*30};
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
    <title>
      NFHN: Page ${pageNumber}
    </title>
  </head>
  <body>
    <ol>
        ${content.map((data: any) => {
            return html`
            <li>
              <a class="title" href="${data.url}">${data.title}</a>
              <a class="comments" href="/item/${data.id}">view ${data.comments_count > 0 ? data.comments_count +' comments' : 'discussion'}</a>
            </li>`
        })}
    </ol>
    <a href="/top/${pageNumber+1}" style="text-align: center;">More</a>
  </body>
</html>`

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

const comment = (item: Item): HTML => html`
  <details open id=${item.id}>
    <summary>
      <span>
        <a href="/user/${item.user}">${item.user}</a> -
        <a href="#${item.id}">${item.time_ago}</a>
      </span>
    </summary>
    <div>${unsafeHTML(item.content)}</div>
    <ul>
      ${item.comments.map((child) => html`<li>${comment(child)}</li>`)}
    </ul>
  </details>
`;

export const article = (item: Item): HTML => html`
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
    <title>NFHN: ${item.title}</title>
  </head>
  <body>
    <nav>
      <a href="/">Home</a>
    </nav>
    <hr />
    <article>
      <a href="${item.url}">
        <h1>${item.title}</h1>
        <small>${item.domain}</small>
      </a>
      <p>
        ${item.points} points by
        <a href="/user/${item.user}">${item.user}</a> ${item.time_ago}
      </p>
      <hr />
      ${unsafeHTML(item.content)}
      ${item.comments.map(comment)}
    </article>
  </body>
</html>
`;

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
  // Redirects
  .get("/", () => {
    return new Response(null, {
      status: 301,
      headers: {
        Location: "/top/1",
      },
    });
  })
  .get("/top", () => {
    return new Response(null, {
      status: 301,
      headers: {
        Location: "/top/1",
      },
    });
  })
  .get("/top/", () => {
    return new Response(null, {
      status: 301,
      headers: {
        Location: "/top/1",
      },
    });
  })
  // Icon
  .get("/icon.svg", () => {
    return new Response(contents, {
      status: 200,
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
      },
    });
  })
  // Top stories
  .get("/top/:pageNumber", async ({ params, set }) => {
    const pageNumber = Number.parseInt(params.pageNumber, 10);

    // Validate page is numeric and within 1–20
    if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > 20) {
      set.status = 404;
      return "Not Found";
    }

    let backendResponse: Response;
    try {
      backendResponse = await fetch(
        `https://api.hnpwa.com/v0/news/${pageNumber}.json`,
      );
    } catch {
      set.status = 502;
      return "Backend service error";
    }

    if (backendResponse.status >= 300) {
      if (backendResponse.status >= 500) {
        set.status = 502;
        return "Backend service error";
      }
      set.status = 404;
      return "No such page";
    }

    const body = await backendResponse.text();
    try {
      const results: Item[] = JSON.parse(body);
      if (!results) {
        set.status = 404;
        return "No such page";
      }
      // HTMLResponse will set an appropriate text/html content-type
      return new HTMLResponse(home(results, pageNumber));
    } catch {
      set.status = 500;
      return `Hacker News API did not return valid JSON.\n\nResponse Body: ${JSON.stringify(
        body,
      )}`;
    }
  })
  // Item page
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
    } catch {
      set.status = 502;
      return "Backend service error";
    }

    if (backendResponse.status >= 300) {
      if (backendResponse.status >= 500) {
        set.status = 502;
        return "Backend service error";
      }
      set.status = 404;
      return "No such page";
    }

    const body = await backendResponse.text();
    try {
      const result: Item = JSON.parse(body);
      if (!result) {
        set.status = 404;
        return "No such page";
      }
      return new HTMLResponse(article(result));
    } catch {
      set.status = 500;
      return `Hacker News API did not return valid JSON.\n\nResponse Body: ${JSON.stringify(
        body,
      )}`;
    }
  })
  // Intentional error route
  .get("/error", () => {
    throw new Error("uh oh");
  });

export default (request: Request) => app.handle(request);

export const config: Config = {
  method: ["GET"],
  path: "/*",
};
