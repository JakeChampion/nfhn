// deploy.ts - The current deploy's id, for versioning URLs that must not be
// cached across deploys.
//
// Three URLs need this: `/app.js`, `/styles.css`, and `/_dict/shell`. All three
// are served `immutable` with a year-long `max-age`, because that is what
// Compression Dictionary Transport requires - a dictionary whose response is not
// fresh is refused outright by the browser, and RFC 9842 takes the *dictionary's*
// lifetime from the same `max-age`, so a short one would make the dictionary
// expire long before the deploy it is meant to compress against.
//
// Serving a mutable URL that way is a trap, and we walked into it: `/_dict/shell`
// was a fixed path with `max-age=31536000, immutable`, so the first browser to
// fetch it kept that exact response for a year. When the `Use-As-Dictionary`
// header was later fixed, no returning visitor could ever see the fix, and every
// returning visitor kept advertising a dictionary hash the server no longer held
// - which silently turns the whole feature off, because the server can only
// compress against the shell it currently builds. The fix is to put the deploy id
// in the URL, so a new deploy is a new URL.
//
// Netlify hands the deploy id to every edge function as `context.deploy.id`, but
// the renderers that need it are ordinary sync functions several layers below the
// handler, so it is latched here on the way in rather than threaded through every
// component signature.
//
// See docs/netlify-proposals/01-compression-dictionary-transport.md

/** Just enough of the edge function `Context` to read the deploy id. */
export interface DeployAware {
  deploy?: { id?: string };
}

let deployId: string | null = null;

/**
 * Record the deploy this isolate is serving. Call it at the top of any handler
 * that renders HTML or serves a dictionary, before anything is built.
 */
export function rememberDeploy(context: DeployAware | undefined): void {
  const id = context?.deploy?.id;
  if (id && id !== deployId) deployId = id;
}

/**
 * The deploy id, or null before any request has supplied one.
 *
 * Null is load-bearing rather than a nuisance value. The shell dictionary's bytes
 * include this string, and the design depends on every isolate in every region
 * deriving byte-identical dictionary content: if one isolate built the shell
 * before it knew the deploy id and another built it after, the two would hash
 * differently and clients holding one would be declined by the other. So callers
 * treat null as "no dictionary yet" and wait, rather than substituting a
 * placeholder. Every real request carries a context, so this is null only for the
 * instant before the first one is handled.
 */
export const deployVersion = (): string | null => deployId;

/**
 * `?v=<deploy id>` for an asset URL, or "" when the deploy is not known yet.
 *
 * The empty string is safe: `asset.ts` grants the immutable, dictionary-eligible
 * response only to a request that carries `v`, so an unversioned URL falls back
 * to Netlify's ordinary revalidating response instead of being pinned in a cache
 * for a year.
 */
export const assetVersionQuery = (): string => {
  const id = deployVersion();
  return id ? `?v=${encodeURIComponent(id)}` : "";
};

/** Reset the latch. Tests only. */
export const resetDeployForTesting = (): void => {
  deployId = null;
};
