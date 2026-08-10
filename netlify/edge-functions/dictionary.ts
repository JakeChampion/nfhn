// dictionary.ts - Serves the shared HTML compression dictionary.
//
// Pages reference this with <link rel="compression-dictionary">, so the browser
// fetches it when idle, stores it, and from then on advertises its hash via
// `Available-Dictionary` on every matching navigation. lib/dictionary.ts uses
// that to serve a delta instead of a whole page.
//
// See docs/netlify-proposals/01-compression-dictionary-transport.md

import type { Config } from "@netlify/edge-functions";
import { DICTIONARY_TRANSPORT_ENABLED, toHex, useAsDictionaryHeader } from "./lib/dictionary.ts";
import { tryGetShellDictionary } from "./lib/shell-dictionary.ts";

/**
 * Routes the dictionary applies to. Feed and item pages share the shell; the
 * exclusions mirror the ones the Speculation Rules and No-Vary-Search work
 * already use, and for the same reason - `/reader/*` is arbitrary third-party
 * content that shares no structure with the shell.
 */
export const DICTIONARY_MATCH = "/(top|newest|ask|show|jobs)/:page(\\d+)";

export default async (): Promise<Response> => {
  if (!DICTIONARY_TRANSPORT_ENABLED) {
    return new Response("Dictionary transport disabled", { status: 404 });
  }

  const dictionary = await tryGetShellDictionary();
  if (!dictionary) {
    return new Response("Dictionary unavailable", { status: 503 });
  }

  return new Response(dictionary.bytes as BodyInit, {
    status: 200,
    headers: {
      // text/plain, not text/html: this is never rendered, and serving it as
      // HTML would make it a same-origin page that could be navigated to.
      "content-type": "text/plain; charset=utf-8",
      "Use-As-Dictionary": useAsDictionaryHeader({
        match: DICTIONARY_MATCH,
        matchDest: ["document"],
        id: `shell-${toHex(dictionary.hash).slice(0, 16)}`,
      }),
      // The content is derived from the deployed render code, so it is immutable
      // for the life of the deploy, and the URL carries a hash.
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    },
  });
};

export const config: Config = {
  method: ["GET"],
  path: "/_dict/shell",
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: "ip",
  },
};
