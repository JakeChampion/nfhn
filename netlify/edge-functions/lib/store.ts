// store.ts - Durable storage on top of Netlify Blobs.
//
// NFHN is otherwise stateless: everything it knows lives either in a per-node
// HTTP cache that evaporates or in the visitor's own browser. That is an elegant
// constraint, and it is also why an HN API outage currently means an error page
// rather than a slightly-stale one.
//
// This module is the L3 behind lib/cache.ts, not a replacement for it. A blob
// read is a network hop from the edge node, so the programmable cache stays in
// front.
//
// See docs/netlify-proposals/03-netlify-blobs.md

import { getStore } from "@netlify/blobs";
import type { Waiter } from "./background.ts";
import { log } from "./logger.ts";

/** Store names. Kept here so the retention sweep has one list to work from. */
export const HN_MIRROR_STORE = "hn-mirror";
export const READER_STORE = "reader-extractions";

export interface MirroredValue<T> {
  value: T;
  /** When this copy was written, in epoch milliseconds. */
  storedAt: number;
}

type BlobStore = {
  get(key: string, options: { type: "json" }): Promise<unknown>;
  setJSON(key: string, value: unknown): Promise<unknown>;
};

/**
 * Blobs are unavailable outside a deploy (local `deno test`, some dev setups).
 * Every helper here degrades to a miss rather than throwing, because none of
 * them is on a path where failing is better than not having the optimisation.
 */
const openStore = (name: string): BlobStore | null => {
  try {
    return getStore(name) as unknown as BlobStore;
  } catch (error) {
    log.debug("Blobs unavailable", { store: name, error: String(error) });
    return null;
  }
};

/**
 * Read a mirrored value, or null when there is none (or Blobs is unavailable).
 */
export async function readMirror<T>(
  storeName: string,
  key: string,
): Promise<MirroredValue<T> | null> {
  const store = openStore(storeName);
  if (!store) return null;

  try {
    const raw = await store.get(key, { type: "json" });
    if (!raw || typeof raw !== "object") return null;
    const record = raw as MirroredValue<T>;
    if (!("value" in record)) return null;
    return record;
  } catch (error) {
    log.warn("Blob read failed", { store: storeName, key, error: String(error) });
    return null;
  }
}

/**
 * Write a mirrored value without blocking the response.
 *
 * The write is handed to `waitUntil` so it survives the response being returned
 * but does not delay it - the caller already has the fresh value in hand, and
 * the mirror only matters for some later request.
 */
export function writeMirror(
  storeName: string,
  key: string,
  value: unknown,
  waitUntil: Waiter,
): void {
  const store = openStore(storeName);
  if (!store) return;

  const record: MirroredValue<unknown> = { value, storedAt: Date.now() };

  waitUntil(
    Promise.resolve(store.setJSON(key, record)).catch((error) => {
      log.warn("Blob write failed", { store: storeName, key, error: String(error) });
    }),
  );
}

/** Age of a mirrored value in seconds. */
export const mirrorAgeSeconds = (record: MirroredValue<unknown>): number =>
  Math.max(0, (Date.now() - record.storedAt) / 1000);

/** Key for a mirrored HN item. */
export const itemKey = (id: number): string => `item:${id}`;

/** Key for a mirrored feed page. */
export const feedKey = (slug: string, page: number): string => `feed:${slug}:${page}`;

/**
 * Key for a cached reader extraction.
 *
 * Hashed rather than using the URL directly: target URLs are arbitrary
 * third-party strings and would otherwise have to be escaped into a key.
 */
export async function readerKey(targetUrl: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(targetUrl));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `reader:${hex}`;
}
