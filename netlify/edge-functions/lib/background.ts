// background.ts - Work that outlives the response, and requests nobody is waiting on.

/**
 * Hands a promise to the runtime so the isolate stays alive until it settles.
 */
export type Waiter = (promise: Promise<unknown>) => void;

/**
 * The shape of `Context` this module needs. Kept structural rather than
 * importing Netlify's `Context` so that tests (and the offline render paths)
 * can pass a partial object.
 */
export interface WaitUntilCapable {
  waitUntil?: (promise: Promise<unknown>) => void;
  geo?: { timezone?: string };
}

/**
 * The reader's IANA time zone, as reported by Netlify's edge, or UTC.
 *
 * Only used for calendar arithmetic (month and year boundaries), which is
 * genuinely local. Anything finer than a day is the same everywhere, and the
 * client re-renders timestamps against its own clock anyway - this is about the
 * server-rendered string being right for readers without JavaScript.
 *
 * Validated rather than trusted: an unparseable zone would throw inside
 * Temporal, and this value reaches it from a request-scoped source.
 */
export const timeZoneFrom = (context?: WaitUntilCapable): string => {
  const zone = context?.geo?.timezone;
  if (!zone) return "UTC";
  try {
    // Throws for anything that is not a real IANA identifier.
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
};

/**
 * Build a `Waiter` from an edge function's context.
 *
 * Without `waitUntil`, a promise started after the response has been returned
 * is only *usually* completed: the runtime is free to tear the isolate down as
 * soon as the response finishes, and whether it does depends on whether other
 * requests are keeping the isolate warm. That makes the failure mode invisible
 * in testing and most likely under exactly the low-traffic conditions where a
 * warm cache matters most.
 *
 * `context` is optional because the test harness constructs partial contexts,
 * and because some render paths have no context to hand. In that case this
 * degrades to the previous fire-and-forget behaviour rather than throwing.
 */
export const waiterFrom = (context?: WaitUntilCapable): Waiter => {
  const waitUntil = context?.waitUntil;
  if (typeof waitUntil !== "function") {
    return (promise) => {
      void promise.catch(() => {});
    };
  }
  return (promise) => {
    try {
      waitUntil.call(context, promise);
    } catch {
      // A runtime that rejects waitUntil (e.g. called after the response has
      // already been finalised) should not take the request down with it.
      void promise.catch(() => {});
    }
  };
};

/**
 * True when the browser is fetching this page speculatively rather than because
 * somebody is looking at it.
 *
 * `pages.ts` ships Speculation Rules with `prerender: moderate` over every
 * internal link, so a meaningful share of traffic is for navigations that may
 * never happen. Optional work should be skipped for these: nothing is waiting
 * on the bytes, and the work competes with requests where somebody is.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Purpose
 */
export const isSpeculative = (request: Request): boolean =>
  (request.headers.get("Sec-Purpose") ?? "").includes("prefetch");

/**
 * True for a prerender specifically - the browser is building a full page, not
 * just warming the HTTP cache.
 */
export const isPrerender = (request: Request): boolean =>
  (request.headers.get("Sec-Purpose") ?? "").includes("prerender");
