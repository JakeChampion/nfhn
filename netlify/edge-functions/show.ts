// show.ts - Show HN feed
import type { Config, Context } from "@netlify/edge-functions";
import { handleFeed, parsePositiveInt, redirect } from "./lib/handlers.ts";

export default (request: Request, context: Context) => {
  const page = context.params.page;
  
  // Bare /show or /show/ redirects to /show/1
  if (!page) {
    return redirect("/show/1");
  }
  
  const pageNumber = parsePositiveInt(page);
  if (pageNumber === null) {
    return redirect("/show/1");
  }
  
  return handleFeed(
    request,
    "show",
    pageNumber,
    "No stories found",
    "We couldn't find that page of Show HN posts.",
  );
};

export const config: Config = {
  method: ["GET"],
  path: ["/show", "/show/:page"],
  cache: "manual",
};
