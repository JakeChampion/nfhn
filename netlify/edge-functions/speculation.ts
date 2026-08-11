// speculation.ts - Serves the Speculation Rules ruleset.
//
// Pointed at by the `Speculation-Rules` response header that lib/security.ts
// puts on every page. See lib/speculation.ts for why the rules moved out of the
// document.

import type { Config } from "@netlify/edge-functions";
import {
  SPECULATION_RULES_PATH,
  SPECULATION_RULES_TYPE,
  speculationRulesJson,
} from "./lib/speculation.ts";

export default (): Response =>
  new Response(speculationRulesJson(), {
    status: 200,
    headers: {
      // Not `application/json`: a rules file with the wrong type is ignored.
      "content-type": SPECULATION_RULES_TYPE,
      // The ruleset only changes when this code does. An hour in the browser
      // means one fetch per session at most; the CDN holds it for a day and a
      // deploy replaces it, so the worst case is an hour of rules that differ
      // from the current ones by nothing.
      "cache-control": "public, max-age=3600",
      "Netlify-CDN-Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    },
  });

export const config: Config = {
  method: ["GET"],
  path: SPECULATION_RULES_PATH,
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: "ip",
  },
};
