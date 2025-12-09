// render.ts
import { escape, type HTML, html, unsafeHTML } from "./html.ts";
import { FEEDS } from "./feeds.ts";
import { type FeedSlug, type HNAPIItem, type Item } from "./hn.ts";

type StoryType = Item["type"];

type TypeMeta = {
  label: string;
  badgeClass: string;
  href: (item: Item) => string;
};

type KnownType = "ask" | "show" | "job" | "link" | "comment";

const TYPE_META: Record<KnownType, TypeMeta> = {
  ask: { label: "Ask HN", badgeClass: "badge-ask", href: (item) => `/item/${item.id}` },
  show: { label: "Show HN", badgeClass: "badge-show", href: (item) => `/item/${item.id}` },
  job: {
    label: "Job",
    badgeClass: "badge-job",
    href: (item) => item.url ?? `/item/${item.id}`,
  },
  link: {
    label: "Link",
    badgeClass: "badge-link",
    href: (item) => item.url ?? `/item/${item.id}`,
  },
  comment: { label: "Comment", badgeClass: "badge-default", href: (item) => `/item/${item.id}` },
};

const getTypeMeta = (type: StoryType): TypeMeta =>
  TYPE_META[type as KnownType] ?? {
    label: type,
    badgeClass: "badge-default",
    href: (item: Item) => item.url ?? `/item/${item.id}`,
  };

const tpl = html;

const renderNav = (activeFeed: FeedSlug): HTML =>
  tpl`
    <nav class="nav-feeds" aria-label="Primary">
      ${FEEDS.map(({ slug, label }) =>
        html`
          <a href="/${slug}/1" class="${activeFeed === slug ? "active" : ""}" aria-current="${
          activeFeed === slug ? "page" : undefined
        }">${label}</a>
        `
      )}
    </nav>
  `;

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

const renderStory = (data: Item): HTML => {
  const meta = getTypeMeta(data.type);

  return html`
    <li>
      <a class="title" href="${meta.href(data)}">
        <span class="badge ${meta.badgeClass}">${meta.label}</span>
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
};

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
      ${renderNav(feed)}
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
        border: none;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        margin: 1.5em 0;
      }
      article {
        padding-left: 0.5em;
      }
      small {
        display: block;
        padding-top: 0.35em;
      }
      p {
        padding-block: 0.5em;
        margin: 0;
      }
      a {
        text-decoration: none;
        color: inherit;
      }
      a:hover {
        text-decoration: underline;
      }
      a:focus-visible {
        outline: 2px solid #ff7a18;
        outline-offset: 3px;
        border-radius: 4px;
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

    for await (const chunk of streamComments(rootComments, 0)) {
      yield chunk;
    }

    yield "</section>";
  })();

async function* streamComments(
  comments: HNAPIItem[],
  level: number,
): AsyncGenerator<string> {
  if (!comments.length) {
    return;
  }

  const isNested = level >= 1;
  if (isNested) yield "<ul>";

  for (const comment of comments) {
    if (comment.deleted || comment.dead || comment.type !== "comment") {
      continue;
    }
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
      comment.comments.length
    ) {
      for await (
        const chunk of streamComments(
          comment.comments,
          level + 1,
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

export const article = (item: Item, canonicalUrl?: string): HTML => {
  const activeFeed: FeedSlug = item.type === "ask"
    ? "ask"
    : item.type === "show"
    ? "show"
    : item.type === "job"
    ? "jobs"
    : "top";
  const meta = getTypeMeta(item.type);

  return shellPage(
    `NFHN: ${item.title}`,
    html`
      <main aria-label="Main content">
        ${renderNav(activeFeed)}
        <article>
          <a href="${meta.href(item)}">
            <span class="badge ${meta.badgeClass}">${meta.label}</span>
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
};
