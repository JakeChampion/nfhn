// shell-dictionary.ts - The shared HTML dictionary for feed and item pages.
//
// This is where the real win is. `/top/1` and `/top/2` differ only in thirty
// story rows inside a byte-identical shell: same <head>, same speculation rules
// block, same nav, same footer, same inline theme script. Plain Brotli cannot
// exploit that, because it only ever sees one response at a time.
//
// The dictionary is a rendered page. Building it from the real templates rather
// than a hand-maintained list of fragments means it cannot drift: whatever the
// renderer emits is what the dictionary contains.
//
// It is deterministic - fixed synthetic stories, fixed page number, no clock -
// so every isolate in every region derives byte-identical dictionary content and
// therefore the same hash. That is a hard requirement: the browser hashes the
// bytes it was served, and we must be able to reproduce them exactly to compress
// against them.
//
// See docs/netlify-proposals/01-compression-dictionary-transport.md

import { htmlToString } from "./html.ts";
import { home } from "./render.ts";
import type { Item } from "./hn.ts";
import { sha256 } from "./dictionary.ts";

/**
 * Synthetic stories whose *shape* matches real ones. The text is deliberately
 * generic: the dictionary earns its keep on the markup around the content, and
 * padding it with words that will not recur just makes it bigger.
 */
const SAMPLE_STORIES: Item[] = Array.from({ length: 30 }, (_, index) => ({
  id: 40000000 + index,
  title: "A representative Hacker News story title of a fairly typical length",
  points: 100,
  user: "commenter",
  time: 1700000000,
  time_ago: "2 hours ago",
  content: "",
  type: index % 5 === 0 ? "ask" : "link",
  url: "https://example.com/article",
  domain: "example.com",
  comments: [],
  level: 0,
  comments_count: 100,
}));

export interface ShellDictionary {
  bytes: Uint8Array;
  hash: Uint8Array;
}

let cached: Promise<ShellDictionary> | null = null;

/**
 * Build (once per isolate) the dictionary bytes and their SHA-256.
 */
export function getShellDictionary(): Promise<ShellDictionary> {
  if (!cached) {
    cached = (async () => {
      const markup = await htmlToString(
        home(SAMPLE_STORIES, 1, "top", "https://nfhn.netlify.app/top/1"),
      );
      const bytes = new TextEncoder().encode(markup);
      return { bytes, hash: await sha256(bytes) };
    })().catch((error) => {
      // Never let dictionary construction break page rendering: reset so a later
      // request can retry, and let the caller fall back to no dictionary.
      cached = null;
      throw error;
    });
  }
  return cached;
}

/** The dictionary, or null if it could not be built. Never throws. */
export async function tryGetShellDictionary(): Promise<ShellDictionary | null> {
  try {
    return await getShellDictionary();
  } catch {
    return null;
  }
}
