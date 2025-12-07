import type { Config } from "@netlify/edge-functions";
import { Elysia } from "elysia";
import { contents } from "./handlers/icon.ts";
import { home } from "./layouts/hn.ts";
import { html, unsafeHTML,type HTML } from "https://ghuc.cc/worker-tools/html";

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
      ${item.comments.map(child => html`<li>${comment(child)}</li>`)}
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
      /* your existing CSS unchanged */
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
  .get("/", ({ redirect }) => {
    redirect("/top/1");
  })
  .get("/top", ({ redirect }) => {
    redirect("/top/1");
  })
  .get("/top/", ({ redirect }) => {
    redirect("/top/1");
  })
  .get("/icon.svg", ({ set }) => {
    set.headers["content-type"] = "image/svg+xml";
    return contents;
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
        `https://api.hnpwa.com/v0/news/${pageNumber}.json`
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
      set.headers["content-type"] = "text/html; charset=utf-8";
      return home(results, pageNumber);
    } catch {
      set.status = 500;
      return `Hacker News API did not return valid JSON.\n\nResponse Body: ${JSON.stringify(
        body
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
        `https://api.hnpwa.com/v0/item/${id}.json`
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
      set.headers["content-type"] = "text/html; charset=utf-8";
      return article(result);
    } catch {
      set.status = 500;
      return `Hacker News API did not return valid JSON.\n\nResponse Body: ${JSON.stringify(
        body
      )}`;
    }
  })
  .get("/error", () => {
    throw new Error("uh oh");
  });

export default (request: Request) => app.handle(request);

export const config: Config = {
  method: ["GET"],
  path: "/*",
};