# The PWA integration surface: share targets, protocol handlers, badging

**Status:** Proposed · **Browser support:** mixed, all progressive · **Effort:** Low

`static/manifest.json` is already thoughtful — six shortcuts, categories, scope, maskable purpose
declared. But it stops at "installable". The manifest members below turn an installed NFHN from a
bookmarked website into something the operating system routes work to.

## 1. `share_target` — receive shares from other apps (do this one)

NFHN has a reader mode that renders any URL. Right now the only way to get a URL into it is to paste
one. With `share_target`, NFHN appears in the OS share sheet, and sharing a link from any app opens
it in reader mode:

```json
"share_target": {
  "action": "/share",
  "method": "GET",
  "params": { "title": "title", "text": "text", "url": "url" }
}
```

An edge function at `/share` reads the parameter and redirects:

```ts
export default (request: Request) => {
  const shared = new URL(request.url).searchParams.get("url");
  return shared
    ? Response.redirect(`/reader/${shared}`, 302)
    : Response.redirect("/top/1", 302);
};
export const config: Config = { method: ["GET"], path: "/share" };
```

This is the highest-value item here because it inverts the relationship: instead of NFHN being
somewhere you go, it becomes the thing your phone opens links with.

**One important interaction:** `/share` is the first route on the site whose response *does* depend on
a query parameter. `applySecurityHeaders` sets `No-Vary-Search: params, key-order` on everything, and
the spec review's whole argument for that header is "no handler reads request query parameters". This
route must be excluded from `applySecurityHeaders`, exactly as `/reader/*` already is, or the claim
becomes false and a shared link will collapse onto a cached redirect for a different URL. Worth a
test alongside the existing No-Vary-Search ones.

## 2. `protocol_handlers` — own `web+hn://` links

```json
"protocol_handlers": [
  { "protocol": "web+hn", "url": "/item/%s" }
]
```

Small, but it makes `web+hn://12345` resolve anywhere on the system once NFHN is installed.

## 3. Badging + Periodic Background Sync — a live unread count

`sw.js` already has a `sync` listener and an IndexedDB queue. Adding periodic sync plus the Badging
API gives the installed app a count of new top stories since the last visit:

```js
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "top-stories") {
    event.waitUntil(refreshTopStories().then((n) => self.navigator.setAppBadge(n)));
  }
});
```

Clear it on `visibilitychange`. Chromium-only, requires install and an engagement heuristic, and
should be opt-in — a news badge that nobody asked for is an unwelcome feature. Gate it behind a
setting rather than enabling by default.

## 4. `launch_handler` — don't open five copies

```json
"launch_handler": { "client_mode": "navigate-existing" }
```

Combined with `share_target`, this means sharing a second link reuses the open window instead of
spawning another. Without it the share flow gets annoying fast.

## 5. `file_handlers` — reopen exported saves

`app.js` already exports saved stories as `nfhn-saved-stories-<timestamp>.json` via the File System
Access API (proposal 07). Registering the handler makes those files double-clickable back into the
app:

```json
"file_handlers": [
  { "action": "/saved", "accept": { "application/json": [".json"] } }
]
```

That closes the loop on an export feature that currently has no import path.

## 6. Storage persistence — stop the browser evicting saved stories

Not a manifest member, but it belongs in the same conversation. Saved stories live in IndexedDB,
which browsers evict under storage pressure without warning. One call fixes it:

```js
if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
  await navigator.storage.persist();
}
```

Call it when the user first saves a story, not on page load — browsers grant persistence based on
engagement signals, and asking at the moment the user demonstrates intent is both more likely to
succeed and more honest. `navigator.storage.estimate()` can then show real usage on `/saved`.

## Ordering

`share_target` + `launch_handler` together, as one change, with the No-Vary-Search exclusion and its
test. Then storage persistence — it is three lines and prevents actual data loss. The rest is polish.

## Sources

- [Web Share Target on MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target)
- [Badging API on MDN](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API)
- [`StorageManager.persist()` on MDN](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)
