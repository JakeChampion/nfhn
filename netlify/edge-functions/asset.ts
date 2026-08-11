// asset.ts - Serves app.js and styles.css with dictionary compression.
//
// The HTML half of Compression Dictionary Transport shipped first and is where
// the headline number came from (97.4% smaller feed pages). This is the other
// half the proposal described: `app.js` and `styles.css` change by a few lines
// per deploy but are re-downloaded whole, and the previous deploy's copy is
// already in the visitor's cache.
//
// The mechanism differs from the HTML one in an important way. There, we build
// the dictionary ourselves and know its bytes. Here the dictionary *is the
// previous version of the file*, which this deploy has never seen - so the bytes
// have to come out of Netlify Blobs, keyed by the hash the client advertises. If
// we do not hold that exact version, negotiation declines and the visitor gets
// the ordinary response.
//
// See docs/netlify-proposals/01-compression-dictionary-transport.md

import type { Config, Context } from "@netlify/edge-functions";
import { getStore } from "@netlify/blobs";
import {
  applyDictionaryVary,
  canServeDictionaryDelta,
  DICTIONARY_TRANSPORT_ENABLED,
  frameDcz,
  parseAvailableDictionary,
  sha256,
  toHex,
  useAsDictionaryHeader,
} from "./lib/dictionary.ts";
import { isSpeculative, waiterFrom } from "./lib/background.ts";
import { log } from "./lib/logger.ts";

/** Store holding every retained version of every dictionary-eligible asset. */
export const ASSET_VERSIONS_STORE = "asset-versions";

/**
 * Versions kept per asset.
 *
 * A browser holds one dictionary per match pattern - the most recently served
 * one - so in the steady state only the immediately previous deploy is ever
 * advertised. The extra slots cover visitors who skipped a few deploys and
 * rolling deploys where two versions are briefly live at once.
 */
export const MAX_VERSIONS_PER_ASSET = 8;

/**
 * Assets this route serves, and the fetch destination each is used from.
 *
 * `match-dest` is per-file rather than a shared list: offering app.js as a
 * dictionary for stylesheet requests would have the browser advertise it on
 * fetches it can never help with.
 */
const ASSETS: Record<string, { contentType: string; dest: string }> = {
  "/app.js": { contentType: "text/javascript; charset=utf-8", dest: "script" },
  "/styles.css": { contentType: "text/css; charset=utf-8", dest: "style" },
};

/** Key a stored asset version by path and content hash. */
export const assetVersionKey = (pathname: string, hashHex: string): string =>
  `${pathname.replace(/^\//, "")}@${hashHex}`;

/** Key of the per-asset index of retained versions. */
export const assetIndexKey = (pathname: string): string => `index:${pathname.replace(/^\//, "")}`;

/**
 * Newest-first list of retained hashes, trimmed to `MAX_VERSIONS_PER_ASSET`.
 *
 * Exported and pure so the retention rule is testable without Blobs.
 */
export function nextIndex(existing: string[], hashHex: string): {
  index: string[];
  evicted: string[];
} {
  const deduped = [hashHex, ...existing.filter((entry) => entry !== hashHex)];
  return {
    index: deduped.slice(0, MAX_VERSIONS_PER_ASSET),
    evicted: deduped.slice(MAX_VERSIONS_PER_ASSET),
  };
}

/**
 * Hashes this isolate has already persisted.
 *
 * Without this the function would write a blob on every single request for
 * app.js. The content only changes on deploy, so one write per isolate per
 * version is all that is ever needed, and a Blobs write is a network round trip
 * from the edge node.
 */
const persisted = new Set<string>();

