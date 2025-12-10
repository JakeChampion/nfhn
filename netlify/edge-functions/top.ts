// top.ts - Top stories feed
import type { Config, Context } from "@netlify/edge-functions";
import { handleFeed, parsePositiveInt, redirect } from "./lib/handlers.ts";

export default (request: Request, context: Context) => {
  const page = context.params.page;
  
  // Bare /top or /top/ redirects to /top/1
  if (!page) {
    return redirect("/top/1");
  }
  
  const pageNumber = parsePositiveInt(page);
  if (pageNumber === null) {
    return redirect("/top/1");
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
  path: ["/top", "/top/:page"],
  cache: "manual",
};
