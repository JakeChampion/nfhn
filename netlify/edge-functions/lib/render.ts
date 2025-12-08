// render.ts
import {
  type HTML,
  type HTMLValue,
  html,
  raw,
  unsafeHTML,
  escape,
} from "./html.ts";
import {
  type Item,
  type HNAPIItem,
  fetchItem,
  formatTimeAgo,
} from "./hn.ts";

// Limits to keep edge execution bounded
const MAX_COMMENT_DEPTH = 10;
const MAX_COMMENTS_TOTAL = 300;

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

// Shell page for article
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
  </head>
  <body>
    `;

    yield* body;

    yield* html`
  </body>
</html>
    `;
  })();

// Streaming comments section
const commentsSection = (rootIds: number[] | undefined): HTML =>
  (async function* (): AsyncGenerator<string> {
    if (!rootIds || rootIds.length === 0) {
      yield "<p>No comments yet.</p>";
      return;
    }

    yield '<section aria-label="Comments">';

    const state = { remaining: MAX_COMMENTS_TOTAL };
    for await (const chunk of streamComments(rootIds, 0, state)) {
      yield chunk;
    }

    yield "</section>";
  })();

// Core streaming comment renderer: fetch & render on the fly
async function* streamComments(
  ids: number[],
  level: number,
  state: { remaining: number },
): AsyncGenerator<string> {
  if (!ids.length || state.remaining <= 0 || level >= MAX_COMMENT_DEPTH) {
    return;
  }

  const isNested = level >= 1;
  if (isNested) yield "<ul>";

  for (const id of ids) {
    if (state.remaining <= 0) break;

    const rawComment = await fetchItem(id);
    if (!rawComment) continue;
    if (rawComment.deleted || rawComment.dead) continue;
    if (rawComment.type !== "comment") continue;

    state.remaining -= 1;

    const time_ago = formatTimeAgo(rawComment.time ?? 0);
    const user = rawComment.by ?? "[deleted]";
    const content = rawComment.text ?? "";

    if (isNested) yield "<li>";

    // Render a single comment block
    yield `<details ${level === 0 ? "open" : ""} id="${rawComment.id}">`;
    yield `<summary><span>${escape(user)} - <a href="#${
      rawComment.id
    }">${escape(time_ago)}</a></span></summary>`;
    // HN comment text is already HTML (e.g. <p>...</p>), so don't escape
    yield `<div>${content}</div>`;

    // Children streamed recursively
    if (
      rawComment.kids &&
      rawComment.kids.length &&
      state.remaining > 0 &&
      level + 1 < MAX_COMMENT_DEPTH
    ) {
      for await (const chunk of streamComments(
        rawComment.kids,
        level + 1,
        state,
      )) {
        yield chunk;
      }
    }

    yield "</details>";

    if (isNested) yield "</li>";
  }

  if (isNested) yield "</ul>";
}

export const article = (item: Item, rootCommentIds: number[]): HTML =>
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
        ${commentsSection(rootCommentIds)}
      </article>
    </main>
  `);