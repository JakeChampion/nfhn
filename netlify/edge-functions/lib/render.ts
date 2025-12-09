// render.ts
import { escape, type HTML, html, unsafeHTML } from "./html.ts";
import { type HNAPIItem, type Item } from "./hn.ts";

// Limits to keep edge execution bounded
const MAX_COMMENT_DEPTH = Infinity;
const MAX_COMMENTS_TOTAL = Infinity;

function typeLabel(type: string): string {
  switch (type) {
    case "ask":
      return "Ask HN";
    case "show":
      return "Show HN";
    case "job":
      return "Job";
    case "link":
      return "Link";
    case "comment":
      return "Comment";
    default:
      return type;
  }
}

function typeClass(type: string): string {
  switch (type) {
    case "ask":
      return "badge-ask";
    case "show":
      return "badge-show";
    case "job":
      return "badge-job";
    case "link":
      return "badge-link";
    default:
      return "badge-default";
  }
}

// Decide where the main story title link should go
function primaryHref(item: Item): string {
  // Ask / Show should always go to the item page (discussion/content)
  if (item.type === "ask" || item.type === "show") {
    return `/item/${item.id}`;
  }
  // Link / Job (and anything else) go to external URL if present, otherwise item page
  return item.url ?? `/item/${item.id}`;
}

type FeedSlug = "top" | "ask" | "show" | "jobs";

const tpl = html;

const turboScript = tpl`
<script>
  const used = new Set();

  function supportsRel(rel) {
    const link = document.createElement("link");
    return !!(link.relList && link.relList.supports && link.relList.supports(rel));
  }

  const canPrerender = supportsRel("prerender");
  const canPrefetch = supportsRel("prefetch");

  function warm(url) {
    const u = new URL(url, location.href);
    if (u.origin !== location.origin) return;

    const href = u.toString();
    if (used.has(href)) return;
    used.add(href);

    const link = document.createElement("link");
    if (canPrerender) {
      link.rel = "prerender";
    } else if (canPrefetch) {
      link.rel = "prefetch";
      link.as = "document"; // hint, safe to omit if you like
    } else {
      // No supported rel, give up quietly.
      return;
    }

    link.href = href;
    document.head.appendChild(link);
    console.debug("Warming link:", link.rel, link.href);
  }

  function onIntent(e) {
    const a = e.target.closest("a[href]");
    if (!a) return;
    if (a.target && a.target !== "_self") return;
    if (a.hasAttribute("download")) return;

    warm(a.href);
  }

  // Hover (desktop) + first touch (mobile)
  document.addEventListener("mouseover", onIntent, { passive: true });
  document.addEventListener("touchstart", onIntent, { passive: true });
</script>
`;

const renderStory = (data: Item): HTML =>
  html`
    <li>
      <a class="title" href="${primaryHref(data)}">
        <span class="badge ${typeClass(data.type)}">${typeLabel(data.type)}</span>
        <span class="story-title-text">${data.title}</span>
        ${data.domain
          ? html`
            <span class="story-meta">(${data.domain})</span>
          `
          : ""}
      </a>
      <a class="comments" href="/item/${data.id}">
        view ${data.comments_count > 0 ? data.comments_count + " comments" : "discussion"}
      </a>
    </li>
  `;

