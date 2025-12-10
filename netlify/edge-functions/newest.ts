// newest.ts - Newest stories feed
import type { Config, Context } from "@netlify/edge-functions";
import { handleFeed, parsePositiveInt, redirect } from "./lib/handlers.ts";

export default (request: Request, context: Context) => {
  const page = context.params.page;
  
  // Bare /newest or /newest/ redirects to /newest/1
  if (!page) {
    return redirect("/newest/1");
  }
  
  const pageNumber = parsePositiveInt(page);
  if (pageNumber === null) {
    return redirect("/newest/1");
  }
  
  return handleFeed(
    request,
    "newest",
    pageNumber,
    "No stories found",
    "We couldn't find that page of new stories.",
  );
};

export const config: Config = {
  method: ["GET"],
  path: ["/newest", "/newest/:page"],
  cache: "manual",
};
