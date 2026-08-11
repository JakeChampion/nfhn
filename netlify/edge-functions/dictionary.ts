// dictionary.ts - Serves the shared HTML compression dictionary.
//
// Pages reference this with <link rel="compression-dictionary">, so the browser
// fetches it when idle, stores it, and from then on advertises its hash via
// `Available-Dictionary` on every matching navigation. lib/dictionary.ts uses
// that to serve a delta instead of a whole page.
//
// See docs/netlify-proposals/01-compression-dictionary-transport.md

import type { Config, Context } from "@netlify/edge-functions";
import { DICTIONARY_TRANSPORT_ENABLED, toHex, useAsDictionaryHeader } from "./lib/dictionary.ts";
import { tryGetShellDictionary } from "./lib/shell-dictionary.ts";
import { rememberDeploy } from "./lib/deploy.ts";

/**
 * Routes the dictionary applies to.
 *
 * This was `/(top|newest|ask|show|jobs)/:page(\d+)`, which was wrong twice over
 * and meant the dictionary was never stored by any browser:
 *
 *   1. RFC 9842 runs URLPattern's "has regexp groups" steps on `match` and
 *      rejects the offer if they return true. Both the alternation and the
 *      `\d+` are regexp groups.
 *   2. The `\d` also made the header an invalid Structured Field String, so
 *      Chrome could not even parse the field. That is what DevTools reported.
 *
 * Two path segments with named groups and no regexp is what is left, and it is
 * a better fit anyway: item and user pages are built from the same shell as the
 * feeds and were being excluded for no reason. `/reader/*` still falls outside
 * it - a wrapped article URL has more segments than this - which matters,
 * because reader pages are arbitrary third-party content that shares no
 * structure with the shell.
 */
export const DICTIONARY_MATCH = "/:section/:page";

export default async (_request: Request, context: Context): Promise<Response> => {
  // The shell's bytes include the deploy id (it is in the head's own asset URLs),
  // and it must not be built before that is known - two isolates disagreeing about
  // it would produce two dictionaries with two hashes, and a client holding one
  // would be declined by the other.
  rememberDeploy(context);

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
      // Immutable for a year, which RFC 9842 effectively requires: a dictionary
      // whose response is not fresh is refused, and the stored dictionary's own
      // lifetime comes from this same `max-age`, so anything short would expire it
      // before the deploy it exists to compress against.
      //
      // That is only safe because the URL is versioned. It used to claim "the URL
      // carries a hash" while `path` was the fixed string `/_dict/shell`, so the
      // first response a browser ever got was the one it kept for a year: when the
      // malformed `Use-As-Dictionary` header was fixed, no returning visitor could
      // see the fix, and every one of them kept advertising a hash this deploy no
      // longer builds. The renderer now points the link at `?v=<deploy id>`.
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