export const home = (
  content: Item[],
  pageNumber: number,
  feed: FeedSlug = "top",
  canonicalUrl?: string,
): HTML =>
  tpl`
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${canonicalUrl ? tpl`<link rel="canonical" href="${canonicalUrl}">` : ""}
    <meta name="description" content="Hacker News ${feed} page ${pageNumber}: latest ${feed} stories.">
    <link rel="icon" type="image/svg+xml" href="/icon.svg">
    <style type="text/css">
      body {
        font-family: system-ui, sans-serif;
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
        text-decoration: none;
        color: inherit;
      }
      a:hover .story-title-text {
        text-decoration: underline;
      }
      a:focus-visible {
        outline: 2px solid #ff7a18;
        outline-offset: 3px;
        border-radius: 4px;
      }
      h1,h2,h3 {
        line-height: 1.2
      }
      .badge {
        display: inline-block;
        padding: 0.1em 0.4em;
        border-radius: 999px;
        font-size: 0.7em;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-right: 0.5em;
        border: 1px solid rgba(0,0,0,0.1);
        background: rgba(0,0,0,0.04);
      }
      .badge-link {
        background: rgba(25, 118, 210, 0.08);
        border-color: rgba(25, 118, 210, 0.25);
      }
      .badge-ask {
        background: rgba(244, 67, 54, 0.08);
        border-color: rgba(244, 67, 54, 0.25);
      }
      .badge-show {
        background: rgba(67, 160, 71, 0.08);
        border-color: rgba(67, 160, 71, 0.25);
      }
      .badge-job {
        background: rgba(255, 160, 0, 0.08);
        border-color: rgba(255, 160, 0, 0.25);
      }
      .badge-default {
        background: rgba(0, 0, 0, 0.04);
        border-color: rgba(0, 0, 0, 0.15);
      }
      .story-title-text {
        font-weight: 500;
      }
      .story-meta {
        font-size: 0.85em;
        opacity: 0.8;
      }
      .nav-feeds {
        display: flex;
        gap: 0.75em;
        margin-bottom: 1.5em;
        font-size: 0.9em;
      }
      .nav-feeds a {
        text-decoration: none;
        color: inherit;
        opacity: 0.7;
      }
      .nav-feeds a.active {
        font-weight: 600;
        opacity: 1;
        text-decoration: underline;
      }
    </style>
    <title>NFHN: Page ${pageNumber}</title>
  </head>
  <body>
    <main aria-label="Main content">
      <nav class="nav-feeds" aria-label="Primary">
        <a href="/top/1" class="${feed === "top" ? "active" : ""}" aria-current="${
    feed === "top" ? "page" : undefined
  }">Top</a>
        <a href="/ask/1" class="${feed === "ask" ? "active" : ""}" aria-current="${
    feed === "ask" ? "page" : undefined
  }">Ask</a>
        <a href="/show/1" class="${feed === "show" ? "active" : ""}" aria-current="${
    feed === "show" ? "page" : undefined
  }">Show</a>
        <a href="/jobs/1" class="${feed === "jobs" ? "active" : ""}" aria-current="${
    feed === "jobs" ? "page" : undefined
  }">Jobs</a>
      </nav>
      <ol>
        ${content.map((data: Item) => renderStory(data))}
      </ol>
      <a href="/${feed}/${
    pageNumber + 1
  }" class="more-link" style="text-align: center; display:block; margin-top:1.5em;">More</a>
    </main>
    ${turboScript}
  </body>
</html>
`;

