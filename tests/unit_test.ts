// unit_test.ts - Unit tests for core utility functions

import {
  assertEquals,
  assertStrictEquals,
  assertStringIncludes,
  assertThrows,
} from "std/testing/asserts.ts";

import { escape, html, htmlToString, raw, unsafeHTML } from "../netlify/edge-functions/lib/html.ts";
import { formatTimeAgo, type HNAPIItem, mapStoryToItem } from "../netlify/edge-functions/lib/hn.ts";
import { buildContentSecurityPolicy } from "../netlify/edge-functions/lib/security.ts";
import { parsePositiveInt, redirect } from "../netlify/edge-functions/lib/handlers.ts";
import { pwaHeadTags } from "../netlify/edge-functions/lib/render/components.ts";

// =============================================================================
// HTML Escape Tests
// =============================================================================

Deno.test("escape: returns empty string for null", () => {
  assertEquals(escape(null), "");
});

Deno.test("escape: returns empty string for undefined", () => {
  assertEquals(escape(undefined), "");
});

Deno.test("escape: returns empty string for false", () => {
  assertEquals(escape(false), "");
});

Deno.test("escape: does not escape true", () => {
  assertEquals(escape(true), "true");
});

Deno.test("escape: converts numbers to strings", () => {
  assertEquals(escape(42), "42");
  assertEquals(escape(0), "0");
  assertEquals(escape(-1), "-1");
  assertEquals(escape(3.14), "3.14");
});

Deno.test("escape: escapes ampersand", () => {
  assertEquals(escape("Tom & Jerry"), "Tom &amp; Jerry");
});

Deno.test("escape: escapes less than", () => {
  assertEquals(escape("1 < 2"), "1 &lt; 2");
});

Deno.test("escape: escapes greater than", () => {
  assertEquals(escape("2 > 1"), "2 &gt; 1");
});

Deno.test("escape: escapes double quotes", () => {
  assertEquals(escape('say "hello"'), "say &quot;hello&quot;");
});

Deno.test("escape: escapes single quotes", () => {
  assertEquals(escape("it's"), "it&#39;s");
});

Deno.test("escape: escapes all special characters together", () => {
  assertEquals(
    escape(`<script>alert("xss" & 'test')</script>`),
    "&lt;script&gt;alert(&quot;xss&quot; &amp; &#39;test&#39;)&lt;/script&gt;",
  );
});

Deno.test("escape: handles empty string", () => {
  assertEquals(escape(""), "");
});

Deno.test("escape: passes through safe strings unchanged", () => {
  assertEquals(escape("Hello World"), "Hello World");
});

// =============================================================================
// HTML Template Tests
// =============================================================================

Deno.test("html: renders static content", async () => {
  const result = await htmlToString(html`
    <div>Hello</div>
  `);
  assertEquals(result, "<div>Hello</div>");
});

Deno.test("html: escapes interpolated strings", async () => {
  const userInput = "<script>alert('xss')</script>";
  const result = await htmlToString(html`
    <p>${userInput}</p>
  `);
  assertEquals(
    result,
    "<p>&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;</p>",
  );
});

Deno.test("html: renders numbers", async () => {
  const count = 42;
  const result = await htmlToString(html`
    <span>${count}</span>
  `);
  assertEquals(result, "<span>42</span>");
});

Deno.test("html: handles null and undefined as empty", async () => {
  const result = await htmlToString(html`
    <span>${null}${undefined}</span>
  `);
  assertEquals(result, "<span></span>");
});

Deno.test("html: handles false as empty", async () => {
  const result = await htmlToString(html`
    <span>${false}</span>
  `);
  assertEquals(result, "<span></span>");
});

Deno.test("html: renders nested html templates", async () => {
  const inner = html`
    <span>inner</span>
  `;
  const outer = html`
    <div>${inner}</div>
  `;
  const result = (await htmlToString(outer)).trim();
  assertEquals(result, "<div><span>inner</span></div>");
});

Deno.test("html: renders arrays of values", async () => {
  const items = ["a", "b", "c"];
  const result = (await htmlToString(
    html`
      <ul>${items.map((i) =>
        html`
          <li>${i}</li>
        `
      )}</ul>
    `,
  )).trim();
  assertEquals(result, "<ul><li>a</li><li>b</li><li>c</li></ul>");
});

Deno.test("raw: renders HTML without escaping", async () => {
  const rawHtml = raw("<strong>bold</strong>");
  const result = (await htmlToString(html`
    <div>${rawHtml}</div>
  `)).trim();
  assertEquals(result, "<div><strong>bold</strong></div>");
});

Deno.test("unsafeHTML: alias for raw works correctly", async () => {
  const rawHtml = unsafeHTML("<em>italic</em>");
  const result = (await htmlToString(html`
    <div>${rawHtml}</div>
  `)).trim();
  assertEquals(result, "<div><em>italic</em></div>");
});

Deno.test("html: handles promises", async () => {
  const asyncValue = Promise.resolve("async content");
  const result = (await htmlToString(html`
    <div>${asyncValue}</div>
  `)).trim();
  assertEquals(result, "<div>async content</div>");
});

Deno.test("html: handles functions", async () => {
  const fn = () => "from function";
  const result = (await htmlToString(html`
    <div>${fn}</div>
  `)).trim();
  assertEquals(result, "<div>from function</div>");
});

Deno.test("html: handles async functions", async () => {
  // deno-lint-ignore require-await
  const asyncFn = async () => "from async function";
  const result = (await htmlToString(html`
    <div>${asyncFn}</div>
  `)).trim();
  assertEquals(result, "<div>from async function</div>");
});

// =============================================================================
// formatTimeAgo Tests
// =============================================================================

Deno.test("formatTimeAgo: returns empty string for undefined", () => {
  assertEquals(formatTimeAgo(undefined), "");
});

Deno.test("formatTimeAgo: returns empty string for 0", () => {
  assertEquals(formatTimeAgo(0), "");
});

Deno.test("formatTimeAgo: returns 'just now' for recent times", () => {
  const now = Math.floor(Date.now() / 1000);
  assertEquals(formatTimeAgo(now), "just now");
  assertEquals(formatTimeAgo(now - 30), "just now");
  assertEquals(formatTimeAgo(now - 59), "just now");
});

Deno.test("formatTimeAgo: returns minutes ago", () => {
  const now = Math.floor(Date.now() / 1000);
  assertEquals(formatTimeAgo(now - 60), "1 minute ago");
  assertEquals(formatTimeAgo(now - 120), "2 minutes ago");
  assertEquals(formatTimeAgo(now - 59 * 60), "59 minutes ago");
});

Deno.test("formatTimeAgo: returns hours ago", () => {
  const now = Math.floor(Date.now() / 1000);
  assertEquals(formatTimeAgo(now - 60 * 60), "1 hour ago");
  assertEquals(formatTimeAgo(now - 2 * 60 * 60), "2 hours ago");
  assertEquals(formatTimeAgo(now - 23 * 60 * 60), "23 hours ago");
});

