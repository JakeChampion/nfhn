import type { Config } from "@netlify/edge-functions"
import { Elysia } from 'elysia'
import { contents } from './handlers/icon.ts'

import { home } from "./layouts/hn.ts";

import { html, unsafeHTML } from "https://ghuc.cc/worker-tools/html";

// export interface Item {
//     id: number;
//     title: string;
//     points: number | null;
//     user: string | null;
//     time: number;
//     time_ago: string;
//     content: string;
//     deleted?: boolean;
//     dead?: boolean;
//     type: string;
//     url?: string;
//     domain?: string;
//     comments: Item[]; // Comments are items too
//     level: number;
//     comments_count: number;
//   }
const comment = (content: any) => html`
<details open id=${content.id}>
  <summary>
    <span><a href="/user/${content.user}">${content.user}</a> - <a href="#${content.id}">${content.time_ago}</a></span
    >
  </summary>
  <div>${unsafeHTML(content.content)}</div>
  <ul>
    ${content.comments.map((content: any) => html`<li>${comment(content)}</li>`)}
  </ul>
</details>`;

export const article = (content: any) => html`
<!DOCTYPE html>
<html lang="en" >
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" type="image/svg+xml" href="/icon.svg">
    <style type="text/css">
      * {
        box-sizing: border-box;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
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
      h1,h2,h3 {
        line-height: 1.2;
        font-size: x-large;
        margin: 0;
      }
      hr {
        border: 0.5em solid rgba(0,0,0,.1);
        margin: 2em 0;
      }
      article {
        padding-left: 1em;
      }

      small {
        display: block;
        padding-top: .5em;
      }
      p {
        padding-block: 0.5em;
        margin: 0;
      }
    </style>
    <title>
      NFHN: ${content.title}
    </title>
  </head>
  <body>
    <nav>
      <a href="/">Home</a>
    </nav>
    <hr>
    <article>
      <a href="${content.url}">
        <h1>${content.title}</h1>
        <small>${content.domain}</small>
      </a>
      <p>
        ${content.points} points by <a href="/user/${content.user}">${content.user}</a> ${content.time_ago}
      </p>
    </article>
    <hr />
    ${unsafeHTML(content.content)}
    ${content.comments.map(comment)}
  </body>
</html>`;

export const app = new Elysia()
  .onError(({ code, error, set }) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error:', code, errorMessage);
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return 'Not Found';
    }
    set.status = 500;
    return 'Internal Server Error';
  })
  .get('/', ({ redirect }) => {
    redirect('/top/1');
  })
  .get('/top', ({ redirect }) => {
    redirect('/top/1')
  })
  .get('/top/', ({ redirect }) => {
    redirect('/top/1')
  })
  .get('/icon.svg', ({ set }) => {
    set.headers['content-type'] = 'image/svg+xml; charset=utf-8';
    return contents;
  })
  .get('/top/:pageNumber', async ({ params, set }) => {
    const pageNumber = Number.parseInt(params.pageNumber, 10)
    // Validate pageNumber is a valid number and between 1-20
    if (isNaN(pageNumber) || pageNumber < 1 || pageNumber > 20) {
      set.status = 404;
      return 'Not Found';
    }
   
  const backendResponse = await fetch(
    `https://api.hnpwa.com/v0/news/${pageNumber}.json`
  );
  if (backendResponse.status >= 300) {
    if (backendResponse.status >= 500) {
      set.status = 502;
      return 'Backend service error';
    }
    set.status = 404;
    return 'No such page';
  }
  let body = await backendResponse.text()
  try {
    let results = JSON.parse(body);
    if (!results) {
      set.status = 404;
      return 'No such page';
    }
    set.headers['content-type'] = 'text/html; charset=utf-8';
    return home(results, pageNumber);
  } catch (error) {
    set.status = 500;
    return `Hacker News API did not return valid JSON.\n\nResponse Body: ${JSON.stringify(body)}`;
  }})
  .get('/item/:id', async ({ params, set }) => {
    const id = Number.parseInt(params.id, 10)
    // Validate id is a valid number
    if (isNaN(id)) {
      set.status = 404;
      return 'Not Found';
    }
  const backendResponse = await fetch(
    `https://api.hnpwa.com/v0/item/${id}.json`
  );
  if (backendResponse.status >= 500) {
    set.status = 502;
    return 'Backend service error';
  }
  let body = await backendResponse.text()
  try {
    let results = JSON.parse(body);
    if (!results) {
      set.status = 404;
      return 'No such page';
    }
    set.headers['content-type'] = 'text/html; charset=utf-8';
    return article(results);
  } catch (error) {
    set.status = 500;
    return `Hacker News API did not return valid JSON.\n\nResponse Body: ${JSON.stringify(body)}`;
  }})
  .get('/error', () => {
    throw new Error('uh oh')
  })

export default async (request: Request) => {
  return app.handle(request)
}

export const config: Config = {
  method: ['GET'],
  path: '/*',
}