/** Store the current bytes and prune anything past the retention window. */
async function retainVersion(
  pathname: string,
  hashHex: string,
  bytes: Uint8Array,
): Promise<void> {
  const store = getStore(ASSET_VERSIONS_STORE);
  const indexKey = assetIndexKey(pathname);

  const stored = await store.get(indexKey, { type: "json" }) as string[] | null;
  const existing = Array.isArray(stored) ? stored.filter((e) => typeof e === "string") : [];
  if (existing[0] === hashHex) return;

  // The bytes go in before the index points at them: a reader that finds a hash
  // in the index must be able to fetch it. The reverse order would hand out a
  // key that 404s.
  await store.set(
    assetVersionKey(pathname, hashHex),
    bytes.slice().buffer,
  );

  const { index, evicted } = nextIndex(existing, hashHex);
  await store.setJSON(indexKey, index);

  // Two isolates racing here can lose an index entry and leave a few kilobytes
  // orphaned. That is the right trade: the alternative is a lock on a path that
  // runs on every deploy, and the cost of losing is a stale blob nobody reads.
  for (const old of evicted) {
    await store.delete(assetVersionKey(pathname, old)).catch(() => {});
  }
}

export default async (request: Request, context: Context): Promise<Response> => {
  const pathname = new URL(request.url).pathname;
  const asset = ASSETS[pathname];

  // `context.next()` hands the request to the rest of the chain - here, Netlify's
  // own static file serving. It advances the chain rather than re-entering this
  // function, which is what makes reading our own asset safe; a `fetch()` of the
  // same URL would loop.
  const upstream = await context.next();
  if (!DICTIONARY_TRANSPORT_ENABLED || !asset || !upstream.ok) return upstream;

  const bytes = new Uint8Array(await upstream.arrayBuffer());
  const currentHex = toHex(await sha256(bytes));

  const headers = new Headers(upstream.headers);
  headers.set("content-type", asset.contentType);

  // Offer this file as the dictionary for its own future versions. `match` is the
  // path itself: the next deploy's app.js is what we want compressed against this
  // one.
  headers.set(
    "Use-As-Dictionary",
    useAsDictionaryHeader({
      match: pathname,
      matchDest: [asset.dest],
      id: `${pathname.slice(1)}@${currentHex.slice(0, 16)}`,
    }),
  );
  applyDictionaryVary(headers);

  const plain = () => new Response(bytes.slice() as BodyInit, { status: 200, headers });

  if (!persisted.has(currentHex)) {
    persisted.add(currentHex);
    waiterFrom(context)(
      retainVersion(pathname, currentHex, bytes).catch((error) => {
        // Let a later request retry rather than marking this version done.
        persisted.delete(currentHex);
        log.warn("Could not retain asset version", { pathname, error: String(error) });
      }),
    );
  }

  const advertised = parseAvailableDictionary(request.headers.get("Available-Dictionary"));
  // Nothing to delta against, or nobody is waiting on these bytes: a prerendered
  // page that is never activated should not be spending edge CPU on zstd.
  if (!advertised || isSpeculative(request)) return plain();

  try {
    const advertisedHex = toHex(advertised);
    // The client already holds this exact version, so there is no delta to send.
    if (advertisedHex === currentHex) return plain();

    const stored = await getStore(ASSET_VERSIONS_STORE).get(
      assetVersionKey(pathname, advertisedHex),
      { type: "arrayBuffer" },
    );
    if (!stored) return plain();

    // Re-hashing the stored bytes rather than trusting the key means a truncated
    // or mismatched blob declines instead of producing a body the client cannot
    // decode.
    const dictionary = new Uint8Array(stored);
    if (!canServeDictionaryDelta(request, await sha256(dictionary))) return plain();

    const { compressWithDictionary } = await import("./lib/zstd.ts");
    const frame = await compressWithDictionary(bytes, dictionary);

    headers.set("Content-Encoding", "dcz");
    headers.delete("Content-Length");
    return new Response(frameDcz(advertised, frame) as BodyInit, { status: 200, headers });
  } catch (error) {
    // A missed optimisation is invisible; a corrupted body is not.
    log.warn("Asset dictionary encoding failed", { pathname, error: String(error) });
    return plain();
  }
};

export const config: Config = {
  method: ["GET"],
  path: ["/app.js", "/styles.css"],
  rateLimit: {
    windowLimit: 120,
    windowSize: 60,
    aggregateBy: "ip",
  },
};
