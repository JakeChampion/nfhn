// speculation.ts - The site's Speculation Rules, and where they are served from.
//
// These rules used to be an inline `<script type="speculationrules">` in every
// page, and they never ran. Speculation rule scripts are inline scripts as far
// as CSP is concerned, and this site's `script-src` is `'self'` plus a single
// hash for the theme initialiser - no `'unsafe-inline'`, no nonce, and no hash
// covering the rules block. Chrome refused to parse it. Like the SRI drift, the
// only symptom was the feature quietly not working: prerendering just never
// happened, and nothing on the page looked broken.
//
// Two ways out. `'inline-speculation-rules'` is a CSP source expression that
// exists for exactly this, but it re-opens `script-src` to a class of inline
// content on every page. The `Speculation-Rules` response header instead points
// at a JSON file, which is an ordinary same-origin fetch already covered by
// `'self'` - the strict policy stays strict, and the ruleset is fetched and
// parsed once per browser instead of on every navigation.
//
// Both the header and the document rules this ruleset uses (`where`,
// `eagerness`, `expects_no_vary_search`) shipped in Chrome 121, so moving to the
// header costs no reach: any browser that could act on these rules can fetch
// them.
//
// See docs/api-proposals/19-view-transition-types-and-speculation.md

import { NO_VARY_SEARCH } from "./config.ts";

/** Where the ruleset lives. Referenced by the header and by the route serving it. */
export const SPECULATION_RULES_PATH = "/_speculation/rules.json";

/**
 * The MIME type the spec requires. A rules file served as `application/json` is
 * ignored, silently, which is the same failure mode this module exists to fix.
 */
export const SPECULATION_RULES_TYPE = "application/speculationrules+json";

/** The `Speculation-Rules` header value. The quotes are part of the syntax. */
export const SPECULATION_RULES_HEADER = `"${SPECULATION_RULES_PATH}"`;

/**
 * Paths never worth speculating.
 *
 * `/saved` reads localStorage and renders nothing useful until it is the active
 * document; `/reader/*` fetches and parses an arbitrary third-party page, which
 * is far too much work to do on the chance of a click.
 */
const NEVER = [
  { not: { href_matches: "/saved" } },
  { not: { href_matches: "/reader*" } },
];

/**
 * The ruleset.
 *
 * `expects_no_vary_search` mirrors the `No-Vary-Search` response header set in
 * lib/security.ts, and closes the gap that header alone leaves open. When a
 * click arrives on a link decorated with `?utm_source=...`, the browser looks
 * for that exact URL in its prefetch cache. If the prefetch for the clean URL
 * has *completed*, its response header is known and the entries match. If it is
 * still in flight there is no header yet, so the browser cannot know they are
 * equivalent and starts a second, redundant fetch. Declaring it up front closes
 * that window - and only works if it matches what the server actually sends,
 * hence interpolating the same constant rather than writing the value twice.
 */
export const speculationRules = () => ({
  prerender: [
    {
      where: {
        and: [
          { href_matches: "/*" },
          ...NEVER,
          // Prerendering a cross-origin story link would fetch someone else's
          // page on their behalf without a click. The class is on outbound
          // links only.
          { not: { selector_matches: ".external-link" } },
        ],
      },
      eagerness: "moderate",
      expects_no_vary_search: NO_VARY_SEARCH,
    },
  ],
  prefetch: [
    {
      where: { and: [{ href_matches: "/*" }, ...NEVER] },
      eagerness: "conservative",
      expects_no_vary_search: NO_VARY_SEARCH,
    },
  ],
});

/** The ruleset as the bytes served at `SPECULATION_RULES_PATH`. */
export const speculationRulesJson = (): string => JSON.stringify(speculationRules(), null, 2);
