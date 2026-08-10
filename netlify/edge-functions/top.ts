// top.ts - Top stories feed
import type { Config, Context } from "@netlify/edge-functions";
import { handleFeed, handleNotFound, parsePositiveInt } from "./lib/handlers.ts";

export default (request: Request, context: Context) => {
  const pageNumber = parsePositiveInt(context.params.page);
  if (pageNumber === null) {
    return handleNotFound(request);
  }

  return handleFeed(
    request,
    "top",
    pageNumber,
    "No stories found",
    "We couldn't find that page of top stories.",
    context,
  );
};

export const config: Config = {
  rateLimit: {
    // Generous: Speculation Rules (prerender: moderate) mean one engaged reader
    // can legitimately burst a dozen requests without clicking anything, and
    // shared egress (carriers, VPNs, universities) puts many readers on one IP.
    // This is a scraper backstop, not a per-user quota.
    windowLimit: 120,
    windowSize: 60,
    aggregateBy: "ip",
  },
  method: ["GET"],
  path: "/top/:page",
};