Deno.test("formatTimeAgo: returns days ago", () => {
  const now = Math.floor(Date.now() / 1000);
  assertEquals(formatTimeAgo(now - 24 * 60 * 60), "1 day ago");
  assertEquals(formatTimeAgo(now - 2 * 24 * 60 * 60), "2 days ago");
  assertEquals(formatTimeAgo(now - 29 * 24 * 60 * 60), "29 days ago");
});

Deno.test("formatTimeAgo: returns months ago", () => {
  const now = Math.floor(Date.now() / 1000);
  assertEquals(formatTimeAgo(now - 30 * 24 * 60 * 60), "1 month ago");
  assertEquals(formatTimeAgo(now - 60 * 24 * 60 * 60), "2 months ago");
  assertEquals(formatTimeAgo(now - 364 * 24 * 60 * 60), "12 months ago");
});

Deno.test("formatTimeAgo: returns years ago", () => {
  const now = Math.floor(Date.now() / 1000);
  assertEquals(formatTimeAgo(now - 365 * 24 * 60 * 60), "1 year ago");
  assertEquals(formatTimeAgo(now - 2 * 365 * 24 * 60 * 60), "2 years ago");
  assertEquals(formatTimeAgo(now - 10 * 365 * 24 * 60 * 60), "10 years ago");
});

Deno.test("formatTimeAgo: handles future times gracefully", () => {
  const now = Math.floor(Date.now() / 1000);
  // Future time should return "just now" due to Math.max(0, diff)
  assertEquals(formatTimeAgo(now + 1000), "just now");
});

// =============================================================================
// mapStoryToItem Tests
// =============================================================================

Deno.test("mapStoryToItem: returns null for null input", () => {
  assertEquals(mapStoryToItem(null as unknown as HNAPIItem), null);
});

Deno.test("mapStoryToItem: returns null for undefined input", () => {
  assertEquals(mapStoryToItem(undefined as unknown as HNAPIItem), null);
});

Deno.test("mapStoryToItem: returns null for missing id", () => {
  assertEquals(mapStoryToItem({ type: "link" } as HNAPIItem), null);
});

Deno.test("mapStoryToItem: returns null for non-numeric id", () => {
  assertEquals(mapStoryToItem({ id: "abc" as unknown as number, type: "link" } as HNAPIItem), null);
});

Deno.test("mapStoryToItem: returns null for missing type", () => {
  assertEquals(mapStoryToItem({ id: 123 } as HNAPIItem), null);
});

Deno.test("mapStoryToItem: maps minimal valid item", () => {
  const raw: HNAPIItem = { id: 123, type: "link" };
  const result = mapStoryToItem(raw);

  assertEquals(result?.id, 123);
  assertEquals(result?.type, "link");
  assertEquals(result?.title, "");
  assertEquals(result?.points, null);
  assertEquals(result?.user, null);
  assertEquals(result?.time, 0);
  assertEquals(result?.content, "");
  assertEquals(result?.comments, []);
  assertEquals(result?.level, 0);
  assertEquals(result?.comments_count, 0);
});

Deno.test("mapStoryToItem: maps full item correctly", () => {
  const raw: HNAPIItem = {
    id: 456,
    type: "ask",
    title: "Ask HN: Test",
    points: 100,
    user: "testuser",
    time: 1700000000,
    time_ago: "2 hours ago",
    content: "<p>Content here</p>",
    comments_count: 42,
    url: "https://example.com/page",
    domain: "example.com",
  };
  const result = mapStoryToItem(raw);

  assertEquals(result?.id, 456);
  assertEquals(result?.type, "ask");
  assertEquals(result?.title, "Ask HN: Test");
  assertEquals(result?.points, 100);
  assertEquals(result?.user, "testuser");
  assertEquals(result?.time, 1700000000);
  assertEquals(result?.time_ago, "2 hours ago");
  assertEquals(result?.content, "<p>Content here</p>");
  assertEquals(result?.comments_count, 42);
  assertEquals(result?.url, "https://example.com/page");
  assertEquals(result?.domain, "example.com");
});

Deno.test("mapStoryToItem: extracts domain from URL when not provided", () => {
  const raw: HNAPIItem = {
    id: 789,
    type: "link",
    url: "https://www.example.org/path/to/page",
  };
  const result = mapStoryToItem(raw);

  assertEquals(result?.domain, "example.org");
});

Deno.test("mapStoryToItem: drops relative HN discussion URLs", () => {
  const raw: HNAPIItem = {
    id: 321,
    type: "link",
    url: "item?id=321",
  };
  const result = mapStoryToItem(raw);

  assertEquals(result?.url, undefined);
});

Deno.test("mapStoryToItem: drops absolute HN discussion URLs", () => {
  const raw: HNAPIItem = {
    id: 654,
    type: "link",
    url: "https://news.ycombinator.com/item?id=654",
  };
  const result = mapStoryToItem(raw);

  assertEquals(result?.url, undefined);
});

Deno.test("mapStoryToItem: uses provided domain over extracted", () => {
  const raw: HNAPIItem = {
    id: 789,
    type: "link",
    url: "https://www.example.org/path",
    domain: "custom.domain",
  };
  const result = mapStoryToItem(raw);

  assertEquals(result?.domain, "custom.domain");
});

Deno.test("mapStoryToItem: preserves level parameter", () => {
  const raw: HNAPIItem = { id: 123, type: "comment" };
  const result = mapStoryToItem(raw, 3);

  assertEquals(result?.level, 3);
});

Deno.test("mapStoryToItem: generates time_ago when not provided", () => {
  const now = Math.floor(Date.now() / 1000);
  const raw: HNAPIItem = { id: 123, type: "link", time: now - 3600 };
  const result = mapStoryToItem(raw);

  assertEquals(result?.time_ago, "1 hour ago");
});

Deno.test("mapStoryToItem: preserves deleted flag", () => {
  const raw: HNAPIItem = { id: 123, type: "link", deleted: true };
  const result = mapStoryToItem(raw);

  assertEquals(result?.deleted, true);
});

Deno.test("mapStoryToItem: preserves dead flag", () => {
  const raw: HNAPIItem = { id: 123, type: "link", dead: true };
  const result = mapStoryToItem(raw);

  assertEquals(result?.dead, true);
});

// =============================================================================
// CSP Header Tests
// =============================================================================

Deno.test("buildContentSecurityPolicy: returns non-empty string", () => {
  const csp = buildContentSecurityPolicy();
  assertStrictEquals(typeof csp, "string");
  assertEquals(csp.length > 0, true);
});

Deno.test("buildContentSecurityPolicy: contains default-src", () => {
  const csp = buildContentSecurityPolicy();
  assertEquals(csp.includes("default-src"), true);
});

Deno.test("buildContentSecurityPolicy: contains frame-ancestors none", () => {
  const csp = buildContentSecurityPolicy();
  assertEquals(csp.includes("frame-ancestors 'none'"), true);
});

Deno.test("buildContentSecurityPolicy: contains object-src none", () => {
  const csp = buildContentSecurityPolicy();
  assertEquals(csp.includes("object-src 'none'"), true);
});

