// ask.ts - Ask HN feed
import type { Config, Context } from "@netlify/edge-functions";
import { handleFeed, handleNotFound, parsePositiveInt } from "./lib/handlers.ts";

export default (request: Request, context: Context) => {
  const pageNumber = parsePositiveInt(context.params.page);
  if (pageNumber === null) {
    return handleNotFound(request);
  }
  
  return handleFeed(
    request,
    "ask",
    pageNumber,
    "No stories found",
    "We couldn't find that page of Ask HN posts.",
  );
};

export const config: Config = {
  method: ["GET"],
  path: "/ask/:page",
  cache: "manual",
};
