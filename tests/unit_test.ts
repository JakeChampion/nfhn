// unit_test.ts - Unit tests for core utility functions

import { assertEquals, assertStrictEquals } from "std/testing/asserts.ts";

import { escape, html, htmlToString, raw, unsafeHTML } from "../netlify/edge-functions/lib/html.ts";
import { formatTimeAgo, type HNAPIItem, mapStoryToItem } from "../netlify/edge-functions/lib/hn.ts";
import { buildContentSecurityPolicy } from "../netlify/edge-functions/lib/security.ts";
import { parsePositiveInt, redirect } from "../netlify/edge-functions/lib/handlers.ts";
import {
  pwaHeadTags,
  serviceWorkerScript,
  externalLinkScript,
} from "../netlify/edge-functions/lib/render/components.ts";

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
  const result = await htmlToString(html`<div>Hello</div>`);
  assertEquals(result, "<div>Hello</div>");
});

Deno.test("html: escapes interpolated strings", async () => {
  const userInput = "<script>alert('xss')</script>";
  const result = await htmlToString(html`<p>${userInput}</p>`);
  assertEquals(
    result,
    "<p>&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;</p>",
  );
});

Deno.test("html: renders numbers", async () => {
  const count = 42;
  const result = await htmlToString(html`<span>${count}</span>`);
  assertEquals(result, "<span>42</span>");
});

Deno.test("html: handles null and undefined as empty", async () => {
  const result = await htmlToString(html`<span>${null}${undefined}</span>`);
  assertEquals(result, "<span></span>");
});

Deno.test("html: handles false as empty", async () => {
  const result = await htmlToString(html`<span>${false}</span>`);
  assertEquals(result, "<span></span>");
});

Deno.test("html: renders nested html templates", async () => {
  const inner = html`<span>inner</span>`;
  const outer = html`<div>${inner}</div>`;
  const result = await htmlToString(outer);
  assertEquals(result, "<div><span>inner</span></div>");
});