Deno.test("buildContentSecurityPolicy: contains upgrade-insecure-requests", () => {
  const csp = buildContentSecurityPolicy();
  assertEquals(csp.includes("upgrade-insecure-requests"), true);
});

Deno.test("buildContentSecurityPolicy: directives are semicolon-separated", () => {
  const csp = buildContentSecurityPolicy();
  assertEquals(csp.includes("; "), true);
});

// =============================================================================
// Handler Utility Tests
// =============================================================================

Deno.test("parsePositiveInt: returns null for undefined", () => {
  assertEquals(parsePositiveInt(undefined), null);
});

Deno.test("parsePositiveInt: returns null for empty string", () => {
  assertEquals(parsePositiveInt(""), null);
});

Deno.test("parsePositiveInt: returns null for non-numeric string", () => {
  assertEquals(parsePositiveInt("abc"), null);
});

Deno.test("parsePositiveInt: returns null for zero", () => {
  assertEquals(parsePositiveInt("0"), null);
});

Deno.test("parsePositiveInt: returns null for negative numbers", () => {
  assertEquals(parsePositiveInt("-1"), null);
});

Deno.test("parsePositiveInt: returns number for valid positive integer", () => {
  assertEquals(parsePositiveInt("1"), 1);
  assertEquals(parsePositiveInt("42"), 42);
  assertEquals(parsePositiveInt("100"), 100);
});

Deno.test("parsePositiveInt: returns integer part for floats", () => {
  assertEquals(parsePositiveInt("1.5"), 1); // parseInt behavior
});

Deno.test("redirect: creates 301 redirect by default", () => {
  const response = redirect("/test");
  assertEquals(response.status, 301);
  assertEquals(response.headers.get("Location"), "/test");
});

Deno.test("redirect: creates redirect with custom status", () => {
  const response = redirect("/test", 302);
  assertEquals(response.status, 302);
});

// =============================================================================
// mapApiUser Tests
// =============================================================================

import { mapApiUser } from "../netlify/edge-functions/lib/hn.ts";

Deno.test("mapApiUser: returns null for null input", () => {
  assertEquals(mapApiUser(null), null);
});

Deno.test("mapApiUser: returns null for user with no id", () => {
  assertEquals(mapApiUser({ id: "", created: 123, karma: 0 }), null);
});

Deno.test("mapApiUser: maps valid user correctly", () => {
  const raw = {
    id: "testuser",
    created: 1234567890,
    karma: 500,
    about: "Hello world",
    submitted: [123, 456, 789],
  };
  const result = mapApiUser(raw);
  assertStrictEquals(result?.id, "testuser");
  assertStrictEquals(result?.karma, 500);
  assertStrictEquals(result?.about, "Hello world");
  assertStrictEquals(result?.created, 1234567890);
  assertEquals(typeof result?.created_ago, "string");
  assertEquals(result?.submitted, [123, 456, 789]);
});

Deno.test("mapApiUser: handles missing about field", () => {
  const raw = {
    id: "testuser",
    created: 1234567890,
    karma: 100,
  };
  const result = mapApiUser(raw);
  assertEquals(result?.about, "");
  assertEquals(result?.submitted, []);
});

Deno.test("mapApiUser: handles missing karma as 0", () => {
  const raw = {
    id: "testuser",
    created: 1234567890,
    karma: undefined as unknown as number,
  };
  const result = mapApiUser(raw);
  assertEquals(result?.karma, 0);
  assertEquals(result?.submitted, []);
});

// =============================================================================
// Logger Tests
// =============================================================================

import { log } from "../netlify/edge-functions/lib/logger.ts";

Deno.test("log: info outputs JSON with correct fields", () => {
  const output: string[] = [];
  const origInfo = console.info;
  console.info = (msg: string) => output.push(msg);

  log.info("Test message", { foo: "bar" });

  console.info = origInfo;

  assertEquals(output.length, 1);
  const parsed = JSON.parse(output[0] ?? "");
  assertEquals(parsed.level, "info");
  assertEquals(parsed.message, "Test message");
  assertEquals(parsed.context.foo, "bar");
  assertEquals(typeof parsed.timestamp, "string");
});

Deno.test("log: error includes error details", () => {
  const output: string[] = [];
  const origError = console.error;
  console.error = (msg: string) => output.push(msg);

  log.error("Error occurred", {}, new Error("test error"));

  console.error = origError;

  const parsed = JSON.parse(output[0] ?? "");
  assertEquals(parsed.level, "error");
  assertEquals(parsed.error, "test error");
  assertEquals(typeof parsed.stack, "string");
});

Deno.test("log: warn outputs correct level", () => {
  const output: string[] = [];
  const origWarn = console.warn;
  console.warn = (msg: string) => output.push(msg);

  log.warn("Warning message", { key: "value" });

  console.warn = origWarn;

  const parsed = JSON.parse(output[0] ?? "");
  assertEquals(parsed.level, "warn");
  assertEquals(parsed.message, "Warning message");
});

Deno.test("log: debug outputs correct level", () => {
  const output: string[] = [];
  const origDebug = console.debug;
  console.debug = (msg: string) => output.push(msg);

  log.debug("Debug message");

  console.debug = origDebug;

  const parsed = JSON.parse(output[0] ?? "");
  assertEquals(parsed.level, "debug");
});

// =============================================================================
// Comment OP Highlighting Tests
// =============================================================================

import {
  commentsSection,
  countComments,
  estimateReadingTime,
  keyboardNavScript,
  renderComment,
  userLink,
} from "../netlify/edge-functions/lib/render/components.ts";
import type { HNAPIItem as CommentItem } from "../netlify/edge-functions/lib/hn.ts";

Deno.test("userLink: creates link to user profile", async () => {
  const result = await htmlToString(userLink("testuser"));
  assertEquals(result.includes('href="/user/testuser"'), true);
  assertEquals(result.includes("testuser</a>"), true);
  assertEquals(result.includes('class="user-link"'), true);
});

Deno.test("userLink: escapes username in href and content", async () => {
  const result = await htmlToString(userLink("user<script>"));
  assertEquals(result.includes("<script>"), false);
  assertEquals(result.includes("&lt;script&gt;"), true);
});

Deno.test("keyboardNavScript: includes shortcuts modal markup", async () => {
  const result = await htmlToString(keyboardNavScript());
  assertEquals(result.includes("shortcuts-modal"), true);
  assertEquals(result.includes("Keyboard Shortcuts"), true);
});

Deno.test("keyboardNavScript: documents j/k shortcut keys", async () => {
  const result = await htmlToString(keyboardNavScript());
  assertEquals(result.includes("<kbd>j</kbd>"), true);
  assertEquals(result.includes("<kbd>k</kbd>"), true);
  assertEquals(result.includes("Next item"), true);
  assertEquals(result.includes("Previous item"), true);
});

Deno.test("renderComment: links username to profile", async () => {
  const comment: CommentItem = {
    id: 1,
    type: "comment",
    user: "alice",
    time_ago: "1 hour ago",
    content: "Test comment",
    comments: [],
  };

  const result = await htmlToString(renderComment(comment, 0, undefined));
  assertEquals(result.includes('href="/user/alice"'), true);
});

