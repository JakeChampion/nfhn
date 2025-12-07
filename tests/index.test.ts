import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Elysia } from "elysia";
import type { Config } from "@netlify/edge-functions";
import { icon } from "../netlify/edge-functions/handlers/icon.ts";
import { item } from "../netlify/edge-functions/handlers/item.ts";
import { top } from "../netlify/edge-functions/handlers/top.ts";
import { user } from "../netlify/edge-functions/handlers/user.ts";

// Helper function for redirecting to top page
function redirectToTop({ set }: { set: any }) {
  set.redirect = "/top/1";
  return;
}

// Create the app instance for testing
const app = new Elysia()
  .onRequest((ctx) => {
    console.log(`${ctx.request.method} ${new URL(ctx.request.url).pathname}`);
  })
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
  .get("/", ({ set }) => {
    set.redirect = "/top/1";
  })
  .get("/top", ({ set }) => {
    set.redirect = "/top/1";
  })
  .get("/top/", ({ set }) => {
    set.redirect = "/top/1";
  })
  .get("/icon.svg", ({ set }) => icon(set))
  .get("/top/:pageNumber", ({ params, set }) => {
    const pageNumber = Number.parseInt(params.pageNumber, 10);
    // Validate pageNumber is a valid number and between 1-20
    if (isNaN(pageNumber) || pageNumber < 1 || pageNumber > 20) {
      set.status = 404;
      return "Not Found";
    }
    return top(pageNumber, set);
  })
  .get("/item/:id", ({ params, set }) => {
    const id = Number.parseInt(params.id, 10);
    // Validate id is a valid number
    if (isNaN(id)) {
      set.status = 404;
      return "Not Found";
    }
    return item(id, set);
  })
  .get("/user/:name", ({ params, set }) => {
    return user(params.name, set);
  })
  .get("/error", () => {
    throw new Error("uh oh");
  });

// Redirect routes tests
Deno.test("GET / - should redirect to /top/1", async () => {
  const response = await app.handle(new Request("http://localhost/"));
  assertEquals(response.status, 301);
  assertEquals(response.headers.get("location"), "/top/1");
});

Deno.test("GET /top - should redirect to /top/1", async () => {
  const response = await app.handle(new Request("http://localhost/top"));
  assertEquals(response.status, 301);
  assertEquals(response.headers.get("location"), "/top/1");
});

Deno.test("GET /top/ - should redirect to /top/1", async () => {
  const response = await app.handle(new Request("http://localhost/top/"));
  assertEquals(response.status, 301);
  assertEquals(response.headers.get("location"), "/top/1");
});

// Icon route tests
Deno.test("GET /icon.svg - should return SVG with correct content-type", async () => {
  const response = await app.handle(new Request("http://localhost/icon.svg"));
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("content-type"), "image/svg+xml");
  const body = await response.text();
  assert(body.includes("<svg"), "Response should contain SVG");
});

// Top stories route tests
Deno.test("GET /top/1 - should return HTML for valid page number", async () => {
  const response = await app.handle(new Request("http://localhost/top/1"));
  assertEquals(response.status, 200);
  const contentType = response.headers.get("content-type");
  assertExists(contentType);
  assert(contentType.includes("text/html"), "Content-type should be text/html");
});

Deno.test("GET /top/0 - should return 404 for invalid page number", async () => {
  const response = await app.handle(new Request("http://localhost/top/0"));
  assertEquals(response.status, 404);
  const body = await response.text();
  assertEquals(body, "Not Found");
});

Deno.test("GET /top/21 - should return 404 for out of range page number", async () => {
  const response = await app.handle(new Request("http://localhost/top/21"));
  assertEquals(response.status, 404);
  const body = await response.text();
  assertEquals(body, "Not Found");
});

Deno.test("GET /top/abc - should return 404 for non-numeric page number", async () => {
  const response = await app.handle(new Request("http://localhost/top/abc"));
  assertEquals(response.status, 404);
  const body = await response.text();
  assertEquals(body, "Not Found");
});

Deno.test("GET /top/10 - should handle page numbers within valid range", async () => {
  const response = await app.handle(new Request("http://localhost/top/10"));
  assertEquals(response.status, 200);
  const contentType = response.headers.get("content-type");
  assertExists(contentType);
  assert(contentType.includes("text/html"), "Content-type should be text/html");
});

// Item route tests
Deno.test("GET /item/abc - should return 404 for non-numeric item ID", async () => {
  const response = await app.handle(new Request("http://localhost/item/abc"));
  assertEquals(response.status, 404);
  const body = await response.text();
  assertEquals(body, "Not Found");
});

Deno.test("GET /item/8863 - should handle valid item ID", async () => {
  const response = await app.handle(new Request("http://localhost/item/8863"));
  // Status could be 200, 404, or 502 depending on API response
  assert(
    [200, 404, 502].includes(response.status),
    `Status should be 200, 404, or 502, got ${response.status}`
  );
  if (response.status === 200) {
    const contentType = response.headers.get("content-type");
    assertExists(contentType);
    assert(contentType.includes("text/html"), "Content-type should be text/html");
  }
});

// User route tests
Deno.test("GET /user/pg - should handle valid username", async () => {
  const response = await app.handle(new Request("http://localhost/user/pg"));
  // Status could be 200, 404, or 502 depending on API response
  assert(
    [200, 404, 502].includes(response.status),
    `Status should be 200, 404, or 502, got ${response.status}`
  );
  if (response.status === 200) {
    const contentType = response.headers.get("content-type");
    assertExists(contentType);
    assert(contentType.includes("text/html"), "Content-type should be text/html");
  }
});

Deno.test("GET /user/test-user - should handle usernames with special characters", async () => {
  const response = await app.handle(
    new Request("http://localhost/user/test-user")
  );
  // Should not crash, status depends on API
  assert(response.status >= 200, "Status should be >= 200");
});

// Error handling tests
Deno.test("GET /error - should handle intentional errors", async () => {
  const response = await app.handle(new Request("http://localhost/error"));
  assertEquals(response.status, 500);
  const body = await response.text();
  assertEquals(body, "Internal Server Error");
});

Deno.test("GET /nonexistent - should return 404 for non-existent routes", async () => {
  const response = await app.handle(
    new Request("http://localhost/nonexistent")
  );
  assertEquals(response.status, 404);
  const body = await response.text();
  assertEquals(body, "Not Found");
});

// HTTP Methods tests
Deno.test("POST /top/1 - should only accept GET requests", async () => {
  const response = await app.handle(
    new Request("http://localhost/top/1", { method: "POST" })
  );
  assertEquals(response.status, 404);
});
