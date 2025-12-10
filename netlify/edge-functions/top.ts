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
  );
};

export const config: Config = {
  method: ["GET"],
  path: "/top/:page",
  cache: "manual",
};