Deno.test("renderComment: adds OP badge when user matches opUser", async () => {
  const comment: CommentItem = {
    id: 1,
    type: "comment",
    user: "alice",
    time_ago: "1 hour ago",
    content: "Test comment",
    comments: [],
  };

  const result = await htmlToString(renderComment(comment, 0, "alice"));

  // Check for OP badge and is-op class
  assertEquals(result.includes("is-op"), true);
  assertEquals(result.includes("OP</abbr>"), true);
  assertEquals(result.includes('title="Original Poster"'), true);
});

Deno.test("renderComment: no OP badge when user doesn't match opUser", async () => {
  const comment: CommentItem = {
    id: 1,
    type: "comment",
    user: "bob",
    time_ago: "1 hour ago",
    content: "Test comment",
    comments: [],
  };

  const result = await htmlToString(renderComment(comment, 0, "alice"));

  assertEquals(result.includes("is-op"), false);
  assertEquals(result.includes("OP</abbr>"), false);
});

Deno.test("renderComment: no OP badge when opUser undefined", async () => {
  const comment: CommentItem = {
    id: 1,
    type: "comment",
    user: "alice",
    time_ago: "1 hour ago",
    content: "Test comment",
    comments: [],
  };

  const result = await htmlToString(renderComment(comment, 0, undefined));

  assertEquals(result.includes("is-op"), false);
});

Deno.test("commentsSection: passes opUser to nested comments", async () => {
  const comments: CommentItem[] = [{
    id: 1,
    type: "comment",
    user: "alice",
    time_ago: "1 hour ago",
    content: "Parent",
    comments: [{
      id: 2,
      type: "comment",
      user: "alice",
      time_ago: "30 min ago",
      content: "Reply",
      comments: [],
    }],
  }];

  const result = await htmlToString(commentsSection(comments, "alice"));

  // Both comments from alice should have OP badge
  const matches = result.match(/is-op/g);
  assertEquals(matches?.length, 2);
});

// =============================================================================
// Config Constants Tests
// =============================================================================

import {
  CIRCUIT_BREAKER_RESET_MS,
  CIRCUIT_BREAKER_THRESHOLD,
  MAX_ITEM_ID,
  MAX_PAGE_NUMBER,
  USER_STALE_SECONDS,
  USER_TTL_SECONDS,
} from "../netlify/edge-functions/lib/config.ts";

Deno.test("config: MAX_ITEM_ID is reasonable", () => {
  assertEquals(MAX_ITEM_ID, 100_000_000);
});

Deno.test("config: MAX_PAGE_NUMBER is reasonable", () => {
  assertEquals(MAX_PAGE_NUMBER, 100);
});

Deno.test("config: user caching constants exist", () => {
  assertEquals(typeof USER_TTL_SECONDS, "number");
  assertEquals(typeof USER_STALE_SECONDS, "number");
  assertEquals(USER_TTL_SECONDS > 0, true);
  assertEquals(USER_STALE_SECONDS > USER_TTL_SECONDS, true);
});

Deno.test("config: circuit breaker constants exist", () => {
  assertEquals(typeof CIRCUIT_BREAKER_THRESHOLD, "number");
  assertEquals(typeof CIRCUIT_BREAKER_RESET_MS, "number");
  assertEquals(CIRCUIT_BREAKER_THRESHOLD > 0, true);
  assertEquals(CIRCUIT_BREAKER_RESET_MS > 0, true);
});

// =============================================================================
// countComments Tests
// =============================================================================

Deno.test("countComments: returns 0 for undefined", () => {
  assertEquals(countComments(undefined), 0);
});

Deno.test("countComments: returns 0 for empty array", () => {
  assertEquals(countComments([]), 0);
});

Deno.test("countComments: counts flat comments correctly", () => {
  const comments = [
    { id: 1, content: "comment 1", comments: [], type: "comment" },
    { id: 2, content: "comment 2", comments: [], type: "comment" },
    { id: 3, content: "comment 3", comments: [], type: "comment" },
  ] as CommentItem[];
  assertEquals(countComments(comments), 3);
});

Deno.test("countComments: counts nested comments recursively", () => {
  const comments = [
    {
      id: 1,
      content: "parent",
      type: "comment",
      comments: [
        { id: 2, content: "child", comments: [], type: "comment" },
        {
          id: 3,
          content: "child 2",
          type: "comment",
          comments: [
            { id: 4, content: "grandchild", comments: [], type: "comment" },
          ],
        },
      ],
    },
  ] as CommentItem[];
  assertEquals(countComments(comments), 4);
});

Deno.test("countComments: excludes comments with empty content", () => {
  const comments = [
    { id: 1, content: "has content", comments: [], type: "comment" },
    { id: 2, content: "", comments: [], type: "comment" },
    { id: 3, content: "   ", comments: [], type: "comment" },
  ] as CommentItem[];
  assertEquals(countComments(comments), 1);
});

// =============================================================================
// estimateReadingTime Tests
// =============================================================================

Deno.test("estimateReadingTime: returns 0 for undefined", () => {
  assertEquals(estimateReadingTime(undefined), 0);
});

Deno.test("estimateReadingTime: returns 0 for empty string", () => {
  assertEquals(estimateReadingTime(""), 0);
});

Deno.test("estimateReadingTime: returns 1 min for short text", () => {
  assertEquals(estimateReadingTime("Hello world"), 1);
});

Deno.test("estimateReadingTime: calculates correctly for longer text", () => {
  // 200 words should be 1 minute
  const words = Array(200).fill("word").join(" ");
  assertEquals(estimateReadingTime(words), 1);

  // 400 words should be 2 minutes
  const words400 = Array(400).fill("word").join(" ");
  assertEquals(estimateReadingTime(words400), 2);
});

Deno.test("estimateReadingTime: strips HTML tags", () => {
  const html = "<p>Hello <strong>world</strong> this is <a href='#'>a test</a></p>";
  const result = estimateReadingTime(html);
  assertEquals(result, 1);
});

// =============================================================================
// keyboardNavScript ARIA and Modal Tests
// =============================================================================

Deno.test("keyboardNavScript: includes ARIA live region", async () => {
  const result = await htmlToString(keyboardNavScript());
  assertEquals(result.includes('id="aria-live"'), true);
  assertEquals(result.includes('aria-live="polite"'), true);
});

Deno.test("keyboardNavScript: includes shortcuts modal", async () => {
  const result = await htmlToString(keyboardNavScript());
  assertEquals(result.includes('id="shortcuts-modal"'), true);
  assertEquals(result.includes("Keyboard Shortcuts"), true);
});

// Note: keyboardNavScript now uses Popover API instead of dialog, with JS logic in external app.js
// These tests verify the popover HTML is properly generated

Deno.test("keyboardNavScript: modal has proper close button", async () => {
  const result = await htmlToString(keyboardNavScript());
  assertEquals(result.includes('aria-label="Close"'), true);
  assertEquals(result.includes('popovertargetaction="hide"'), true);
});

