// show.ts - Show HN feed
import type { Config, Context } from "@netlify/edge-functions";
import {
  handleFeed,
  handleNotFound,
  parsePositiveInt,
  withDictionaryEncoding,
} from "./lib/handlers.ts";

export default (request: Request, context: Context) => {
  const pageNumber = parsePositiveInt(context.params.page);
  if (pageNumber === null) {
    return handleNotFound(request);
  }

  return withDictionaryEncoding(
    request,
    handleFeed(
      request,
      "show",
      pageNumber,
      "No stories found",
      "We could not find that page of Show HN posts.",
      context,
    ),
  );
};

export const config: Config = {
  rateLimit: {
    // Deliberately generous - see docs/netlify-proposals/04-rate-limiting.md.
    // Values are inlined because Netlify parses `config` without executing the
    // module, so constants from config.ts cannot be referenced here.
    windowLimit: 120,
    windowSize: 60,
    aggregateBy: "ip",
  },
  method: ["GET"],
  path: "/show/:page",
};