Deno.test("html: renders arrays of values", async () => {
  const items = ["a", "b", "c"];
  const result = await htmlToString(
    html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>`,
  );
  assertEquals(result, "<ul><li>a</li><li>b</li><li>c</li></ul>");
});

Deno.test("raw: renders HTML without escaping", async () => {
  const rawHtml = raw("<strong>bold</strong>");
  const result = await htmlToString(html`<div>${rawHtml}</div>`);
  assertEquals(result, "<div><strong>bold</strong></div>");
});

Deno.test("unsafeHTML: alias for raw works correctly", async () => {
  const rawHtml = unsafeHTML("<em>italic</em>");
  const result = await htmlToString(html`<div>${rawHtml}</div>`);
  assertEquals(result, "<div><em>italic</em></div>");
});

Deno.test("html: handles promises", async () => {
  const asyncValue = Promise.resolve("async content");
  const result = await htmlToString(html`<div>${asyncValue}</div>`);
  assertEquals(result, "<div>async content</div>");
});

Deno.test("html: handles functions", async () => {
  const fn = () => "from function";
  const result = await htmlToString(html`<div>${fn}</div>`);
  assertEquals(result, "<div>from function</div>");
});

Deno.test("html: handles async functions", async () => {
  // deno-lint-ignore require-await
  const asyncFn = async () => "from async function";
  const result = await htmlToString(html`<div>${asyncFn}</div>`);
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

Deno.test("buildContentSecurityPolicy: contains trusted-types", () => {
  const csp = buildContentSecurityPolicy();
  assertEquals(csp.includes("trusted-types"), true);
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
  const parsed = JSON.parse(output[0]);
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

  const parsed = JSON.parse(output[0]);
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

  const parsed = JSON.parse(output[0]);
  assertEquals(parsed.level, "warn");
  assertEquals(parsed.message, "Warning message");
});

Deno.test("log: debug outputs correct level", () => {
  const output: string[] = [];
  const origDebug = console.debug;
  console.debug = (msg: string) => output.push(msg);

  log.debug("Debug message");

  console.debug = origDebug;

  const parsed = JSON.parse(output[0]);
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
  shareButtons,
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

Deno.test("keyboardNavScript: includes j/k navigation", async () => {
  const result = await htmlToString(keyboardNavScript());
  assertEquals(result.includes("case 'j':"), true);
  assertEquals(result.includes("case 'k':"), true);
  assertEquals(result.includes("kbd-focus"), true);
});

Deno.test("keyboardNavScript: includes Enter/o to open", async () => {
  const result = await htmlToString(keyboardNavScript());
  assertEquals(result.includes("case 'Enter':"), true);
  assertEquals(result.includes("case 'o':"), true);
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
// shareButtons Tests
// =============================================================================

Deno.test("shareButtons: includes Twitter share link", async () => {
  const result = await htmlToString(shareButtons("Test Title", "https://example.com"));
  assertEquals(result.includes("twitter.com/intent/tweet"), true);
  assertEquals(result.includes("Test%20Title"), true);
});

Deno.test("shareButtons: includes copy link button", async () => {
  const result = await htmlToString(shareButtons("Test", "https://example.com"));
  assertEquals(result.includes("share-copy"), true);
  assertEquals(result.includes('data-url="https://example.com"'), true);
});

Deno.test("shareButtons: properly encodes special characters", async () => {
  const result = await htmlToString(
    shareButtons("Test & Special <chars>", "https://example.com?foo=bar"),
  );
  assertEquals(result.includes("twitter.com/intent/tweet"), true);
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

Deno.test("keyboardNavScript: includes ? key handler", async () => {
  const result = await htmlToString(keyboardNavScript());
  assertEquals(result.includes("e.key === '?'"), true);
  assertEquals(result.includes("showModal()"), true);
});

Deno.test("keyboardNavScript: includes Escape handler", async () => {
  const result = await htmlToString(keyboardNavScript());
  assertEquals(result.includes("case 'Escape'"), true);
  assertEquals(result.includes("clearSelection()"), true);
});

// =============================================================================
// PWA Component Tests
// =============================================================================

Deno.test("pwaHeadTags: includes manifest link", async () => {
  const result = await htmlToString(pwaHeadTags());
  assertEquals(result.includes('rel="manifest"'), true);
  assertEquals(result.includes('/manifest.json'), true);
});

Deno.test("pwaHeadTags: includes apple-touch-icon", async () => {
  const result = await htmlToString(pwaHeadTags());
  assertEquals(result.includes('rel="apple-touch-icon"'), true);
});

Deno.test("pwaHeadTags: includes theme-color", async () => {
  const result = await htmlToString(pwaHeadTags());
  assertEquals(result.includes('name="theme-color"'), true);
  assertEquals(result.includes('#ff7a18'), true);
});

Deno.test("serviceWorkerScript: registers service worker", async () => {
  const result = await htmlToString(serviceWorkerScript());
  assertEquals(result.includes('serviceWorker.register'), true);
  assertEquals(result.includes('/sw.js'), true);
});

Deno.test("serviceWorkerScript: handles registration errors", async () => {
  const result = await htmlToString(serviceWorkerScript());
  assertEquals(result.includes('.catch'), true);
});

Deno.test("externalLinkScript: detects external links", async () => {
  const result = await htmlToString(externalLinkScript());
  assertEquals(result.includes("querySelectorAll('a[href^=\"http\"]')"), true);
});

Deno.test("externalLinkScript: adds external-link class", async () => {
  const result = await htmlToString(externalLinkScript());
  assertEquals(result.includes("classList.add('external-link')"), true);
});

Deno.test("externalLinkScript: adds screen reader text", async () => {
  const result = await htmlToString(externalLinkScript());
  assertEquals(result.includes("sr-only"), true);
  assertEquals(result.includes("opens in new tab"), true);
});

Deno.test("externalLinkScript: checks origin for external links", async () => {
  const result = await htmlToString(externalLinkScript());
  assertEquals(result.includes("location.origin"), true);
});