Deno.test("keyboardNavScript: modal includes all shortcut descriptions", async () => {
  const result = await htmlToString(keyboardNavScript());
  assertEquals(result.includes("Next item"), true);
  assertEquals(result.includes("Previous item"), true);
  assertEquals(result.includes("Open selected item"), true);
  assertEquals(result.includes("Show this help"), true);
});

// =============================================================================
// PWA Component Tests
// =============================================================================

Deno.test("pwaHeadTags: includes manifest link", async () => {
  const result = await htmlToString(pwaHeadTags());
  assertEquals(result.includes('rel="manifest"'), true);
  assertEquals(result.includes("/manifest.json"), true);
});

Deno.test("pwaHeadTags: includes apple-touch-icon", async () => {
  const result = await htmlToString(pwaHeadTags());
  assertEquals(result.includes('rel="apple-touch-icon"'), true);
});

Deno.test("pwaHeadTags: includes theme-color for both colour schemes", async () => {
  const result = await htmlToString(pwaHeadTags());
  assertEquals(result.includes('name="theme-color"'), true);
  // Paired to the OS preference, and matching --background at the page edges
  // rather than the brand accent, which appears nowhere near the address bar.
  assertEquals(result.includes('content="#f5f5f5" media="(prefers-color-scheme: light)"'), true);
  assertEquals(result.includes('content="#0d1117" media="(prefers-color-scheme: dark)"'), true);
});

Deno.test("pwaHeadTags: declares the supported colour schemes", async () => {
  const result = await htmlToString(pwaHeadTags());
  assertEquals(result.includes('name="color-scheme" content="light dark"'), true);
});

// =============================================================================
// Circuit Breaker Tests
// =============================================================================

import { getCircuitBreakerState, resetCircuitBreaker } from "../netlify/edge-functions/lib/hn.ts";

Deno.test("circuit breaker: initial state is closed", () => {
  resetCircuitBreaker();
  const state = getCircuitBreakerState();
  assertEquals(state.isOpen, false);
  assertEquals(state.failures, 0);
});

Deno.test("circuit breaker: reset clears state", () => {
  resetCircuitBreaker();
  const state = getCircuitBreakerState();
  assertEquals(state.isOpen, false);
  assertEquals(state.failures, 0);
});

// =============================================================================
// Routes Module Tests
// =============================================================================

import {
  feedUrl,
  isValidItemId,
  isValidPageNumber,
  isValidUsername,
  itemUrl,
  matchFeedRoute,
  matchItemRoute,
  matchRedirect,
  matchUserRoute,
  userUrl,
} from "../netlify/edge-functions/lib/routes.ts";

Deno.test("matchFeedRoute: matches valid feed routes", () => {
  const result = matchFeedRoute("/top/1");
  assertEquals(result?.feed, "top");
  assertEquals(result?.page, 1);
});

Deno.test("matchFeedRoute: matches all feed types", () => {
  assertEquals(matchFeedRoute("/top/1")?.feed, "top");
  assertEquals(matchFeedRoute("/newest/1")?.feed, "newest");
  assertEquals(matchFeedRoute("/ask/1")?.feed, "ask");
  assertEquals(matchFeedRoute("/show/1")?.feed, "show");
  assertEquals(matchFeedRoute("/jobs/1")?.feed, "jobs");
});

Deno.test("matchFeedRoute: handles multi-digit pages", () => {
  const result = matchFeedRoute("/top/42");
  assertEquals(result?.page, 42);
});

Deno.test("matchFeedRoute: returns null for invalid routes", () => {
  assertEquals(matchFeedRoute("/invalid/1"), null);
  assertEquals(matchFeedRoute("/top"), null);
  assertEquals(matchFeedRoute("/top/"), null);
  assertEquals(matchFeedRoute("/top/abc"), null);
});

Deno.test("matchItemRoute: matches valid item routes", () => {
  const result = matchItemRoute("/item/12345");
  assertEquals(result?.id, 12345);
});

Deno.test("matchItemRoute: returns null for invalid routes", () => {
  assertEquals(matchItemRoute("/item"), null);
  assertEquals(matchItemRoute("/item/"), null);
  assertEquals(matchItemRoute("/item/abc"), null);
  assertEquals(matchItemRoute("/items/123"), null);
});

Deno.test("matchUserRoute: matches valid user routes", () => {
  const result = matchUserRoute("/user/dang");
  assertEquals(result?.username, "dang");
});

Deno.test("matchUserRoute: handles usernames with underscores and hyphens", () => {
  assertEquals(matchUserRoute("/user/test_user")?.username, "test_user");
  assertEquals(matchUserRoute("/user/test-user")?.username, "test-user");
});

Deno.test("matchUserRoute: returns null for invalid routes", () => {
  assertEquals(matchUserRoute("/user"), null);
  assertEquals(matchUserRoute("/user/"), null);
  assertEquals(matchUserRoute("/users/test"), null);
});

Deno.test("matchRedirect: matches root path", () => {
  const result = matchRedirect("/");
  assertEquals(result?.location, "/top/1");
  assertEquals(result?.status, 301);
});

Deno.test("matchRedirect: matches feed roots", () => {
  assertEquals(matchRedirect("/top")?.location, "/top/1");
  assertEquals(matchRedirect("/newest")?.location, "/newest/1");
  assertEquals(matchRedirect("/ask")?.location, "/ask/1");
  assertEquals(matchRedirect("/show")?.location, "/show/1");
  assertEquals(matchRedirect("/jobs")?.location, "/jobs/1");
});

Deno.test("matchRedirect: returns null for non-redirect paths", () => {
  assertEquals(matchRedirect("/top/1"), null);
  assertEquals(matchRedirect("/item/123"), null);
});

Deno.test("feedUrl: generates correct URLs", () => {
  assertEquals(feedUrl("top", 1), "/top/1");
  assertEquals(feedUrl("newest", 42), "/newest/42");
});

Deno.test("itemUrl: generates correct URLs", () => {
  assertEquals(itemUrl(12345), "/item/12345");
});

Deno.test("userUrl: generates correct URLs", () => {
  assertEquals(userUrl("dang"), "/user/dang");
});

Deno.test("userUrl: encodes special characters", () => {
  assertEquals(userUrl("test user"), "/user/test%20user");
});

Deno.test("isValidUsername: accepts valid usernames", () => {
  assertEquals(isValidUsername("dang"), true);
  assertEquals(isValidUsername("test_user"), true);
  assertEquals(isValidUsername("test-user"), true);
  assertEquals(isValidUsername("a"), true);
  assertEquals(isValidUsername("123456789012345"), true);
});

Deno.test("isValidUsername: rejects invalid usernames", () => {
  assertEquals(isValidUsername(""), false);
  assertEquals(isValidUsername("1234567890123456"), false); // 16 chars
  assertEquals(isValidUsername("user@example"), false);
  assertEquals(isValidUsername("user.name"), false);
});

Deno.test("isValidPageNumber: validates page numbers", () => {
  assertEquals(isValidPageNumber(1, 100), true);
  assertEquals(isValidPageNumber(50, 100), true);
  assertEquals(isValidPageNumber(100, 100), true);
  assertEquals(isValidPageNumber(0, 100), false);
  assertEquals(isValidPageNumber(-1, 100), false);
  assertEquals(isValidPageNumber(101, 100), false);
  assertEquals(isValidPageNumber(NaN, 100), false);
  assertEquals(isValidPageNumber(Infinity, 100), false);
});