// Shell page for article
const shellPage = (
  title: string,
  body: HTML,
  canonicalUrl?: string,
  description?: string,
): HTML =>
  (async function* (): AsyncGenerator<string> {
    yield* tpl`
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${canonicalUrl ? tpl`<link rel="canonical" href="${canonicalUrl}" />` : ""}
    ${description ? tpl`<meta name="description" content="${description}" />` : ""}
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <style type="text/css">
      * {
        box-sizing: border-box;
      }
      body {
        font-family: system-ui, sans-serif;
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
      nav a {
        text-decoration: none;
        color: inherit;
      }
      nav a:hover {
        text-decoration: underline;
      }
      nav a:focus-visible {
        outline: 2px solid #ff7a18;
        outline-offset: 3px;
        border-radius: 4px;
      }
      .more-link:focus-visible {
        outline: 2px solid #ff7a18;
        outline-offset: 3px;
        border-radius: 4px;
      }
      .badge {
        display: inline-block;
        padding: 0.2em 0.6em;
        border-radius: 999px;
        font-size: 0.7em;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-right: 0.5em;
        border: 1px solid rgba(0,0,0,0.1);
        background: rgba(0,0,0,0.04);
        vertical-align: middle;
      }
      .badge-link {
        background: rgba(25, 118, 210, 0.08);
        border-color: rgba(25, 118, 210, 0.25);
      }
      .badge-ask {
        background: rgba(244, 67, 54, 0.08);
        border-color: rgba(244, 67, 54, 0.25);
      }
      .badge-show {
        background: rgba(67, 160, 71, 0.08);
        border-color: rgba(67, 160, 71, 0.25);
      }
      .badge-job {
        background: rgba(255, 160, 0, 0.08);
        border-color: rgba(255, 160, 0, 0.25);
      }
      .badge-default {
        background: rgba(0, 0, 0, 0.04);
        border-color: rgba(0, 0, 0, 0.15);
      }
      .meta-line {
        font-size: 0.9em;
        opacity: 0.85;
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

// Streaming comments section over nested HNPWA comments
const commentsSection = (rootComments: HNAPIItem[] | undefined): HTML =>
  (async function* (): AsyncGenerator<string> {
    if (!rootComments || rootComments.length === 0) {
      yield "<p>No comments yet.</p>";
      return;
    }

    yield '<section aria-label="Comments">';

    const state = { remaining: MAX_COMMENTS_TOTAL };
    for await (const chunk of streamComments(rootComments, 0, state)) {
      yield chunk;
    }

    yield "</section>";
  })();

async function* streamComments(
  comments: HNAPIItem[],
  level: number,
  state: { remaining: number },
): AsyncGenerator<string> {
  if (!comments.length || state.remaining <= 0 || level >= MAX_COMMENT_DEPTH) {
    return;
  }

  const isNested = level >= 1;
  if (isNested) yield "<ul>";

  for (const comment of comments) {
    if (state.remaining <= 0) break;
    if (comment.deleted || comment.dead || comment.type !== "comment") {
      continue;
    }

    state.remaining -= 1;

    const time_ago = comment.time_ago ?? "";
    const user = comment.user ?? "[deleted]";
    const content = comment.content ?? "";

    if (isNested) yield "<li>";

    const isRoot = level === 0;
    yield `<details ${isRoot ? "open" : ""} id="${comment.id}" aria-expanded="${
      isRoot ? "true" : "false"
    }">`;
    yield `<summary aria-label="Comment by ${escape(user)}, posted ${escape(time_ago)}"><span>${
      escape(user)
    } - <a href="#${comment.id}">${escape(time_ago)}</a></span></summary>`;
    // HNPWA comment content is already HTML
    yield `<div>${content}</div>`;

    if (
      comment.comments &&
      comment.comments.length &&
      state.remaining > 0 &&
      level + 1 < MAX_COMMENT_DEPTH
    ) {
      for await (
        const chunk of streamComments(
          comment.comments,
          level + 1,
          state,
        )
      ) {
        yield chunk;
      }
    }

    yield "</details>";

    if (isNested) yield "</li>";
  }

  if (isNested) yield "</ul>";
}

export const article = (item: Item, canonicalUrl?: string): HTML =>
  shellPage(
    `NFHN: ${item.title}`,
    html`
      <nav aria-label="Primary">
        <a href="/" aria-current="page">Home</a>
      </nav>
      <hr />
      <main>
        <article>
          <a href="${primaryHref(item)}">
            <span class="badge ${typeClass(item.type)}">${typeLabel(item.type)}</span>
            <h1 style="display:inline-block; margin-left:0.4em;">${item.title}</h1>
            ${item.domain
              ? html`
                <small>${item.domain}</small>
              `
              : ""}
          </a>
          ${// Job with no comments: hide points/comments line, just show "posted X ago"
          item.type === "job" && item.comments_count === 0
            ? html`
              <p class="meta-line">posted ${item.time_ago}</p>
            `
            : html`
              <p class="meta-line">
                ${item.points ?? 0} points by ${item.user ?? "[deleted]"} ${item.time_ago}
              </p>
            `}
          <hr />
          ${unsafeHTML(item.content || "")} ${commentsSection(item.comments)}
        </article>
      </main>
      ${turboScript}
    `,
    canonicalUrl,
    `Hacker News discussion: ${item.title}`,
  );
