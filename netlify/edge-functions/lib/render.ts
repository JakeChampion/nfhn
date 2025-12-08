// render.ts
import {
  type HTML,
  HTMLValue,
  html,
  raw,
  unsafeHTML,
  escape,
  flattenValue,
} from "./html.ts";
import type { Item } from "./hn.ts";

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