Deno.test("isValidItemId: validates item IDs", () => {
  assertEquals(isValidItemId(1, 100000000), true);
  assertEquals(isValidItemId(12345678, 100000000), true);
  assertEquals(isValidItemId(0, 100000000), false);
  assertEquals(isValidItemId(-1, 100000000), false);
  assertEquals(isValidItemId(100000001, 100000000), false);
});

// =============================================================================
// Error Types Tests
// =============================================================================

import {
  APIUnavailableError,
  CircuitBreakerOpenError,
  isNFHNError,
  NFHNError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  toNFHNError,
  ValidationError,
} from "../netlify/edge-functions/lib/errors/types.ts";

Deno.test("NFHNError: creates error with all properties", () => {
  const error = new NFHNError("test", 500, "Title", "Description", true, "req-123");
  assertEquals(error.message, "test");
  assertEquals(error.statusCode, 500);
  assertEquals(error.title, "Title");
  assertEquals(error.description, "Description");
  assertEquals(error.recoverable, true);
  assertEquals(error.requestId, "req-123");
});

Deno.test("NotFoundError: creates 404 error for item", () => {
  const error = new NotFoundError("item");
  assertEquals(error.statusCode, 404);
  assertEquals(error.title, "Item not found");
});

Deno.test("NotFoundError: creates 404 error for user", () => {
  const error = new NotFoundError("user", "Username is invalid");
  assertEquals(error.statusCode, 404);
  assertEquals(error.title, "User not found");
  assertEquals(error.description, "Username is invalid");
});

Deno.test("ValidationError: creates 400 error", () => {
  const error = new ValidationError("page", "abc", "Page must be a number");
  assertEquals(error.statusCode, 400);
  assertEquals(error.field, "page");
  assertEquals(error.value, "abc");
});

Deno.test("APIUnavailableError: creates 502 error", () => {
  const cause = new Error("connection refused");
  const error = new APIUnavailableError("/item/123", cause);
  assertEquals(error.statusCode, 502);
  assertEquals(error.endpoint, "/item/123");
  assertEquals(error.originalError, cause);
  assertEquals(error.recoverable, true);
});

Deno.test("RateLimitError: creates 429 error", () => {
  const error = new RateLimitError(30);
  assertEquals(error.statusCode, 429);
  assertEquals(error.retryAfter, 30);
});

Deno.test("CircuitBreakerOpenError: creates 503 error", () => {
  const error = new CircuitBreakerOpenError(30000);
  assertEquals(error.statusCode, 503);
  assertEquals(error.resetAfterMs, 30000);
});

Deno.test("TimeoutError: creates 504 error", () => {
  const error = new TimeoutError("fetch", 5000);
  assertEquals(error.statusCode, 504);
  assertEquals(error.timeoutMs, 5000);
  assertEquals(error.operation, "fetch");
});

Deno.test("isNFHNError: identifies NFHN errors", () => {
  assertEquals(isNFHNError(new NFHNError("test", 500, "T", "D")), true);
  assertEquals(isNFHNError(new NotFoundError("item")), true);
  assertEquals(isNFHNError(new Error("test")), false);
  assertEquals(isNFHNError("string"), false);
  assertEquals(isNFHNError(null), false);
});

Deno.test("toNFHNError: returns existing NFHN errors unchanged", () => {
  const error = new NotFoundError("item");
  assertEquals(toNFHNError(error), error);
});

Deno.test("toNFHNError: wraps regular errors", () => {
  const error = new Error("Something broke");
  const wrapped = toNFHNError(error);
  assertEquals(wrapped.statusCode, 500);
  assertEquals(wrapped.message, "Something broke");
});

Deno.test("toNFHNError: wraps string errors", () => {
  const wrapped = toNFHNError("oops");
  assertEquals(wrapped.statusCode, 500);
  assertEquals(wrapped.message, "oops");
});

// =============================================================================
// Additional HTML Template Edge Cases
// =============================================================================

Deno.test("html: handles deeply nested templates", async () => {
  const level3 = html`
    <span>deep</span>
  `;
  const level2 = html`
    <div>${level3}</div>
  `;
  const level1 = html`
    <section>${level2}</section>
  `;
  const result = (await htmlToString(level1)).trim();
  assertEquals(result, "<section><div><span>deep</span></div></section>");
});

Deno.test("html: handles mixed arrays and templates", async () => {
  const items = [1, 2, 3];
  const result = (await htmlToString(html`
    <ul>${items.map((n) =>
      html`
        <li>${n}</li>
      `
    )}</ul>
  `)).trim();
  assertEquals(result, "<ul><li>1</li><li>2</li><li>3</li></ul>");
});

Deno.test("html: handles conditional rendering", async () => {
  const showContent = true;
  const hideContent = false;
  const result = (await htmlToString(html`
    <div>${showContent
      ? html`
        <span>visible</span>
      `
      : ""}</div>
    <div>${hideContent
      ? html`
        <span>hidden</span>
      `
      : ""}</div>
  `)).trim();
  assertEquals(result.includes("visible"), true);
  assertEquals(result.includes("hidden"), false);
});

Deno.test("escape: handles unicode characters", () => {
  assertEquals(escape("Hello 👋 World 🌍"), "Hello 👋 World 🌍");
});

Deno.test("escape: handles newlines and tabs", () => {
  assertEquals(escape("line1\nline2\ttab"), "line1\nline2\ttab");
});

// =============================================================================
// Compression Dictionary Transport (RFC 9842)
// =============================================================================

import {
  applyDictionaryVary,
  canServeDictionaryDelta,
  DCZ_HEADER_LENGTH,
  DCZ_MAGIC,
  digestsMatch,
  formatAvailableDictionary,
  frameDcz,
  parseAvailableDictionary,
  parseDczHeader,
  sha256,
  useAsDictionaryHeader,
} from "../netlify/edge-functions/lib/dictionary.ts";

Deno.test("dcz framing matches the wire format in RFC 9842 4.2", async () => {
  const dictionary = new TextEncoder().encode("a shared HTML shell");
  const hash = await sha256(dictionary);
  const frame = new Uint8Array([1, 2, 3, 4, 5]);

  const stream = frameDcz(hash, frame);

  // 8 magic bytes + 32-byte SHA-256 + the zstd frame.
  assertEquals(stream.length, DCZ_HEADER_LENGTH + frame.length);
  assertEquals(Array.from(stream.slice(0, 8)), Array.from(DCZ_MAGIC));
  assertEquals(Array.from(stream.slice(8, 40)), Array.from(hash));
  assertEquals(Array.from(stream.slice(40)), Array.from(frame));
});

Deno.test("dcz framing round-trips its dictionary hash", async () => {
  const hash = await sha256(new TextEncoder().encode("dictionary"));
  const parsed = parseDczHeader(frameDcz(hash, new Uint8Array([9, 9])));
  assertEquals(parsed === null, false);
  assertEquals(Array.from(parsed!), Array.from(hash));
});

Deno.test("parseDczHeader rejects streams that are not dcz", () => {
  assertEquals(parseDczHeader(new Uint8Array(10)), null);
  // Right length, wrong magic - a plain zstd frame must not be mistaken for dcz.
  const wrongMagic = new Uint8Array(DCZ_HEADER_LENGTH + 1);
  wrongMagic.set([0x28, 0xb5, 0x2f, 0xfd], 0);
  assertEquals(parseDczHeader(wrongMagic), null);
});

Deno.test("frameDcz refuses a hash that is not a SHA-256", async () => {
  await Promise.resolve();
  assertThrows(() => frameDcz(new Uint8Array(16), new Uint8Array(1)));
});

Deno.test("Available-Dictionary round-trips through the structured field encoding", async () => {
  const hash = await sha256(new TextEncoder().encode("shell-v1"));
  const header = formatAvailableDictionary(hash);

  // Structured Field Byte Sequence: base64 wrapped in colons.
  assertEquals(header.startsWith(":"), true);
  assertEquals(header.endsWith(":"), true);
  assertEquals(Array.from(parseAvailableDictionary(header)!), Array.from(hash));
});

Deno.test("parseAvailableDictionary rejects malformed values", () => {
  assertEquals(parseAvailableDictionary(null), null);
  assertEquals(parseAvailableDictionary(""), null);
  assertEquals(parseAvailableDictionary("no-colons"), null);
  assertEquals(parseAvailableDictionary(":not base64!:"), null);
  // Valid base64, but not 32 bytes: not a SHA-256, so not usable.
  assertEquals(parseAvailableDictionary(":" + btoa("short") + ":"), null);
});

Deno.test("digestsMatch compares full length and handles nulls", async () => {
  const a = await sha256(new TextEncoder().encode("a"));
  const b = await sha256(new TextEncoder().encode("b"));

  assertEquals(digestsMatch(a, a), true);
  assertEquals(digestsMatch(a, b), false);
  assertEquals(digestsMatch(a, null), false);
  assertEquals(digestsMatch(null, null), false);
  assertEquals(digestsMatch(a, a.slice(0, 16)), false);
});

Deno.test("Use-As-Dictionary is built to the header grammar", () => {
  assertEquals(
    useAsDictionaryHeader({ match: "/top/*" }),
    'match="/top/*"',
  );
  assertEquals(
    useAsDictionaryHeader({
      match: "/(top|newest)/*",
      matchDest: ["document"],
      id: "shell-v1",
    }),
    'match="/(top|newest)/*", match-dest=("document"), id="shell-v1"',
  );
});

Deno.test("dictionary responses vary on both the CDN and downstream caches", () => {
  const headers = new Headers();
  applyDictionaryVary(headers);

  // Omitting Vary poisons shared caches with bodies they cannot decode.
  assertStringIncludes(headers.get("Vary")!, "Accept-Encoding");
  assertStringIncludes(headers.get("Vary")!, "Available-Dictionary");
  // Netlify-Vary keys Netlify's own cache, which Vary alone does not.
  assertEquals(headers.get("Netlify-Vary"), "header=Available-Dictionary");
});

Deno.test("applyDictionaryVary preserves an existing Vary without duplicating", () => {
  const headers = new Headers({ Vary: "Accept-Encoding" });
  applyDictionaryVary(headers);
  assertEquals(headers.get("Vary"), "Accept-Encoding, Available-Dictionary");
});

Deno.test("dictionary negotiation accepts a client holding our dictionary", async () => {
  const hash = await sha256(new TextEncoder().encode("shell-v1"));
  const request = new Request("https://nfhn.test/top/1", {
    headers: {
      "Accept-Encoding": "dcz, zstd, br",
      "Available-Dictionary": formatAvailableDictionary(hash),
    },
  });

  assertEquals(canServeDictionaryDelta(request, hash), true);
});

Deno.test("dictionary negotiation declines anything it cannot serve safely", async () => {
  const ours = await sha256(new TextEncoder().encode("shell-v1"));
  const theirs = await sha256(new TextEncoder().encode("some-other-dictionary"));

  const withHeaders = (headers: Record<string, string>) =>
    new Request("https://nfhn.test/top/1", { headers });

  // Client holds a different dictionary: compressing against ours would produce
  // a body it cannot decode.
  assertEquals(
    canServeDictionaryDelta(
      withHeaders({
        "Accept-Encoding": "dcz",
        "Available-Dictionary": formatAvailableDictionary(theirs),
      }),
      ours,
    ),
    false,
  );

  // Client did not offer dcz in Accept-Encoding.
  assertEquals(
    canServeDictionaryDelta(
      withHeaders({
        "Accept-Encoding": "br, gzip",
        "Available-Dictionary": formatAvailableDictionary(ours),
      }),
      ours,
    ),
    false,
  );

  // No dictionary advertised at all - the common case for a first visit.
  assertEquals(
    canServeDictionaryDelta(withHeaders({ "Accept-Encoding": "dcz" }), ours),
    false,
  );

  // `dczx` must not match `dcz` on a prefix.
  assertEquals(
    canServeDictionaryDelta(
      withHeaders({
        "Accept-Encoding": "dczx",
        "Available-Dictionary": formatAvailableDictionary(ours),
      }),
      ours,
    ),
    false,
  );
});

// =============================================================================
// Open Graph cards and icon generation
// =============================================================================

import { renderCard, wrapTitle } from "../netlify/edge-functions/og.ts";
import { buildMaskableIcon, MASKABLE_BACKGROUND, SAFE_ZONE_SCALE } from "../scripts/icons.ts";

Deno.test("wrapTitle keeps short titles on one line", () => {
  assertEquals(wrapTitle("Show HN: A tiny thing"), ["Show HN: A tiny thing"]);
});

Deno.test("wrapTitle wraps long titles and ellipsizes only when truncating", () => {
  const long = "A ".repeat(200).trim();
  const lines = wrapTitle(long);
  assertEquals(lines.length, 4);
  assertEquals(lines[3]!.endsWith("…"), true);

  // A title that fits exactly must not gain a misleading ellipsis.
  const fits = wrapTitle("one two three four five six");
  assertEquals(fits.join("").includes("…"), false);
});

Deno.test("wrapTitle handles CJK titles without a whitespace split", () => {
  // No spaces at all: a naive split would produce one unbreakable line.
  const lines = wrapTitle("設計とプログラミングについての長い記事のタイトルです".repeat(3));
  assertEquals(lines.length > 1, true);
});

Deno.test("renderCard escapes story text into the SVG", () => {
  const svg = renderCard({
    title: 'Bobby <script>alert("xss")</script> Tables',
    points: 1,
    user: "a&b",
    comments: 2,
    domain: "example.com",
  });

  // The card is served as image/svg+xml, which browsers parse as markup.
  assertEquals(svg.includes("<script>"), false);
  assertStringIncludes(svg, "&lt;script&gt;");
  assertStringIncludes(svg, "a&amp;b");
});

Deno.test("renderCard uses the 1.91:1 dimensions platforms crop to", () => {
  const svg = renderCard({ title: "T", points: 0, user: null, comments: 0, domain: null });
  assertStringIncludes(svg, 'width="1200"');
  assertStringIncludes(svg, 'height="630"');
  // Singular/plural agreement on zero counts.
  assertStringIncludes(svg, "0 points");
  assertStringIncludes(svg, "0 comments");
});

Deno.test("buildMaskableIcon insets the artwork and adds an opaque backdrop", () => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">' +
    '<path d="M0 0h10v10z"/></svg>';
  const out = buildMaskableIcon(source);

  // The manifest's previous "any maskable" claim failed on both counts: no safe
  // zone, and transparent behind the artwork.
  assertStringIncludes(out, `fill="${MASKABLE_BACKGROUND}"`);
  assertStringIncludes(out, `scale(${SAFE_ZONE_SCALE})`);
  assertStringIncludes(out, "translate(40 40)");
  // Source artwork is carried through untouched, so the two cannot diverge.
  assertStringIncludes(out, '<path d="M0 0h10v10z"/>');
});

Deno.test("buildMaskableIcon rejects a source that is not an SVG document", () => {
  assertThrows(() => buildMaskableIcon("not an svg"));
});

Deno.test("manifest separates the maskable icon from the plain one", async () => {
  const manifest = JSON.parse(
    await Deno.readTextFile(new URL("../static/manifest.json", import.meta.url)),
  );

  const purposes = manifest.icons.map((icon: { purpose: string }) => icon.purpose);
  // Declaring "any maskable" on artwork with no safe zone is a false claim; the
  // two purposes now point at two different files.
  assertEquals(purposes.includes("any maskable"), false);
  assertEquals(purposes.includes("maskable"), true);
  assertEquals(purposes.includes("any"), true);
});

// =============================================================================
// Dictionary compression, end to end
// =============================================================================

import { createDCtx, decompressUsingDict, init as zstdInit } from "@bokuweb/zstd-wasm";
import { compressWithDictionary } from "../netlify/edge-functions/lib/zstd.ts";
import { getShellDictionary } from "../netlify/edge-functions/lib/shell-dictionary.ts";
import { encodeWithDictionary } from "../netlify/edge-functions/lib/dictionary.ts";

Deno.test("a dcz response decodes back to the exact original bytes", async () => {
  // The test that matters: everything else is a header contract, but if this
  // fails, real browsers get an undecodable body.
  await zstdInit();
  const dictionary = await getShellDictionary();

  const page = new TextEncoder().encode(
    '<!DOCTYPE html><html lang="en" data-theme="auto"><head><meta charset="UTF-8">' +
      '<title>HN: Page 2</title></head><body><ol class="stories">' +
      '<li data-story-id="123"><a class="title">A story</a></li></ol></body></html>',
  );

  const frame = await compressWithDictionary(page, dictionary.bytes);
  const stream = frameDcz(dictionary.hash, frame);

  // Framing is what the browser reads first.
  assertEquals(Array.from(stream.slice(0, 8)), Array.from(DCZ_MAGIC));
  assertEquals(Array.from(parseDczHeader(stream)!), Array.from(dictionary.hash));

  // And the payload after the 40-byte header must decode against that same
  // dictionary, which is exactly what the browser will do.
  const decoded = decompressUsingDict(
    createDCtx(),
    stream.slice(DCZ_HEADER_LENGTH),
    dictionary.bytes,
  );
  assertEquals(new TextDecoder().decode(decoded), new TextDecoder().decode(page));
});

Deno.test("the shell dictionary is deterministic across calls", async () => {
  // Every isolate in every region must derive byte-identical dictionary content,
  // or the hash the browser holds will not match the one we compress against.
  const a = await getShellDictionary();
  const b = await getShellDictionary();
  assertEquals(Array.from(a.hash), Array.from(b.hash));
  assertEquals(a.bytes.length, b.bytes.length);

  // And the hash must actually be the hash of the served bytes.
  assertEquals(Array.from(await sha256(a.bytes)), Array.from(a.hash));
});

Deno.test("the shell dictionary makes a feed page dramatically smaller", async () => {
  const dictionary = await getShellDictionary();
  // A page of the same shape as the dictionary, which is the real case: /top/2
  // differs from /top/1 only in the story rows.
  const page = dictionary.bytes;

  const withDict = await compressWithDictionary(page, dictionary.bytes);

  // Sanity floor rather than a brittle exact number: if a delta against a
  // near-identical dictionary is not at least 20x smaller, something is wrong
  // with how the dictionary is being applied.
  assertEquals(
    withDict.length * 20 < page.length,
    true,
    `expected a large delta, got ${withDict.length} bytes from ${page.length}`,
  );
});

Deno.test("encodeWithDictionary leaves responses alone when it cannot help", async () => {
  const plain = "<!DOCTYPE html><html><body>hello</body></html>";

  // No Available-Dictionary: the overwhelmingly common case, and the one where
  // an accidental encode would break the page.
  const bare = new Request("https://nfhn.test/top/1", {
    headers: { "Accept-Encoding": "dcz" },
  });
  const untouched = await encodeWithDictionary(bare, new Response(plain, { status: 200 }));
  assertEquals(untouched.headers.get("Content-Encoding"), null);
  assertEquals(await untouched.text(), plain);

  // Already-encoded bodies must never be double-wrapped.
  const dictionary = await getShellDictionary();
  const negotiated = new Request("https://nfhn.test/top/1", {
    headers: {
      "Accept-Encoding": "dcz",
      "Available-Dictionary": formatAvailableDictionary(dictionary.hash),
    },
  });
  const preEncoded = await encodeWithDictionary(
    negotiated,
    new Response(plain, { status: 200, headers: { "Content-Encoding": "br" } }),
  );
  assertEquals(preEncoded.headers.get("Content-Encoding"), "br");

  // Error pages are not worth the CPU.
  const errorPage = await encodeWithDictionary(
    negotiated,
    new Response(plain, { status: 500 }),
  );
  assertEquals(errorPage.headers.get("Content-Encoding"), null);
});

Deno.test("encodeWithDictionary emits dcz and the Vary pair when negotiated", async () => {
  const dictionary = await getShellDictionary();
  const request = new Request("https://nfhn.test/top/1", {
    headers: {
      "Accept-Encoding": "dcz",
      "Available-Dictionary": formatAvailableDictionary(dictionary.hash),
    },
  });

  const encoded = await encodeWithDictionary(
    request,
    new Response(new TextDecoder().decode(dictionary.bytes), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  );

  assertEquals(encoded.headers.get("Content-Encoding"), "dcz");
  // Content-Length would describe the pre-encode body and must not survive.
  assertEquals(encoded.headers.get("Content-Length"), null);
  assertStringIncludes(encoded.headers.get("Vary")!, "Available-Dictionary");
  assertEquals(encoded.headers.get("Netlify-Vary"), "header=Available-Dictionary");

  const body = new Uint8Array(await encoded.arrayBuffer());
  assertEquals(Array.from(parseDczHeader(body)!), Array.from(dictionary.hash));
});
